from typing import Union, List
import pathlib

from enum import Enum
from core.knowledgebase.Utils import Utils

from fastapi import FastAPI, status, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel

from core.knowledgebase import constants

from core.knowledgebase.Initializer import Initializer
from core.knowledgebase.MemgraphManager import MemgraphManager
from core.knowledgebase.TextAnalizer import TextAnalizer, get_generation_progress, cancel_generation_progress
from core.knowledgebase.QueryAgents import NotesQueryAgent, CodeQueryAgent

from core.knowledgebase.notes.VaultManager import VaultManager
from core.knowledgebase.notes.CollectionManager import CollectionManager
from core.knowledgebase.notes.Searcher import Searcher
from core.knowledgebase.indexers.KGIndexer import KGIndexer

from core.knowledgebase.code.APIRepoManager import APIRepoManager
from core.knowledgebase.code.LocalRepoManager import LocalRepoManager


class Type(Enum):
    NOTES = "Notes"
    CODE = "Code"


class Repo(BaseModel):
    path: str
    type: Union[Type, None] = None


class RemoteRepo(BaseModel):
    owner: str
    repo: str


class File(BaseModel):
    path: str
    type: Union[Type, None] = None
    content: Union[str, None] = None


class Question(BaseModel):
    repo: Repo
    prompt: str
    type: Union[Type, None] = None
    file_path: Union[str, None] = None
    note_content: Union[str, None] = None
    chat_context: list[str] = []


class ChatNode(BaseModel):
    name: str
    node_type: str = "Concept"
    related_to: str = ""
    relationship: str = "RELATED_TO"


class Answer(BaseModel):
    content: str
    node_ids: list[int] = []
    chat_nodes: list[ChatNode] = []


class Node(BaseModel):
    repo: Repo
    id: int
    regenerate: bool = False


class Sentence(BaseModel):
    repo: Repo
    content: str


class EdgeQuery(BaseModel):
    repo: Repo
    src_id: int
    dst_id: int


class Paragraph(BaseModel):
    content: str


app = FastAPI()
mm = MemgraphManager()
ta = TextAnalizer()


@app.on_event("startup")
def startup() -> None:
    if constants.MOCK and mm.check_if_db_empty():
        Initializer.init_vault_mock_data()
    return


@app.post("/knowledge_base/general/get_all_for_repo")
def get_all_for_repo(repo: Repo) -> Response:
    data = mm.export_data_for_repo_path(repo.path)
    if data:
        json_data = jsonable_encoder(data)
        return JSONResponse(content=json_data)
    else:
        return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.delete("/knowledge_base/general/delete_all_for_repo")
def delete_all_for_repo(repo: Repo) -> None:
    mm.delete_all_for_repo(repo.path)
    if repo.type == Type.NOTES:
        cm = CollectionManager(repo.path)
        cm.delete_all_from_collection()
    return


def _build_kg_summary(file_path: str) -> tuple[str, dict[int, str]]:
    try:
        local_mm = MemgraphManager()
        data = local_mm.export_data_for_file_path(file_path)
        if not data:
            return "", {}
        nodes = {item["id"]: item["properties"].get("name", f"node_{item['id']}")
                 for item in data if item.get("type") == "node"}
        edges = [(nodes.get(item["start"], "?"), item["label"], nodes.get(item["end"], "?"))
                 for item in data if item.get("type") == "relationship"]
        lines = []
        if nodes:
            lines.append("Entities: " + ", ".join(nodes.values()))
        if edges:
            lines.append("Relationships:")
            for src, rel, dst in edges:
                lines.append(f"  {src} --[{rel}]--> {dst}")
        return "\n".join(lines), nodes
    except Exception:
        return "", {}


def _words(s: str) -> set:
    return set(s.replace("-", " ").replace("_", " ").lower().split())


def _is_existing(name_lower: str, existing_lower: dict) -> bool:
    if name_lower in existing_lower:
        return True
    nw = _words(name_lower)
    if not nw:
        return False
    for ex in existing_lower:
        ew = _words(ex)
        if ew and (ew.issubset(nw) or nw.issubset(ew)):
            return True
    return False


def _find_existing(name_lower: str, existing_lower: dict):
    """Return canonical name from existing_lower via word-subset fuzzy match, or None."""
    if name_lower in existing_lower:
        return existing_lower[name_lower]
    nw = _words(name_lower)
    if not nw:
        return None
    for ex_l, ex_orig in existing_lower.items():
        ew = _words(ex_l)
        if ew and (ew.issubset(nw) or nw.issubset(ew)):
            return ex_orig
    return None


