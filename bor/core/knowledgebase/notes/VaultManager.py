from __future__ import annotations

import pathlib

from core.knowledgebase import constants
from core.knowledgebase.Utils import Utils
from core.knowledgebase.TextAnalizer import TextAnalizer
from core.knowledgebase.MemgraphManager import MemgraphManager
from core.knowledgebase.notes.CollectionManager import CollectionManager
from core.knowledgebase.indexers.KGIndexer import KGIndexer


class VaultManager:
    def __init__(self: VaultManager, vault_path: str) -> None:
        self.vault_path = vault_path
        self.ta = TextAnalizer()
        self.mm = MemgraphManager()
        self.cm = CollectionManager(self.vault_path)

    def populate_vault(self: VaultManager) -> None:

        all_paths = Utils.get_all_files_recursive(self.vault_path)
        file_paths = [p for p in all_paths if p.endswith('.md')]
        processed = []
        for file_path in file_paths:
            try:
                file_text = pathlib.Path(file_path).read_text()
            except (FileNotFoundError, PermissionError):
                print(f"WARN: skipping missing file: {file_path}")
                continue
            if not file_text.strip():
                continue
            i = len(processed)
            if file_path.endswith("_knowledge_graph.md"):
                for stmt in KGIndexer.parse(file_text, self.vault_path, file_path):
                    try:
                        self.mm.db.execute(stmt)
                    except Exception as e:
                        print(f"WARN kg bridge: {e}\nSTMT: {stmt[:200]}")
            else:
                if i == 0:
                    res_queries = self.ta.text_to_cypher_create(
                        file_text, self.vault_path, file_path)
                else:
                    data = self.mm.export_data_for_repo_path(self.vault_path)
                    res_queries = self.ta.data_and_text_to_cypher_update(
                        str(data), file_text, self.vault_path, file_path)
                self.mm.run_update_query(res_queries)
            # Set repo_path/file_path on any nodes the LLM omitted them from
            try:
                self.mm.db.execute(
                    f"MATCH (n) WHERE n.file_path IS NULL "
                    f"SET n.file_path = '{file_path}', n.repo_path = '{self.vault_path}'"
                )
            except Exception as e:
                print(f"WARN: post-processing set failed: {e}")
            self.cm.add_file(file_path)
            processed.append(file_path)

        for file_path in processed:
            self.mm.update_embeddings(file_path)
        return
