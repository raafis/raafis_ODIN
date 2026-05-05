from __future__ import annotations
from typing import Optional, Dict, List, Any, Iterator

import json
import os
from pathlib import Path

from gqlalchemy import Memgraph

from core.knowledgebase import constants
from core.knowledgebase.Utils import Utils
from core.knowledgebase.CypherQueryHandler import CypherQueryHandler as CQ
from core.knowledgebase.notes.Embeddings import Embeddings


class MemgraphManager:
    def __init__(self: MemgraphManager) -> None:
        self.db = Memgraph(host=constants.MEMGRAPH_HOST,
                           port=constants.MEMGRAPH_PORT)
        return

    def run_update_query(self: MemgraphManager, query: str) -> None:
        import re
        lines = [l.strip() for l in query.splitlines() if l.strip()]

        node_pattern = re.compile(
            r"MERGE\s+\((\w+)(?::\w+)?\s*\{[^}]*name\s*:\s*['\"]([^'\"]+)['\"]",
            re.IGNORECASE
        )
        rel_pattern = re.compile(r"^MERGE\s+\((\w+)\)\s*-\[", re.IGNORECASE)
        rel_full = re.compile(r"^MERGE\s+\((\w+)\)(.*?)\((\w+)\)", re.IGNORECASE)

        # Single-pass: process lines in order, tracking the CURRENT name for each
        # variable as we go. Relationship lines are rewritten using the name that
        # was active for that variable at that position in the output.
        current_var_name: dict = {}  # var -> node name currently bound to it
        statements = []

        for line in lines:
            # Node MERGE — update the current binding for this variable
            nm = node_pattern.search(line)
            if nm:
                current_var_name[nm.group(1)] = nm.group(2)
                statements.append(line)
                continue

            # Relationship MERGE — rewrite using current bindings
            if rel_pattern.match(line):
                rm = rel_full.match(line)
                if rm:
                    src, mid, dst = rm.group(1), rm.group(2), rm.group(3)
                    src_name = current_var_name.get(src)
                    dst_name = current_var_name.get(dst)
                    if src_name and dst_name:
                        stmt = (
                            f"MATCH (a {{name: '{src_name}'}}), (b {{name: '{dst_name}'}}) "
                            f"MERGE (a){mid}(b)"
                        )
                        statements.append(stmt)
                    continue  # skip malformed rel lines silently

            statements.append(line)

        for stmt in statements:
            try:
                self.db.execute(stmt)
            except Exception as e:
                print(f"WARN: skipping invalid statement: {e}\nSTMT: {stmt[:200]}")
        return

    def run_select_query(self: MemgraphManager, query: str) -> Iterator[Dict[str, Any]]:
        res = self.db.execute_and_fetch(query)
        return res

    @staticmethod
    def select_query_tool(query: str) -> List[Any]:
        return list(MemgraphManager().run_select_query(query))

    def check_if_db_empty(self: MemgraphManager) -> bool:
        query = CQ.get_check_if_db_empty_query()
        res = self.run_select_query(query)
        res = next(res)
        return int(res['nodes']) == 0

    def export_data_for_repo_path(self: MemgraphManager, repo_path: str) -> List[Dict[str, Any]]:
        query = CQ.get_export_for_repo_path_query(repo_path)
        res = self.db.execute_and_fetch(query)
        return Utils.results_to_dictlist(res, 'repo_specific_subgraph')

    def export_data_for_file_path(self: MemgraphManager, file_path: str) -> List[Dict[str, Any]]:
        nodes_res = self.db.execute_and_fetch(CQ.get_nodes_for_file_path_query(file_path))
        nodes = []
        for row in nodes_res:
            n = row['n']
            props = {k: v for k, v in (n._properties or {}).items() if k != 'embeddings'}
            nodes.append({
                "id": n._id,
                "labels": list(n._labels),
                "properties": props,
                "type": "node",
            })
        edges_res = self.db.execute_and_fetch(CQ.get_edges_for_file_path_query(file_path))
        edges = []
        for row in edges_res:
            r = row['r']
            edges.append({
                "id": r._id,
                "start": r._start_node_id,
                "end": r._end_node_id,
                "label": r._type,
                "properties": dict(r._properties or {}),
                "type": "relationship",
            })
        return nodes + edges

    def delete_all(self: MemgraphManager) -> None:
        query = CQ.get_delete_all_query()
        self.db.execute(query)
        return

    def delete_all_for_repo(self: MemgraphManager, repo_path: str) -> None:
        query = CQ.get_delete_all_for_repo_query(repo_path)
        self.db.execute(query)
        return

    def delete_graph_for_file(self: MemgraphManager, file_path: str) -> None:
        query = CQ.get_delete_graph_for_file_query(file_path)
        self.db.execute(query)
        return

    def rename_file(self: MemgraphManager, old_file_path: str, new_file_path: str) -> None:
        query = CQ.get_rename_file_query(old_file_path, new_file_path)
        self.db.execute(query)
        return

    @staticmethod
    def print_type_and_obj(type: str, obj: Optional[str]) -> str:
        if obj is None:
            return f"{type}"
        return f"{type}: {obj}"

    def describe_node(self: MemgraphManager, id: int) -> str:
        query = CQ.get_node_description_query(id)
        results = self.db.execute_and_fetch(query)
        res = next(results)
        out = ""
        _, node_type, node_name = res['Node_ID'], res['Node_Type'], res['Node_Name']
        out += f"{MemgraphManager.print_type_and_obj(node_type, node_name)}\n"
        for conn in res['In_Connections']:
            rel_type = conn['Relationship_Type']
            if rel_type is None:
                continue
            neighbour_type, neighbour_name = conn['Neighbour_Type'], conn['Neighbour_Name']
            out += f"{MemgraphManager.print_type_and_obj(node_type, node_name)} "
            out += f"{rel_type} "
            out += f"{MemgraphManager.print_type_and_obj(neighbour_type, neighbour_name)}\n"
        for conn in res['Out_Connections']:
            rel_type = conn['Relationship_Type']
            if rel_type is None:
                continue
            neighbour_type, neighbour_name = conn['Neighbour_Type'], conn['Neighbour_Name']
            out += f"{MemgraphManager.print_type_and_obj(neighbour_type, neighbour_name)} "
            out += f"{rel_type} "
            out += f"{MemgraphManager.print_type_and_obj(node_type, node_name)}\n"
        return out

    def strings_to_embed_by_id(self: MemgraphManager, file_path: str) -> Dict[str, str]:
        strings_by_id = dict()
        query = CQ.get_strings_to_embed_query(file_path)
        results = self.db.execute_and_fetch(query)
        for res in results:
            out = ""
            node_id, node_type, node_name = res['Node_ID'], res['Node_Type'], res['Node_Name']
            out += f"{MemgraphManager.print_type_and_obj(node_type, node_name)}\n"
            for conn in res['Connections']:
                rel_type = conn['Relationship_Type']
                if rel_type is None:
                    continue
                neighbour_type, neighbour_name = conn['Neighbour_Type'], conn['Neighbour_Name']
                out += f"{MemgraphManager.print_type_and_obj(node_type, node_name)} "
                out += f"{rel_type} "
                out += f"{MemgraphManager.print_type_and_obj(neighbour_type, neighbour_name)}\n"
            strings_by_id[node_id] = out
        return strings_by_id

    def embeddings_by_id(self: MemgraphManager, file_path: str) -> Dict[str, List[float]]:
        strings_by_id = self.strings_to_embed_by_id(file_path)
        return {id: Embeddings.get_embedding(strings_by_id[id]) for id in strings_by_id.keys()}

    def update_embeddings(self: MemgraphManager, file_path: str) -> None:
        emb_by_id = self.embeddings_by_id(file_path)
        for id in emb_by_id.keys():
            emb = emb_by_id[id]
            query = CQ.get_set_embeddings_query(id, emb)
            self.db.execute(query)
        return

    def create_temp_nodes(self: MemgraphManager, emb_vector: List[float]) -> None:
        query = CQ.get_tmp_create_query(emb_vector)
        self.db.execute(query)
        return

    def delete_temp_nodes(self: MemgraphManager) -> None:
        query = CQ.get_tmp_delete_query()
        self.db.execute(query)
        return

    def get_schema_for_repo(self: MemgraphManager, repo_path: str) -> str:
        query = CQ.get_schema_for_repo_query(repo_path)
        # print(query)
        res = self.db.execute_and_fetch(query)
        return next(res)['schema']

    def vector_search_query(self: MemgraphManager) -> List[Any]:
        query = CQ.get_vector_search_query()
        res = self.db.execute_and_fetch(query)
        return list(res)

    def embeddings_for_node(self: MemgraphManager, node_id: int) -> List[float]:
        query = CQ.get_embeddings_for_node_query(node_id)
        res = self.db.execute_and_fetch(query)
        row = next(res, None)
        return row['embeddings'] if row else None

    def get_node_name(self: MemgraphManager, node_id: int) -> Optional[str]:
        res = self.db.execute_and_fetch(f"MATCH (n) WHERE id(n) = {node_id} RETURN n.name AS name")
        row = next(res, None)
        return row['name'] if row else None

    def get_node_file_path(self: MemgraphManager, node_id: int) -> Optional[str]:
        res = self.db.execute_and_fetch(f"MATCH (n) WHERE id(n) = {node_id} RETURN n.file_path AS file_path")
        row = next(res, None)
        return row['file_path'] if row else None

    def get_node_source_sentences(self: MemgraphManager, node_id: int) -> List[str]:
        res = self.db.execute_and_fetch(
            f"MATCH (n) WHERE id(n) = {node_id} RETURN n.source_sentences AS ss"
        )
        row = next(res, None)
        val = row.get('ss') if row else None
        return list(val) if val else []


if __name__ == '__main__':
    arch = MemgraphManager()

    example_reponame = 'History'
    example_repopath = os.path.join(os.path.dirname(
        __file__), 'examples', example_reponame)

    example_fname = 'napoleon.txt'
    example_fpath = os.path.join(example_repopath, example_fname)

    arch.update_embeddings(example_fpath)
    print(arch.get_schema_for_repo(example_repopath))