def _parse_chat_nodes(raw: str, node_map: dict, chat_context: list = None) -> list:
    existing_lower = {name.lower(): name for name in node_map.values()}
    for name in (chat_context or []):
        if name:
            existing_lower[name.lower()] = name
    declared: dict = {}
    relationships: dict = {}
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("NODE|"):
            parts = line.split("|", 2)
            if len(parts) == 3:
                label, name = parts[1].strip(), parts[2].strip()
                if name and not _is_existing(name.lower(), existing_lower):
                    declared[name.lower()] = (name, label)
        elif line.startswith("REL|"):
            parts = line.split("|", 3)
            if len(parts) == 4:
                from_n, rel, to_n = parts[1].strip(), parts[2].strip(), parts[3].strip()
                fl, tl = from_n.lower(), to_n.lower()
                existing_to = _find_existing(tl, existing_lower)
                existing_fr = _find_existing(fl, existing_lower)
                if fl in declared and existing_to and fl not in relationships:
                    relationships[fl] = (existing_to, rel)
                elif tl in declared and existing_fr and tl not in relationships:
                    relationships[tl] = (existing_fr, rel)
    return [
        ChatNode(
            name=orig, node_type=label,
            related_to=relationships.get(nl, ("", ""))[0],
            relationship=relationships.get(nl, ("", "RELATED_TO"))[1],
        )
        for nl, (orig, label) in declared.items()
    ]


@app.post("/knowledge_base/general/ask")
def ask_repo(question: Question) -> Answer:
    try:
        node_ids: list[int] = []
        note_content = question.note_content
        if not note_content and question.file_path:
            try:
                import pathlib
                note_content = pathlib.Path(question.file_path).read_text(errors="ignore")[:6000]
            except Exception:
                note_content = None

        if question.type == Type.NOTES and note_content:
            from langchain_ollama import ChatOllama
            llm = ChatOllama(
                model=constants.LLM_MODEL_NAME,
                base_url=constants.OLLAMA_BASE_URL,
                temperature=constants.LLM_MODEL_TEMPERATURE,
            )
            kg_summary, node_map = _build_kg_summary(question.file_path) if question.file_path else ("", {})
            kg_section = f"\n\nKnowledge graph for this note:\n{kg_summary}" if kg_summary else ""
            prompt = (
                f"The following is the content of the current note:\n\n"
                f"{note_content}"
                f"{kg_section}\n\n"
                f"Answer the following question using the note and its knowledge graph as your primary reference. Only answer if the question is relevant to the topics in the note — if it is completely unrelated, say it is out of scope. For questions that are relevant but not fully covered by the note, you may supplement with your general knowledge, clearly indicating what comes from your notes versus general knowledge:\n{question.prompt}"
            )
            result = llm.invoke(prompt).content
            result_lower = result.lower()
            node_ids = [nid for nid, name in node_map.items() if name.lower() in result_lower]
            chat_nodes: list[ChatNode] = []
            if node_map and kg_summary:
                ctx_str = ("\nPreviously mentioned: " + ", ".join(question.chat_context)) if question.chat_context else ""
                raw_entities = ta.extract_chat_entities(kg_summary + ctx_str, result)
                chat_nodes = _parse_chat_nodes(raw_entities, node_map, question.chat_context)
                if node_ids and chat_nodes:
                    mentioned = {nid: node_map[nid] for nid in node_ids if nid in node_map}
                    if mentioned:
                        for cn in chat_nodes:
                            if not cn.related_to:
                                cn_words = _words(cn.name.lower())
                                best, best_score = None, -1
                                for nname in mentioned.values():
                                    score = len(cn_words & _words(nname.lower()))
                                    if score > best_score:
                                        best_score, best = score, nname
                                cn.related_to = best or next(iter(mentioned.values()))
                                cn.relationship = "RELATED_TO"
            if not result or not result.strip():
                return Answer(content="I could not generate a response. Make sure the knowledge graph has been generated for this vault and that Ollama is running.")
            return Answer(content=result, node_ids=node_ids, chat_nodes=chat_nodes)
        elif question.type == Type.NOTES:
            na = NotesQueryAgent(question.repo.path, file_path=question.file_path)
            result, node_ids = na.ask_with_nodes(question.prompt)
        else:
            ca = CodeQueryAgent(question.repo.path)
            result = ca.ask(question.prompt)
        if not result or not result.strip():
            return Answer(content="I could not generate a response. Make sure the knowledge graph has been generated for this vault and that Ollama is running.")
        return Answer(content=result, node_ids=node_ids)
    except Exception as e:
        return Answer(content=f"Error: {e}")


