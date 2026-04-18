from __future__ import annotations

from pathlib import Path
import os

from langchain_core.prompts import PromptTemplate
from langchain_ollama import ChatOllama
from langchain.schema import (
    HumanMessage,
    SystemMessage,
    AIMessage,
)

from core.knowledgebase import constants


class TextAnalizer:
    def __init__(self: TextAnalizer) -> None:

        self.model = ChatOllama(
            model=constants.LLM_MODEL_NAME,
            base_url=constants.OLLAMA_BASE_URL,
            temperature=constants.LLM_MODEL_TEMPERATURE,
            think=False,
            num_predict=512,
        )
        self.kg_model = ChatOllama(
            model=constants.LLM_MODEL_NAME,
            base_url=constants.OLLAMA_BASE_URL,
            temperature=0.3,
            num_predict=1024,
        )

        self.prompt_names = [
            'prompt_generate', 'system_message_generate',
            'prompt_update', 'system_message_update',
            'prompt_question', 'system_message_question',
            'prompt_explain', 'system_message_explain',
            'prompt_optimize', 'system_message_optimize',
            'prompt_debug', 'system_message_debug',
        ]
        self.prompts = {}
        self.init_prompts()

        self.messages = []

        return

    def init_prompts(self: TextAnalizer) -> None:

        for prompt_name in self.prompt_names:
            prompt_path = Path(os.path.join(
                os.path.dirname(__file__), 'prompts', prompt_name))
            prompt_text = prompt_path.read_text()
            prompt_template = PromptTemplate.from_template(prompt_text)
            self.prompts[prompt_name] = prompt_template
        return

    _KG_SYSTEM = (
        "You are a TEXT ANALYSIS assistant. Do NOT generate code. Do NOT generate prose.\n"
        "Task: extract a knowledge graph from the passage below.\n"
        "Output ONLY lines in these two formats — nothing else:\n"
        "  NODE|Label|Name\n"
        "  REL|FromName|RELATIONSHIP_TYPE|ToName\n\n"
        "LABELS — choose the most specific one:\n"
        "  Technology = software, platform, tool, or system (Discord, Signal, Python, iPhone)\n"
        "  Role = person, human actor, or named group of people (Napoleon, Law Enforcement, User)\n"
        "  Concept = abstract idea, phenomenon, or property (Privacy, Encryption, Trust, Democracy)\n"
        "  Process = named procedure or method (Military Campaign, Court Order, Indexing)\n"
        "  Output = artifact produced (Report, Document, Law, Policy)\n"
        "  Entity = anything else that does not fit the above\n\n"
        "RELATIONSHIP_TYPE — a verb or verb phrase taken DIRECTLY from the passage, in UPPER_SNAKE_CASE.\n"
        "  WRONG: THREATENS, USES, HAS, IS_RELATED_TO, AFFECTS\n"
        "  RIGHT: COULD_EXPOSE, CAN_COMPEL, LACKS, PROVIDES, INITIATED\n\n"
        "RULES:\n"
        "1. Extract ALL meaningful entities and concepts.\n"
        "2. Node Name MUST be a short noun phrase, 1–5 words, Title Case. NEVER a full sentence.\n"
        "   WRONG: 'Law enforcement could compel Discord to intercept a call'\n"
        "   RIGHT:  NODE|Role|Law Enforcement  and  NODE|Concept|Court Order\n"
        "3. No markdown, no code, no explanations, no blank lines — only NODE and REL lines.\n"
        "4. Every entity used in a REL line MUST first appear as a NODE line — use the exact same Name, spaces only, no underscores.\n"
        "5. Extract ALL relationships — for every meaningful connection between two entities in the passage, output a REL line.\n"
        "6. Only extract relationships explicitly stated in the passage — do NOT infer or imply connections.\n\n"
        "EXAMPLE output for a passage about Napoleon:\n"
        "NODE|Role|Napoleon\n"
        "NODE|Process|Liberal Reforms\n"
        "NODE|Role|Military Commanders\n"
        "NODE|Process|Military Campaigns\n"
        "NODE|Role|Military Academies\n"
        "REL|Napoleon|INITIATED|Liberal Reforms\n"
        "REL|Napoleon|IS_CONSIDERED_AMONG|Military Commanders\n"
        "REL|Military Academies|STILL_STUDY|Military Campaigns"
    )

    _KG_UPDATE_SYSTEM = (
        "Extend a knowledge graph with NEW entities and relationships from the text. "
        "Output ONLY lines in these two formats — nothing else:\n"
        "  NODE|Label|Name\n"
        "  REL|FromName|RELATIONSHIP_TYPE|ToName\n\n"
        "LABELS — Role, Concept, Technology, Process, Output, Entity.\n"
        "RELATIONSHIP_TYPE — verb phrase from the text in UPPER_SNAKE_CASE.\n\n"
        "RULES:\n"
        "1. Only output entities NOT already in the existing graph.\n"
        "2. Node Name MUST be a short noun phrase, 1–5 words, Title Case. NEVER a full sentence.\n"
        "3. No markdown, no explanations, no blank lines — only NODE and REL lines.\n"
    )

    @staticmethod
    def _parse_kg_output(raw: str, repo_path: str, file_path: str) -> str:
        """Convert NODE|Label|Name / REL|From|TYPE|To lines into Cypher MERGE statements."""
        import re as _re
        raw = _re.sub(r"<\|[^|>]+\|>", "", raw)  # strip granite special tokens like <|file_sep|>

        def safe(s: str) -> str:
            return s.replace("\\", "\\\\").replace("'", "\\'")

        def normalize(name: str) -> str:
            return name.strip().replace("_", " ").title()

        node_lines = []
        rel_entries = []
        defined_names: set = set()

        for line in raw.splitlines():
            line = line.strip()
            if line.startswith("NODE|"):
                parts = line.split("|", 3)
                if len(parts) >= 3:
                    _, label, name = parts[0], parts[1], parts[2]
                    label = label.strip() or "Entity"
                    name = normalize(name)
                    if name:
                        defined_names.add(name)
                        node_lines.append(
                            f"MERGE (n {{name: '{safe(name)}', "
                            f"repo_path: '{safe(repo_path)}', file_path: '{safe(file_path)}'}}) "
                            f"SET n:{label}"
                        )
            elif line.startswith("REL|"):
                parts = line.split("|", 4)
                if len(parts) >= 4:
                    _, src, rel_type, dst = parts[0], parts[1], parts[2], parts[3]
                    src = normalize(src)
                    rel_type = rel_type.strip().upper().replace(" ", "_")
                    dst = normalize(dst)
                    if src and rel_type and rel_type != "REL" and dst:
                        rel_entries.append((src, rel_type, dst))

        valid_rels = [
            f"MATCH (a {{name: '{safe(src)}'}}), (b {{name: '{safe(dst)}'}}) "
            f"MERGE (a)-[:{rel_type}]->(b)"
            for src, rel_type, dst in rel_entries
            if src in defined_names and dst in defined_names
        ]

        return "\n".join(node_lines + valid_rels)

    _RETRY_MSG = (
        "Your response contained no NODE| or REL| lines.\n"
        "Output ONLY lines in EXACTLY these formats, nothing else:\n"
        "NODE|Label|Name\n"
        "REL|FromName|RELATIONSHIP_TYPE|ToName"
    )

    def _invoke_with_retry(self: TextAnalizer, repo_path: str, file_path: str) -> str:
        raw = self.kg_model.invoke(self.messages).content
        print(f"KG raw ({len(raw)}c): {repr(raw[:400])}", flush=True)
        result = self._parse_kg_output(raw, repo_path, file_path)
        if not result:
            self.messages += [AIMessage(content=raw), HumanMessage(content=self._RETRY_MSG)]
            raw = self.kg_model.invoke(self.messages).content
            print(f"KG retry raw ({len(raw)}c): {repr(raw[:400])}", flush=True)
            result = self._parse_kg_output(raw, repo_path, file_path)
        return result

    def text_to_cypher_create(self: TextAnalizer, text: str, repo_path: str, file_path: str) -> str:
        if not text.strip():
            return ""
        self.messages = [
            SystemMessage(content=self._KG_SYSTEM),
            HumanMessage(content=f"Passage:\n{text}")
        ]
        return self._invoke_with_retry(repo_path, file_path)

    def data_and_text_to_cypher_update(self: TextAnalizer, data: str, text: str, repo_path: str, file_path: str) -> str:
        self.messages = [
            SystemMessage(content=self._KG_UPDATE_SYSTEM),
            HumanMessage(content=(
                f"Existing graph:\n{data}\n\n"
                f"New passage:\n{text}"
            ))
        ]
        return self._invoke_with_retry(repo_path, file_path)

    def generate_questions(self: TextAnalizer, text: str) -> str:
        self.messages = [
            SystemMessage(
                content=self.prompts['system_message_question'].format()),
            HumanMessage(
                content=self.prompts['prompt_question'].format(prompt=text))
        ]
        return self.model.invoke(self.messages).content

    def _general_code_question(self: TextAnalizer, prompt_name: str, text: str) -> str:
        self.messages = [
            SystemMessage(
                content=self.prompts[f'system_message_{prompt_name}'].format()),
            HumanMessage(
                content=self.prompts[f'prompt_{prompt_name}'].format(code=text))
        ]
        return self.model.invoke(self.messages).content

    def optimize_code_style(self: TextAnalizer, text: str) -> str:
        return self._general_code_question('optimize', text)

    def explain_code(self: TextAnalizer, text: str) -> str:
        return self._general_code_question('explain', text)

    def debug_code(self: TextAnalizer, text: str) -> str:
        return self._general_code_question('debug', text)


if __name__ == '__main__':

    ta = TextAnalizer()

    example_reponame = 'History'
    example_repopath = os.path.join(os.path.dirname(
        __file__), 'examples', example_reponame)

    example_fname = 'napoleon.txt'
    example_fpath = os.path.join(example_repopath, example_fname)

    example_text = Path(example_fpath).read_text()

    ret = ta.text_to_cypher_create(
        example_text, example_repopath, example_fname)
    print(ret)

    questionable_text = """Napoleon initiated many liberal reforms that have persisted, 
    and is considered one of the greatest ever military commanders. His campaigns are still studied at military academies worldwide."""
    ret = ta.generate_questions(questionable_text)
    print(ret)

    code = """
        def evens(l):
            return [x for x in l if x % 2 == 0]
    """

    ret = ta.explain_code(code)
    print(ret)
