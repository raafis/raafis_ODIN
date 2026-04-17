from __future__ import annotations

from pathlib import Path
import os

from langchain_core.prompts import PromptTemplate
from langchain_ollama import ChatOllama
from langchain.schema import (
    HumanMessage,
    SystemMessage
)

from core.knowledgebase import constants


class TextAnalizer:
    def __init__(self: TextAnalizer) -> None:

        self.model = ChatOllama(
            model=constants.LLM_MODEL_NAME,
            base_url=constants.OLLAMA_BASE_URL,
            temperature=constants.LLM_MODEL_TEMPERATURE,
            think=False
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

    @staticmethod
    def _extract_cypher(raw: str) -> str:
        """Extract Cypher from LLM output.
        Handles: raw Cypher, <cypher>...</cypher> tags, ```cypher ... ``` fences."""
        if '<cypher>' in raw:
            raw = raw.split('<cypher>')[-1]
        if '</cypher>' in raw:
            raw = raw.split('</cypher>')[0]
        if '```cypher' in raw:
            raw = raw.split('```cypher')[-1].split('```')[0]
        elif '```' in raw:
            raw = raw.split('```')[1] if raw.count('```') >= 2 else raw
        return raw.strip()

    _CYPHER_SYSTEM = (
        "Convert the text into a Cypher knowledge graph. Be thorough — extract every meaningful entity, "
        "concept, role, process, and phenomenon mentioned in the text.\n\n"
        "NODE LABELS — choose the most specific label:\n"
        "  Role=person/actor/agent  Concept=abstract idea/phenomenon  Technology=tool/platform/system\n"
        "  Process=named procedure/workflow  Output=artifact/report produced  Entity=anything else\n\n"
        "RELATIONSHIP TYPES — use the actual verb or verb phrase from the text, converted to UPPER_SNAKE_CASE. "
        "Examples: 'occupies' → OCCUPIES, 'exerts' → EXERTS, 'adopt cues from' → ADOPT_CUES_FROM, "
        "'align their behaviour with' → ALIGN_BEHAVIOUR_WITH, 'embodies' → EMBODIES.\n\n"
        "RULES:\n"
        "1. Extract ALL meaningful concepts — people, roles, ideas, behaviours, processes, phenomena.\n"
        "2. Do NOT create nodes for bare numbers or dates.\n"
        "3. Relationship labels must be verbs or verb phrases from the text itself.\n"
        "4. Use MERGE for every node and relationship.\n"
        "5. Every node MUST have: name, repo_path, file_path.\n"
        "6. UNIQUE variable per node: a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p.\n"
        "7. One statement per line. No semicolons. No RETURN. No markdown. No explanations.\n\n"
        "EXAMPLE (text: 'Node 33 occupies the centre of peer attention and social status. "
        "She exerts conformity pressure. Actors adopt cues from her as a high status referent. "
        "Girls align their behaviour with hers.'):\n"
        "MERGE (a:Role {name: 'Node 33', repo_path: '/v', file_path: '/v/n.md'})\n"
        "MERGE (b:Concept {name: 'Peer Attention', repo_path: '/v', file_path: '/v/n.md'})\n"
        "MERGE (c:Concept {name: 'Social Status', repo_path: '/v', file_path: '/v/n.md'})\n"
        "MERGE (d:Concept {name: 'Conformity Pressure', repo_path: '/v', file_path: '/v/n.md'})\n"
        "MERGE (e:Concept {name: 'High Status Referent', repo_path: '/v', file_path: '/v/n.md'})\n"
        "MERGE (f:Role {name: 'Girls', repo_path: '/v', file_path: '/v/n.md'})\n"
        "MERGE (a)-[:OCCUPIES_CENTRE_OF]->(b)\n"
        "MERGE (a)-[:OCCUPIES_CENTRE_OF]->(c)\n"
        "MERGE (a)-[:EXERTS]->(d)\n"
        "MERGE (a)-[:EMBODIES]->(e)\n"
        "MERGE (f)-[:ALIGN_BEHAVIOUR_WITH]->(a)"
    )

    _CYPHER_UPDATE_SYSTEM = (
        "Extend an existing knowledge graph with new information from the text. "
        "Be thorough — extract every new entity, concept, role, process, and phenomenon.\n\n"
        "NODE LABELS — choose the most specific label:\n"
        "  Role=person/actor  Concept=abstract idea  Technology=tool/system\n"
        "  Process=named procedure  Output=artifact produced  Entity=anything else\n\n"
        "RELATIONSHIP TYPES — use the actual verb or verb phrase from the new text, converted to "
        "UPPER_SNAKE_CASE. The label must be a verb from the text itself.\n\n"
        "RULES:\n"
        "1. Extract ALL meaningful concepts not already in the existing graph.\n"
        "2. Do NOT create nodes for bare numbers or dates.\n"
        "3. Relationship labels must be verbs or verb phrases from the text.\n"
        "4. Use MERGE for every node and relationship.\n"
        "5. Every node MUST have: name, repo_path, file_path.\n"
        "6. UNIQUE variable per node: a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p.\n"
        "7. One statement per line. No semicolons. No RETURN. No markdown. No explanations.\n"
    )

    def text_to_cypher_create(self: TextAnalizer, text: str, repo_path: str, file_path: str) -> str:
        self.messages = [
            SystemMessage(content=self._CYPHER_SYSTEM),
            HumanMessage(content=(
                f"repo_path: {repo_path}\n"
                f"file_path: {file_path}\n\n"
                f"Text:\n{text}"
            ))
        ]
        return self._extract_cypher(self.model.invoke(self.messages).content)

    def data_and_text_to_cypher_update(self: TextAnalizer, data: str, text: str, repo_path: str, file_path: str) -> str:
        self.messages = [
            SystemMessage(content=self._CYPHER_UPDATE_SYSTEM),
            HumanMessage(content=(
                f"repo_path: {repo_path}\n"
                f"file_path: {file_path}\n\n"
                f"Existing graph data:\n{data}\n\n"
                f"New text to add:\n{text}"
            ))
        ]
        return self._extract_cypher(self.model.invoke(self.messages).content)

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