@app.post("/knowledge_base/general/get_schema")
def get_schema(repo: Repo) -> Answer:
    return Answer(content=mm.get_schema_for_repo(repo.path))

# TODO: test with GPT4


@app.post("/knowledge_base/general/init_local_repo")
def init_repo(repo: Repo) -> None:
    if repo.type == Type.CODE:
        lrm = LocalRepoManager(repo.path)
        cypher = lrm.generate_cypher()
        mm.run_update_query(cypher)
        return
    vm = VaultManager(repo.path)
    vm.populate_vault()
    return


@app.post("/knowledge_base/general/delete_all")
def delete_all() -> None:
    cm = CollectionManager()
    mm.delete_all()
    cm.delete_all()
    return


@app.post("/knowledge_base/text_analizer/code/optimize_style")
def optimize_syle(paragraph: Paragraph) -> Answer:
    ta = TextAnalizer()
    return Answer(content=ta.optimize_code_style(paragraph.content))


@app.post("/knowledge_base/text_analizer/code/explain")
def explain_code(paragraph: Paragraph) -> Answer:
    ta = TextAnalizer()
    return Answer(content=ta.explain_code(paragraph.content))


@app.post("/knowledge_base/text_analizer/code/debug")
def debug_code(paragraph: Paragraph) -> Answer:
    ta = TextAnalizer()
    return Answer(content=ta.debug_code(paragraph.content))


@app.post("/knowledge_base/text_analizer/notes/generate_questions")
def generate_questions(paragraph: Paragraph) -> Answer:
    ta = TextAnalizer()
    return Answer(content=ta.generate_questions(paragraph.content))


@app.post("/knowledge_base/notes/get_for_path")
def get_for_path(file: File) -> Response:
    mm = MemgraphManager()
    data = mm.export_data_for_file_path(file.path)
    if data:
        json_data = jsonable_encoder(data)
        return JSONResponse(content=json_data)
    else:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

# TODO: test with GPT4


@app.put("/knowledge_base/notes/update_file")
def update_file(file: File) -> None:
    mm = MemgraphManager()
    repo_path = Utils.repo_path_from_file_path(file.path)

    cm = CollectionManager(repo_path)

    content = file.content or pathlib.Path(file.path).read_text(errors="ignore")
    if not content.strip():
        return

    if file.path.endswith("_knowledge_graph.md"):
        new_stmts = list(KGIndexer.parse(content, repo_path, file.path))
        if new_stmts:
            mm.delete_graph_for_file(file.path)
            cm.delete_file(file.path)
            for stmt in new_stmts:
                try:
                    mm.db.execute(stmt)
                except Exception as e:
                    print(f"WARN kg bridge: {e}\nSTMT: {stmt[:200]}")
    else:
        ta = TextAnalizer()
        mm.delete_graph_for_file(file.path)
        cm.delete_file(file.path)
        def _execute_chunk(cypher: str) -> None:
            try:
                mm.run_update_query(cypher)
            except Exception as e:
                print(f"WARN incremental KG write: {e}")
        res_queries = ta.text_to_cypher_chunked(content, repo_path, file.path, on_chunk=_execute_chunk)
        if not res_queries.strip():
            print(f"WARN: KG extraction returned nothing for {file.path}")

    try:
        mm.db.execute("MATCH (n) WHERE n.file_path IS NULL DETACH DELETE n")
    except Exception as e:
        print(f"WARN: post-processing delete failed: {e}")

    try:
        cm.add_file(file.path)
    except Exception as e:
        print(f"WARN: cm.add_file failed (embeddings): {e}")

    try:
        mm.update_embeddings(file.path)
    except Exception as e:
        print(f"WARN: update_embeddings failed: {e}")

    return

@app.get("/knowledge_base/notes/generation_progress")
def generation_progress(path: str):
    progress = get_generation_progress(path)
    if progress is None:
        return {"status": "idle"}
    current = progress["current"]
    total = progress["total"]
    chunk_tokens = progress.get("chunk_tokens", 0)
    # Smooth percent: chunks done + fraction of current chunk based on token count.
    # num_predict=1024 is the cap; clamp to 0.95 within a chunk so it never hits
    # the next chunk boundary early.
    token_fraction = min(chunk_tokens / 1024, 0.95) if total > 0 else 0
    raw = (current + token_fraction) / total if total else 0
    percent = min(round(raw * 100), 99)  # cap at 99 until actually done
    preview_nodes = progress.get("preview_nodes", [])
    preview_edges = progress.get("preview_edges", [])
    return {"status": "generating", "percent": percent, "preview_nodes": preview_nodes, "preview_edges": preview_edges}


