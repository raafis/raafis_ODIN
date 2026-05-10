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

import uuid

from core.knowledgebase import constants

_generation_progress: dict = {}


def get_generation_progress(file_path: str) -> dict | None:
    return _generation_progress.get(file_path, None)


def cancel_generation_progress(file_path: str) -> None:
    if file_path in _generation_progress:
        _generation_progress[file_path]["cancelled"] = True


def _is_stale(file_path: str, gen_id: str) -> bool:
    p = _generation_progress.get(file_path)
    return p is None or p.get("cancelled") or p.get("gen_id") != gen_id


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
            temperature=0.1,
            think=False,
            num_predict=3072,
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
        self._last_raw: str = ""

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
        "Output ONLY lines in these four formats — nothing else:\n"
        "  CONTEXT: <one sentence domain summary — required, written first>\n"
        "  NODE|Label|Name\n"
        "  ALIAS|CanonicalName|AlternateName\n"
        "  REL|FromName|RELATIONSHIP_TYPE|ToName\n\n"
        "BEFORE EXTRACTION — write exactly one line first:\n"
        "  CONTEXT: <one sentence: what domain/field is this passage about, and how do its key concepts relate>\n"
        "  This anchors your domain understanding. It is discarded downstream — it does not count toward your node/rel output.\n\n"
        "LABELS — choose the most specific one:\n"
        "  Person = individual human (Caesar, Napoleon, Cato the Younger)\n"
        "  Organisation = group, institution, or named body (Roman Senate, First Triumvirate, Law Enforcement)\n"
        "  Location = geographic place or region (Rome, Gaul, Egypt)\n"
        "  Event = named historical occurrence or episode (Gallic Wars, Civil War, Battle of Waterloo)\n"
        "  Concept = abstract idea, phenomenon, or property (Privacy, Democracy, Encryption, Trust)\n"
        "  Technology = software, platform, tool, or system (Discord, Signal, Python, iPhone)\n"
        "  Output = artifact produced (Report, Document, Law, Policy)\n"
        "  Entity = anything else that does not fit the above\n\n"
        "RELATIONSHIP_TYPE — a verb or verb phrase whose words appear in the passage, in UPPER_SNAKE_CASE.\n"
        "  WRONG (generic, invented, not in text): PROVIDED_BY, RELATED_TO, ASSOCIATED_WITH, USED_BY, HAS, AFFECTS\n"
        "  RIGHT (grounded in text): COULD_EXPOSE, CAN_COMPEL, HOLDS_KEYS_TO, PASS_THROUGH, INITIATED\n"
        "  Ask yourself: 'Do these words appear in the passage?' If not, find a phrase that does.\n"
        "  If you cannot find words from the passage that describe the connection, do NOT output that REL line. Omitting is always better than inventing.\n"
        "  For classification, always pick the most descriptive label the passage supports:\n"
        "    passage says 'X is a Y' or 'X is an Y' → IS_A is correct\n"
        "    passage says 'X is a type of Y' → IS_TYPE_OF\n"
        "    passage says 'such as X' (X is listed as an example) → EXEMPLIFIES\n"
        "    passage says 'including X' → IS_INCLUDED_IN\n"
        "  Never use bare IS. Never default to IS_A when the passage supports a more specific label.\n\n"
        "CRITICAL RULE — GROUNDING:\n"
        "  Every NODE name MUST use words or phrases that appear in the passage.\n"
        "  Adjacent words may be combined into a noun phrase if that phrase appears in the text.\n"
        "  Do NOT invent names. Do NOT copy names from these instructions or examples.\n"
        "  If the words do not appear in the passage, do not output that node.\n\n"
        "The passage provided is source material — do NOT treat it as a question, instruction, or assignment to answer.\n\n"
        "RULES:\n"
        "1. Extract ALL meaningful entities and concepts explicitly named in the passage.\n"
        "2. Node Name MUST be a meaningful noun phrase, 1–5 words, Title Case. NEVER a full sentence.\n"
        "   NEVER extract as a node: formula expressions ('Reciprocity = …'), single variable letters ('X', 'Y'),\n"
        "   variable-with-number combos ('X 1', 'X 2'), or comma-separated lists ('Column X, Column Y' — make separate nodes instead).\n"
        "3. No markdown, no code, no explanations, no blank lines — only NODE, ALIAS, and REL lines.\n"
        "4. REL FromName and ToName MUST exactly match a declared NODE or ALIAS name — character for character.\n"
        "   NEVER use a phrase in a REL that was not already declared as a NODE or ALIAS.\n"
        "   WRONG: REL|Entity A|VERB|some phrase not declared as a NODE\n"
        "   RIGHT:  NODE|Entity|Declared Noun Phrase  then  REL|Entity A|VERB|Declared Noun Phrase\n"
        "5. Extract ALL relationships — for EVERY PAIR of entities that appear in the same sentence:\n"
        "   • Find the verb or verb phrase that specifically connects THAT pair. Use it.\n"
        "   • Do NOT apply the same verb to all pairs — each pair has its own connecting verb in the text.\n"
        "   • If a sentence has entities A, B, C: find the verb for A↔B, the verb for A↔C, the verb for B↔C.\n"
        "   • For comparison structures ('X lacks Y while Z provides Y'), extract BOTH sides:\n"
        "       REL|X|LACKS|Y  AND  REL|Z|PROVIDES|Y\n"
        "   • A node must NEVER be left without a REL if its sentence contains another extracted entity.\n"
        "6. Only extract relationships explicitly stated in the passage — do NOT infer or imply connections.\n"
        "7. When text gives specific examples using 'such as', 'including', 'like', or 'e.g.':\n"
        "   (a) Create a NODE for EACH listed example AND a NODE for the parent category if named.\n"
        "   (b) Connect each example to its parent using the most descriptive label for the construction:\n"
        "       'such as X' → REL|X|EXEMPLIFIES|Parent\n"
        "       'including X' → REL|X|IS_INCLUDED_IN|Parent\n"
        "       'X is a Y' → REL|X|IS_A|Parent\n"
        "       'X is a type of Y' → REL|X|IS_TYPE_OF|Parent\n"
        "   These classification labels may be used even when those exact words don't appear in the text —\n"
        "   they are the only exception to the grounding rule.\n"
        "8. When in doubt, include rather than omit — extract every explicitly named entity or concept, even if it seems secondary.\n"
        "9. If an entity is referred to by a shorter or alternate name in the passage, declare an ALIAS immediately after its NODE:\n"
        "     NODE|Person|Formal Full Name\n"
        "     ALIAS|Formal Full Name|Short Name\n"
        "   Use the canonical (longest, most formal) name as the NODE Name.\n"
        "10. Self-review: after writing all NODE and REL lines, scan your NODE list. For any NODE that\n"
        "    has no REL line yet, re-read the passage for a text-grounded connection to another extracted entity.\n"
        "    If you find one, add the missing REL. Only skip if the passage truly has no explicit connection for that node.\n\n"
        "EXAMPLE (format only — these placeholder names must NOT appear in your output):\n"
        "NODE|Person|Formal Full Name\n"
        "ALIAS|Formal Full Name|Short Name\n"
        "NODE|Concept|Abstract Concept\n"
        "NODE|Organisation|Named Group\n"
        "NODE|Event|Named Episode\n"
        "REL|Formal Full Name|VERB_FROM_TEXT|Abstract Concept\n"
        "REL|Short Name|VERB_FROM_TEXT|Named Group\n"
        "REL|Named Group|VERB_FROM_TEXT|Named Episode"
    )

    _KG_UPDATE_SYSTEM = (
        "Extend a knowledge graph with NEW entities and relationships from the text. "
        "Output ONLY lines in these two formats — nothing else:\n"
        "  NODE|Label|Name\n"
        "  REL|FromName|RELATIONSHIP_TYPE|ToName\n\n"
        "LABELS — Person, Organisation, Location, Event, Concept, Technology, Output, Entity.\n"
        "RELATIONSHIP_TYPE — verb phrase from the text in UPPER_SNAKE_CASE.\n\n"
        "RULES:\n"
        "1. Only output entities NOT already in the existing graph.\n"
        "2. Node Name MUST be a short noun phrase, 1–5 words, Title Case. NEVER a full sentence.\n"
        "3. No markdown, no explanations, no blank lines — only NODE and REL lines.\n"
    )

    @staticmethod
    def _match_node_sentences(sentences: list, name: str) -> list:
        import re as _re
        _STOP = {"a","an","the","of","in","at","to","for","and","or","with","by","is","are","was","were"}
        words = [_re.escape(w) for w in name.lower().split() if w]
        if words:
            pat = _re.compile(r'[\s\-_/]+'.join(words), _re.IGNORECASE)
            hits = [s for s in sentences if pat.search(s)]
            if hits:
                return hits[:3]
        sig = [w.lower() for w in name.split() if w.lower() not in _STOP] or name.lower().split()
        wpats = [_re.compile(r'\b' + _re.escape(w) + r'\b', _re.IGNORECASE) for w in sig]
        if wpats:
            hits = [s for s in sentences if all(p.search(s) for p in wpats)]
            if hits:
                return hits[:3]
            if len(wpats) > 2:
                t = len(wpats) - 1
                hits = [s for s in sentences if sum(1 for p in wpats if p.search(s)) >= t]
                if hits:
                    return hits[:3]
            # Level 4: greedy — top sentences by overlap count, min 2 matching words
            scored = sorted(
                ((s, sum(1 for p in wpats if p.search(s))) for s in sentences),
                key=lambda x: -x[1]
            )
            hits = [s for s, cnt in scored if cnt >= 2]
            if hits:
                return hits[:3]
            # Level 5: rarest-word fallback — most distinctive word with ≥1 sentence match
            word_freqs = sorted(
                [(p, sum(1 for s in sentences if p.search(s))) for p in wpats],
                key=lambda x: x[1]
            )
            for p, cnt in word_freqs:
                if cnt > 0:
                    return [s for s in sentences if p.search(s)][:3]
        return []

    @staticmethod
    def _parse_kg_output(raw: str, repo_path: str, file_path: str, seed_names: set | None = None, text: str = "") -> str:
        """Convert NODE|Label|Name / REL|From|TYPE|To lines into Cypher MERGE statements."""
        import re as _re
        raw = _re.sub(r"<\|[^|>]+\|>", "", raw)  # strip granite special tokens like <|file_sep|>

        _sent_list: list = []
        if text:
            try:
                import nltk
                _sent_list = nltk.tokenize.sent_tokenize(text)
            except Exception:
                _sent_list = _re.split(r'(?<=[.!?])\s+', text)

        _sent_embs: list = []
        if _sent_list:
            try:
                from core.knowledgebase.notes.Embeddings import Embeddings as _Emb
                _sent_embs = [_Emb.get_embedding(s) for s in _sent_list]
            except Exception:
                pass

        def safe(s: str) -> str:
            return s.replace("\\", "\\\\").replace("'", "\\'")

        def safe_sent(s: str) -> str:
            return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ").replace("\r", " ").strip()

        def normalize(name: str) -> str:
            import re as _re
            name = name.strip()
            name = _re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', name)       # camelCase → camel Case
            name = _re.sub(r'(?<=[A-Z])(?=[A-Z][a-z])', ' ', name)  # XMLParser → XML Parser
            name = _re.sub(r'(?<=[a-zA-Z])(?=[0-9])', ' ', name)    # word1 → word 1
            name = _re.sub(r'(?<=[0-9])(?=[a-zA-Z])', ' ', name)    # 1word → 1 word
            name = name.replace("_", " ").replace("-", " ").replace("/", " ")
            name = _re.sub(r'\s*\([^)]*\)', '', name).strip()
            name = _re.sub(r'\s+', ' ', name)
            return name.title()

        def _is_valid_node_name(name: str) -> bool:
            if not name or len(name) < 3:
                return False
            if '=' in name or ',' in name:
                return False
            if _re.match(r'^[A-Za-z]\s*\d+$', name):  # "X 1", "Y 2"
                return False
            return True

        node_lines = []
        rel_entries = []
        defined_names: set = set(seed_names) if seed_names else set()
        alias_map: dict = {}  # alternate_name → canonical_name

        _valid_labels = {
            "Person", "Organisation", "Location", "Event",
            "Concept", "Technology", "Output", "Entity",
        }

        for line in raw.splitlines():
            line = line.strip()
            if line.startswith("NODE|"):
                parts = line.split("|", 3)
                if len(parts) >= 3:
                    _, label, name = parts[0], parts[1], parts[2]
                    label = label.strip()
                    if label not in _valid_labels:
                        label = "Entity"
                    name = normalize(name)
                    if name and _is_valid_node_name(name):
                        name_lower = name.lower()
                        supersets = [n for n in defined_names if name_lower in n.lower() and name_lower != n.lower()]
                        if supersets:
                            alias_map[name] = max(supersets, key=len)
                        else:
                            defined_names.add(name)
                            sents = TextAnalizer._match_node_sentences(_sent_list, name) if _sent_list else []
                            if not sents and _sent_embs:
                                try:
                                    from core.knowledgebase.notes.Embeddings import Embeddings as _Emb
                                    name_emb = _Emb.get_embedding(name)
                                    def _cos(a, b):
                                        dot = sum(x*y for x,y in zip(a,b))
                                        na = sum(x*x for x in a)**0.5
                                        nb = sum(x*x for x in b)**0.5
                                        return dot/(na*nb) if na*nb > 0 else 0.0
                                    scored = sorted(
                                        zip(_sent_list, (_cos(name_emb, se) for se in _sent_embs)),
                                        key=lambda x: -x[1]
                                    )
                                    sents = [s for s, _ in scored[:3]]
                                except Exception:
                                    pass
                            sents_cypher = "[" + ", ".join(f"'{safe_sent(s)}'" for s in sents) + "]"
                            node_lines.append(
                                f"MERGE (n {{name: '{safe(name)}', "
                                f"repo_path: '{safe(repo_path)}', file_path: '{safe(file_path)}'}}) "
                                f"SET n:{label} SET n.source_sentences = {sents_cypher}"
                            )
            elif line.startswith("ALIAS|"):
                parts = line.split("|", 2)
                if len(parts) == 3:
                    canonical = normalize(parts[1])
                    alternate = normalize(parts[2])
                    if canonical and alternate and canonical in defined_names:
                        alias_map[alternate] = canonical
            elif line.startswith("REL|"):
                parts = line.split("|", 4)
                if len(parts) >= 4:
                    _, src, rel_type = parts[0], parts[1], parts[2]
                    # Handle malformed 5-part lines: REL|From|TYPE|Label|To → use last part as dst
                    dst = parts[4] if len(parts) == 5 else parts[3]
                    src = normalize(src)
                    rel_type = rel_type.strip().upper().replace(" ", "_")
                    dst = normalize(dst)
                    if src and rel_type and rel_type != "REL" and dst and src != dst:
                        rel_entries.append((src, rel_type, dst))

        def snap_to_defined(name: str) -> str:
            # 1. direct alias lookup
            resolved = alias_map.get(name, name)
            if resolved in defined_names:
                return resolved
            # 2. case-insensitive alias lookup
            name_lower = name.lower()
            alias_lower = {k.lower(): v for k, v in alias_map.items()}
            if name_lower in alias_lower:
                candidate = alias_lower[name_lower]
                if candidate in defined_names:
                    return candidate
            # 3. fuzzy substring snap against defined_names
            lower_map = {n.lower(): n for n in defined_names}
            if name_lower in lower_map:
                return lower_map[name_lower]
            candidates = [n for n in defined_names if n.lower() in name_lower]
            if candidates:
                return max(candidates, key=len)
            candidates = [n for n in defined_names if name_lower in n.lower()]
            if candidates:
                return min(candidates, key=len)
            return ""

        valid_rels = []
        for src, rel_type, dst in rel_entries:
            snapped_src = snap_to_defined(src)
            snapped_dst = snap_to_defined(dst)
            if snapped_src and snapped_dst and snapped_src != snapped_dst:
                valid_rels.append(
                    f"MATCH (a {{name: '{safe(snapped_src)}', file_path: '{safe(file_path)}'}}), "
                    f"(b {{name: '{safe(snapped_dst)}', file_path: '{safe(file_path)}'}}) "
                    f"WHERE a <> b "
                    f"MERGE (a)-[:{rel_type}]->(b)"
                )

        return "\n".join(node_lines + valid_rels)

    _RETRY_MSG = (
        "Your response contained no NODE| or REL| lines.\n"
        "Output ONLY lines in EXACTLY these formats, nothing else:\n"
        "NODE|Label|Name\n"
        "REL|FromName|RELATIONSHIP_TYPE|ToName"
    )

    def _stream_raw(self: TextAnalizer, file_path: str) -> str:
        raw = ""
        # Resume from current value so retries don't reset the counter backwards.
        token_count = _generation_progress.get(file_path, {}).get("chunk_tokens", 0)
        for token in self.kg_model.stream(self.messages):
            raw += token.content
            token_count += 1
            if file_path in _generation_progress:
                _generation_progress[file_path]["chunk_tokens"] = token_count
        self._last_raw = raw
        return raw

    @staticmethod
    def _passage_human_message(text: str) -> HumanMessage:
        return HumanMessage(content=(
            "The text below is source material, NOT a question to answer. "
            "Extract entities and relationships from it.\n\n"
            "PASSAGE:\n"
            "---\n"
            f"{text}\n"
            "---\n\n"
            "Start with your CONTEXT line, then output ALL NODE, ALIAS, and REL lines per the rules above. "
            "Your first line must start with 'CONTEXT:'. Extract comprehensively — do not stop early."
        ))

    def _invoke_with_retry(self: TextAnalizer, repo_path: str, file_path: str, text: str = "", seed_names: set | None = None) -> str:
        raw = self._stream_raw(file_path)
        print(f"KG raw ({len(raw)}c): {repr(raw[:400])}", flush=True)
        result = self._parse_kg_output(raw, repo_path, file_path, seed_names, text=text)
        if not result:
            if text:
                # Fresh retry: discard the wrong response, re-frame the passage explicitly
                self.messages = [
                    SystemMessage(content=self._KG_SYSTEM),
                    self._passage_human_message(text),
                ]
            else:
                self.messages += [AIMessage(content=raw), HumanMessage(content=self._RETRY_MSG)]
            raw = self._stream_raw(file_path)
            print(f"KG retry raw ({len(raw)}c): {repr(raw[:400])}", flush=True)
            result = self._parse_kg_output(raw, repo_path, file_path, seed_names, text=text)
        return result

    @staticmethod
    def _split_into_chunks(text: str, max_chars: int = 1500) -> list:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks, current, current_len = [], [], 0
        for para in paragraphs:
            if current_len + len(para) > max_chars and current:
                chunks.append("\n\n".join(current))
                current, current_len = [para], len(para)
            else:
                current.append(para)
                current_len += len(para) + 2
        if current:
            chunks.append("\n\n".join(current))
        return chunks or [text]

    def text_to_cypher_create(self: TextAnalizer, text: str, repo_path: str, file_path: str) -> str:
        if not text.strip():
            return ""
        self.messages = [
            SystemMessage(content=self._KG_SYSTEM),
            self._passage_human_message(text),
        ]
        return self._invoke_with_retry(repo_path, file_path, text)

    def data_and_text_to_cypher_update(self: TextAnalizer, data: str, text: str, repo_path: str, file_path: str) -> str:
        self.messages = [
            SystemMessage(content=self._KG_UPDATE_SYSTEM),
            HumanMessage(content=(
                f"Existing graph:\n{data}\n\n"
                "The text below is source material, NOT a question to answer.\n\n"
                f"New passage:\n{text}"
            ))
        ]
        return self._invoke_with_retry(repo_path, file_path, text)

    @staticmethod
    def _names_from_cypher(cypher: str) -> list:
        import re as _re
        return list(dict.fromkeys(_re.findall(r"name:\s*'([^']+)'", cypher)))

    @staticmethod
    def _orphan_names(accumulated: str) -> list:
        import re as _re
        node_names: set = set()
        connected: set = set()
        for line in accumulated.splitlines():
            line = line.strip()
            if line.startswith("MERGE"):
                m = _re.search(r"name:\s*'([^']+)'", line)
                if m:
                    node_names.add(m.group(1))
            elif line.startswith("MATCH"):
                pair = _re.findall(r"name:\s*'([^']+)'", line)
                if len(pair) == 2 and pair[0] in node_names and pair[1] in node_names:
                    connected.add(pair[0])
                    connected.add(pair[1])
        return [n for n in node_names if n not in connected]

    _ORPHAN_SYSTEM = (
        "You are a RELATIONSHIP EXTRACTOR. Your ONLY task is to output REL lines.\n"
        "Do NOT output any NODE lines — all nodes already exist.\n"
        "Output ONLY lines in this EXACT format — four fields separated by pipes:\n"
        "  REL|FromName|RELATIONSHIP_TYPE|ToName\n\n"
        "For each ORPHAN node you are given the passage context where it appears.\n"
        "Find a connection between the orphan and any other node in the provided node list.\n\n"
        "RELATIONSHIP_TYPE — use a verb or verb phrase directly from the provided passage sentences.\n"
        "  NEVER use: IS_RELATED_TO, RELATED_TO, ASSOCIATED_WITH, CONNECTED_TO, HAS, AFFECTS.\n"
        "  RIGHT: LACKS, EXPOSES, RELIES_ON, COMPARES_WITH, PROVIDES, INTERCEPTS, THREATENS\n"
        "  Classification labels (IS_A, IS_TYPE_OF, EXEMPLIFIES, IS_INCLUDED_IN) are permitted ONLY when\n"
        "  the passage explicitly states the classification ('X is a Y', 'such as X', 'including X').\n\n"
        "RULES:\n"
        "1. Find a verb or verb phrase in the passage that explicitly connects the orphan to another node.\n"
        "   Use that verb. This is the ONLY valid source for RELATIONSHIP_TYPE.\n"
        "2. If no verb in the passage connects the orphan to any node, output NOTHING for that orphan.\n"
        "   It is correct and acceptable to output no lines.\n"
        "3. FromName and ToName MUST be copied CHARACTER FOR CHARACTER from the provided node list.\n"
        "4. No markdown, no explanations, no blank lines — ONLY REL lines (or nothing at all).\n\n"
        "EXAMPLE — orphan 'Caesar', passage 'Caesar led the Roman legions into Gaul':\n"
        "  REL|Caesar|LED|Roman Legions"
    )

    @staticmethod
    def _sentences_for_orphans(text: str, orphans: list) -> dict:
        try:
            import nltk
            sentences = nltk.tokenize.sent_tokenize(text)
        except Exception:
            import re as _re
            sentences = _re.split(r'(?<=[.!?])\s+', text)
        result = {}
        for orphan in orphans:
            orphan_lower = orphan.lower()
            # also try hyphenated/underscore variants in case the name was normalized
            variants = {orphan_lower, orphan_lower.replace(" ", "-"), orphan_lower.replace(" ", "_")}
            hit_indices = [i for i, s in enumerate(sentences) if any(v in s.lower() for v in variants)]
            # include ±1 surrounding sentence for each hit to give cross-sentence context
            context_indices: list[int] = []
            for idx in hit_indices:
                for j in range(max(0, idx - 1), min(len(sentences), idx + 2)):
                    if j not in context_indices:
                        context_indices.append(j)
            context_indices.sort()
            result[orphan] = [sentences[i].strip() for i in context_indices[:6]]
        return result

    @staticmethod
    def _extract_context_line(raw: str) -> str:
        for line in raw.splitlines():
            if line.strip().startswith("CONTEXT:"):
                return line.strip()
        return ""

    def _connect_orphans(
        self: TextAnalizer, text: str, accumulated: str, orphans: list,
        repo_path: str, file_path: str, context_lines: list | None = None
    ) -> str:
        import re as _re

        all_names = set(self._names_from_cypher(accumulated))
        all_lower = {n.lower(): n for n in all_names}

        def snap(name: str) -> str:
            if name in all_names:
                return name
            name_lower = name.lower()
            if name_lower in all_lower:
                return all_lower[name_lower]
            candidates = [n for n in all_names if n.lower() in name_lower]
            if candidates:
                return max(candidates, key=len)
            candidates = [n for n in all_names if name_lower in n.lower()]
            if candidates:
                return min(candidates, key=len)
            return name

        all_names_list = "\n".join(f"- {n}" for n in sorted(all_names))

        orphan_sentences = self._sentences_for_orphans(text, orphans)
        orphan_context_parts = []
        for orphan in orphans:
            sents = orphan_sentences.get(orphan, [])
            if sents:
                sent_block = "\n".join(f'  "{s}"' for s in sents)
                orphan_context_parts.append(f"ORPHAN: {orphan}\nSENTENCES:\n{sent_block}")
            else:
                orphan_context_parts.append(f"ORPHAN: {orphan}\nSENTENCES: (not found in text)")
        orphan_context = "\n\n".join(orphan_context_parts)

        domain_prefix = ""
        if context_lines:
            domain_prefix = "Domain context from this note (use this to understand how concepts relate):\n"
            domain_prefix += "\n".join(context_lines) + "\n\n"

        self.messages = [
            SystemMessage(content=self._ORPHAN_SYSTEM),
            HumanMessage(content=(
                domain_prefix
                + f"Orphan nodes and their passage context:\n\n"
                f"{orphan_context}\n\n"
                f"ALL valid node names (use ONLY these, copied exactly):\n"
                f"{all_names_list}\n\n"
                "For each orphan, output REL lines connecting it to other nodes based on the passage context above.\n"
                "If the passage provides no basis for a connection, output nothing for that orphan."
            ))
        ]
        raw = self._stream_raw(file_path)
        print(f"Orphan raw ({len(raw)}c): {repr(raw[:400])}", flush=True)

        def safe(s: str) -> str:
            return s.replace("\\", "\\\\").replace("'", "\\'")

        def norm(name: str) -> str:
            name = name.strip().replace("_", " ")
            name = _re.sub(r'\s*\([^)]*\)', '', name).strip()
            return name.title()

        match_lines = []
        for line in raw.splitlines():
            line = line.strip()
            if not line.startswith("REL|"):
                continue
            parts = [p.strip() for p in line.split("|")]

            if len(parts) == 3:
                continue  # no relationship type — skip rather than invent
            elif len(parts) == 4:
                src = snap(norm(parts[1]))
                mid = parts[2]
                dst = snap(norm(parts[3]))
                mid_norm = norm(mid)
                if mid_norm in all_names and dst not in all_names:
                    continue  # malformed field order — skip rather than invent
                else:
                    rel = mid.upper().replace(" ", "_").replace("-", "_")
                    if not rel or not _re.match(r'^[A-Z][A-Z0-9_]*$', rel):
                        continue  # invalid relationship type — skip rather than invent
            elif len(parts) == 5:
                src = snap(norm(parts[1]))
                rel = parts[2].upper().replace(" ", "_")
                dst = snap(norm(parts[4]))
            else:
                continue

            if src and dst:
                if src == dst:
                    continue  # self-loop — always wrong
                _blocked_orphan_rels = {
                    "IS_RELATED_TO", "RELATED_TO", "ASSOCIATED_WITH", "CONNECTED_TO",
                }
                if rel in _blocked_orphan_rels:
                    continue  # classification/generic labels not permitted from orphan pass
                match_lines.append(
                    f"MATCH (a {{name: '{safe(src)}', file_path: '{safe(file_path)}'}}), "
                    f"(b {{name: '{safe(dst)}', file_path: '{safe(file_path)}'}}) "
                    f"WHERE a <> b "
                    f"MERGE (a)-[:{rel}]->(b)"
                )

        return "\n".join(match_lines)

    def text_to_cypher_chunked(self: TextAnalizer, text: str, repo_path: str, file_path: str) -> str:
        chunks = self._split_into_chunks(text)
        total = len(chunks)
        my_gen_id = uuid.uuid4().hex
        _generation_progress[file_path] = {"current": 0, "total": total, "chunk_tokens": 0, "gen_id": my_gen_id}
        print(f"Chunked extraction: {total} chunks for {file_path}", flush=True)

        try:
            if total == 1:
                accumulated = self.text_to_cypher_create(chunks[0], repo_path, file_path)
            else:
                accumulated = self.text_to_cypher_create(chunks[0], repo_path, file_path)
                context_history = [self._extract_context_line(self._last_raw)]
                context_history = [c for c in context_history if c]
                _generation_progress[file_path]["current"] = 1
                _generation_progress[file_path]["chunk_tokens"] = 0

                for i, chunk in enumerate(chunks[1:], 2):
                    if _is_stale(file_path, my_gen_id):
                        return ""
                    print(f"Chunk {i}/{total}", flush=True)
                    existing_names = self._names_from_cypher(accumulated)
                    names_context = "\n".join(f"- {n}" for n in existing_names)
                    prior_context = "\n".join(context_history) if context_history else ""
                    self.messages = [
                        SystemMessage(content=self._KG_SYSTEM),
                        HumanMessage(content=(
                            (f"Context from earlier sections of this note:\n{prior_context}\n\n" if prior_context else "")
                            + f"These nodes are ALREADY in the graph — do NOT re-output them as NODE lines "
                            f"(unless you need them in a REL, in which case you MUST also output their NODE line). "
                            f"For ALL NEW entities in this chunk that are not in this list, output NODE lines as usual:\n{names_context}\n\n"
                            "The text below is source material, NOT a question to answer. "
                            "Extract entities and relationships from it.\n\n"
                            "PASSAGE:\n"
                            "---\n"
                            f"{chunk}\n"
                            "---\n\n"
                            "Start with your CONTEXT line, then output ALL NODE, ALIAS, and REL lines per the rules above. "
                            "Your first line must start with 'CONTEXT:'. Extract comprehensively — do not stop early."
                        ))
                    ]
                    update = self._invoke_with_retry(repo_path, file_path, chunk, seed_names=set(existing_names))
                    ctx = self._extract_context_line(self._last_raw)
                    if ctx:
                        context_history.append(ctx)
                    if update.strip():
                        accumulated = accumulated + "\n" + update
                    _generation_progress[file_path]["current"] = i
                    _generation_progress[file_path]["chunk_tokens"] = 0

            # Orphan pass — connect any nodes that have no relationships, in batches
            orphans = self._orphan_names(accumulated)
            if orphans and not _is_stale(file_path, my_gen_id):
                print(f"Orphan pass: connecting {len(orphans)} isolated nodes", flush=True)
                _generation_progress[file_path]["chunk_tokens"] = 0
                ctx_lines = context_history if total > 1 else [self._extract_context_line(self._last_raw)]
                ctx_lines = [c for c in ctx_lines if c]
                _ORPHAN_BATCH = 15
                for _i in range(0, len(orphans), _ORPHAN_BATCH):
                    batch = orphans[_i:_i + _ORPHAN_BATCH]
                    orphan_result = self._connect_orphans(text, accumulated, batch, repo_path, file_path, ctx_lines)
                    if orphan_result.strip():
                        accumulated = accumulated + "\n" + orphan_result

            return accumulated
        finally:
            p = _generation_progress.get(file_path)
            if p is not None and p.get("gen_id") == my_gen_id:
                _generation_progress.pop(file_path, None)

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

    def summarize_node(self: TextAnalizer, node_description: str, sentences: list, variation: bool = False) -> str:
        context = "\n".join(sentences) if sentences else "No direct source sentences found."
        system_content = (
            "You are a concise knowledge assistant. Given a graph node's description and "
            "relevant source sentences from a note, write a 1-2 sentence plain-English summary "
            "explaining what this concept means in the context of the note. Be specific and factual."
        )
        if variation:
            system_content += (
                " The user has requested a fresh summary — provide a different angle, "
                "emphasis, or phrasing than you would typically use."
            )
        self.messages = [
            SystemMessage(content=system_content),
            HumanMessage(content=(
                f"Node description:\n{node_description}\n\n"
                f"Source context from the note:\n{context}"
            )),
        ]
        return self.model.invoke(self.messages).content.strip()


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
