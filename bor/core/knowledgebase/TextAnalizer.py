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
        "You are a knowledge graph builder. Output ONLY a single valid Cypher block. Rules:\n"
        "1. Use MERGE for every node and relationship.\n"
        "2. Every node MUST have a 'name' property (a short descriptive string).\n"
        "3. Every node MUST have 'repo_path' and 'file_path' properties (values provided by the user).\n"
        "4. Use a UNIQUE variable name for EACH node (e.g. a, b, c, d, ... — never reuse a variable).\n"
        "5. Write ALL statements in ONE continuous block with NO semicolons between them.\n"
        "6. Do NOT include RETURN, no explanations, no markdown, no code fences.\n"
        "Example format:\n"
        "MERGE (a:Person {name: 'Alice', repo_path: '/vault', file_path: '/vault/note.md'})\n"
        "MERGE (b:City {name: 'Paris', repo_path: '/vault', file_path: '/vault/note.md'})\n"
        "MERGE (a)-[:LIVES_IN]->(b)"
    )

    def text_to_cypher_create(self: TextAnalizer, text: str, repo_path: str, file_path: str) -> str:
        self.messages = [
            SystemMessage(content=self._CYPHER_SYSTEM),
            HumanMessage(content=(
                f"repo_path: {repo_path}\n"
                f"file_path: {file_path}\n\n"
                f"Convert this text into a Cypher MERGE block:\n{text}"
            ))
        ]
        return self._extract_cypher(self.model.invoke(self.messages).content)

    def data_and_text_to_cypher_update(self: TextAnalizer, data: str, text: str, repo_path: str, file_path: str) -> str:
        self.messages = [
            SystemMessage(content=self._CYPHER_SYSTEM),
            HumanMessage(content=(
                f"repo_path: {repo_path}\n"
                f"file_path: {file_path}\n\n"
                f"EXISTING GRAPH DATA:\n{data}\n\n"
                f"Extend the graph with new MERGE statements for this text:\n{text}"
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