@app.post("/knowledge_base/notes/cancel_generation")
def cancel_generation_api(path: str) -> None:
    cancel_generation_progress(path)


# TODO: test with GPT4


@app.put("/knowledge_base/notes/add_file")
def add_file(file: File) -> None:
    mm = MemgraphManager()
    repo_path = Utils.repo_path_from_file_path(file.path)

    cm = CollectionManager(repo_path)

    content = file.content or pathlib.Path(file.path).read_text(errors="ignore")
    if not content.strip():
        return

    if file.path.endswith("_knowledge_graph.md"):
        for stmt in KGIndexer.parse(content, repo_path, file.path):
            try:
                mm.db.execute(stmt)
            except Exception as e:
                print(f"WARN kg bridge: {e}\nSTMT: {stmt[:200]}")
    else:
        ta = TextAnalizer()
        def _execute_chunk(cypher: str) -> None:
            try:
                mm.run_update_query(cypher)
            except Exception as e:
                print(f"WARN incremental KG write: {e}")
        ta.text_to_cypher_chunked(content, repo_path, file.path, on_chunk=_execute_chunk)

    try:
        mm.db.execute("MATCH (n) WHERE n.file_path IS NULL DETACH DELETE n")
    except Exception as e:
        print(f"WARN: post-processing delete failed: {e}")

    try:
        cm.add_file(file.path)
    except Exception as e:
        print(f"WARN: cm.add_file failed (embeddings): {e}")

    try:
        mm.update_embeddings(file.path)
    except Exception as e:
        print(f"WARN: update_embeddings failed: {e}")

    return


@app.delete("/knowledge_base/notes/delete_file")
def delete_file(file: File) -> None:
    repo_path = Utils.repo_path_from_file_path(file.path)
    mm = MemgraphManager()
    cm = CollectionManager(repo_path)
    mm.delete_graph_for_file(file.path)
    cm.delete_file(file.path)
    return


@app.post("/knowledge_base/notes/rename_file")
def rename_file(old_file: File, new_file: File) -> None:
    repo_path = Utils.repo_path_from_file_path(old_file.path)
    collection_name = Utils.collection_name_from_repo_path(repo_path)
    if not collection_name or collection_name == ".":
        return
    mm = MemgraphManager()
    cm = CollectionManager(repo_path)
    mm.rename_file(old_file.path, new_file.path)
    cm.rename_file(old_file.path, new_file.path)
    return


@app.post("/knowledge_base/notes/node_to_sentences")
def node_to_sentences(node: Node) -> List[Sentence]:
    searcher = Searcher(node.repo.path)
    return [Sentence(repo=node.repo, content=c) for c in searcher.node_id_to_sentences(node.id)]


@app.post("/knowledge_base/notes/node_summary")
def node_summary(node: Node) -> Answer:
    try:
        mm = MemgraphManager()
        description = mm.describe_node(node.id)
        searcher = Searcher(node.repo.path)
        sentences = searcher.node_id_to_sentences(node.id)
        ta = TextAnalizer()
        summary = ta.summarize_node(description, sentences, variation=node.regenerate)
        return Answer(content=summary)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/knowledge_base/notes/edge_to_sentences")
def edge_to_sentences(edge: EdgeQuery) -> List[Sentence]:
    searcher = Searcher(edge.repo.path)
    return [Sentence(repo=edge.repo, content=c) for c in searcher.edge_id_to_sentences(edge.src_id, edge.dst_id)]


@app.post("/knowledge_base/notes/sentence_to_nodes")
def sentence_to_nodes(sentence: Sentence) -> List[Node]:
    searcher = Searcher(sentence.repo.path)
    return [Node(repo=sentence.repo, id=i) for i in searcher.sentence_to_node_ids(sentence.content)]


@app.post("/knowledge_base/notes/suggest_link")
def suggest_link(sentence: Sentence) -> File:
    searcher = Searcher(sentence.repo.path)
    return File(path=searcher.most_probable_filename_for_text(query_text=sentence.content))


@app.post("/knowledge_base/code/init_repo_from_api")
def init_repo_from_api(remote_repo: RemoteRepo) -> None:
    mm = MemgraphManager()
    arm = APIRepoManager(remote_repo.owner, remote_repo.repo)
    cypher = arm.generate_cypher()
    mm.run_update_query(cypher)
    return


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
