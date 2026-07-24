from __future__ import annotations

from typing import List, Optional, Any

import os

from core.knowledgebase.notes.Embeddings import Embeddings
from core.knowledgebase.MemgraphManager import MemgraphManager
from core.knowledgebase.notes.CollectionManager import CollectionManager


class Searcher:
    def __init__(self: Searcher, repo_path: str) -> None:
        self.repo_path = repo_path
        self.mm = MemgraphManager()
        self.accessed_node_ids: list[int] = []
        return

    def search_graph(self: Searcher, query_text: Optional[str] = None, query_embeddings: Optional[List[float]] = None, limit: int = 3) -> List[Any]:
        assert (query_text is not None) or (query_embeddings is not None)
        if query_text is not None:
            emb_vector = Embeddings.get_embedding(query_text)
        else:
            emb_vector = query_embeddings

        self.mm.create_temp_nodes(emb_vector)
        results = None
        try:
            results = self.mm.vector_search_query(limit=limit)
        finally:
            self.mm.delete_temp_nodes()
        return list(results)

    def search_graph_tool(self: Searcher, query: str) -> str:
        results = self.search_graph(query_text=query)
        out = ""
        for res in results:
            node_id = res['ID(node1)']
            self.accessed_node_ids.append(node_id)
            out += self.mm.describe_node(node_id)
            out += "-------------\n"
        return out

    def search_text(self: Searcher, query_text: Optional[str] = None, query_embeddings: Optional[List[float]] = None) -> List[str]:
        cm = CollectionManager(self.repo_path)
        res = cm.collection.query(
            query_texts=query_text,
            query_embeddings=query_embeddings,
            n_results=3,
        )
        return res['documents'][0]

    def search_text_tool(self: Searcher, query: str) -> str:
        return '\n'.join(self.search_text(query_text=query))

    def search_text_for_file(self, query: str, file_path: str) -> str:
        cm = CollectionManager(self.repo_path)
        try:
            res = cm.collection.query(query_texts=query, n_results=3, where={"file_path": file_path})
            docs = res['documents'][0]
            if docs:
                return '\n'.join(docs)
        except Exception:
            pass
        return self.search_text_tool(query)

    def search_graph_for_file(self, query: str, file_path: str) -> str:
        results = self.search_graph(query_text=query)
        filtered = [r for r in results if self.mm.get_node_file_path(r['ID(node1)']) == file_path]
        if not filtered:
            filtered = results
        out = ""
        for res in filtered[:3]:
            node_id = res['ID(node1)']
            self.accessed_node_ids.append(node_id)
            out += self.mm.describe_node(node_id)
            out += "-------------\n"
        return out

    _STOP_WORDS = {"a", "an", "the", "of", "in", "at", "to", "for", "and", "or", "with", "by", "is", "are", "was", "were"}

    @staticmethod
    def _name_pattern(name: str):
        import re
        words = [re.escape(w) for w in name.lower().split() if w]
        return re.compile(r'[\s\-_/]+'.join(words), re.IGNORECASE) if words else None

    @classmethod
    def _word_patterns(cls, name: str):
        import re
        words = [w.lower() for w in name.split() if w.lower() not in cls._STOP_WORDS]
        if not words:
            words = name.lower().split()
        return [re.compile(r'\b' + re.escape(w) + r'\b', re.IGNORECASE) for w in words]

    @classmethod
    def _match_sentences(cls, sentences: list, name: str) -> list:
        # Level 1: full phrase with flexible separators (handles hyphenation)
        pat = cls._name_pattern(name)
        if pat:
            matches = [s for s in sentences if pat.search(s)]
            if matches:
                return matches[:3]
        # Level 2: all significant words present anywhere in the sentence
        word_pats = cls._word_patterns(name)
        if word_pats:
            matches = [s for s in sentences if all(p.search(s) for p in word_pats)]
            if matches:
                return matches[:3]
        # Level 3: most significant words present (allow one miss for long names)
        if len(word_pats) > 2:
            threshold = len(word_pats) - 1
            matches = [s for s in sentences if sum(1 for p in word_pats if p.search(s)) >= threshold]
            if matches:
                return matches[:3]
        # Level 4: greedy — top sentences by overlap count, min 2 matching words
        if word_pats:
            scored = sorted(
                ((s, sum(1 for p in word_pats if p.search(s))) for s in sentences),
                key=lambda x: -x[1]
            )
            matches = [s for s, cnt in scored if cnt >= 2]
            if matches:
                return matches[:3]
            # Level 5: rarest-word fallback — most distinctive word with ≥1 sentence match
            word_freqs = sorted(
                [(p, sum(1 for s in sentences if p.search(s))) for p in word_pats],
                key=lambda x: x[1]
            )
            for p, cnt in word_freqs:
                if cnt > 0:
                    return [s for s in sentences if p.search(s)][:3]
        return []

    def node_id_to_sentences(self: Searcher, id: int) -> List[str]:
        import pathlib
        import nltk
        stored = self.mm.get_node_source_sentences(id)
        if stored:
            return stored
        node_name = self.mm.get_node_name(id)
        file_path = self.mm.get_node_file_path(id)
        if not node_name or not file_path:
            return []
        try:
            text = pathlib.Path(file_path).read_text(errors="ignore")
            sentences = nltk.tokenize.sent_tokenize(text)
            matched = self._match_sentences(sentences, node_name)
            if matched:
                return matched
        except Exception:
            pass
        # Embedding fallback: node name words absent from text — search by semantic similarity
        try:
            emb = Embeddings.get_embedding(node_name)
            from core.knowledgebase.notes.CollectionManager import CollectionManager
            cm = CollectionManager(self.repo_path)
            res = cm.collection.query(
                query_embeddings=[emb],
                n_results=3,
                where={"file_path": file_path},
                include=["documents"]
            )
            return res['documents'][0] if res['documents'] else []
        except Exception:
            return []

    def edge_id_to_sentences(self: Searcher, src_id: int, dst_id: int) -> List[str]:
        import pathlib
        import nltk
        src_name = self.mm.get_node_name(src_id)
        dst_name = self.mm.get_node_name(dst_id)
        file_path = self.mm.get_node_file_path(src_id) or self.mm.get_node_file_path(dst_id)
        if not src_name or not dst_name or not file_path:
            return []
        try:
            text = pathlib.Path(file_path).read_text(errors="ignore")
            sentences = nltk.tokenize.sent_tokenize(text)
            src_pat = self._name_pattern(src_name)
            dst_pat = self._name_pattern(dst_name)
            if not src_pat or not dst_pat:
                return []
            both = [s for s in sentences if src_pat.search(s) and dst_pat.search(s)]
            if both:
                return both[:3]
            either = [s for s in sentences if src_pat.search(s) or dst_pat.search(s)]
            return either[:3]
        except Exception:
            return []

    def sentence_to_node_ids(self: Searcher, sentence: str) -> List[int]:
        if len(sentence) > 300:
            try:
                file_path = self.most_probable_filename_for_text(query_text=sentence)
                if file_path:
                    return self.mm.get_node_ids_for_file(file_path)
            except Exception:
                pass
        emb = Embeddings.get_embedding(sentence)
        return [node['ID(node1)'] for node in self.search_graph(query_embeddings=emb, limit=10)]

    def node_id_to_context(self: Searcher, id: int) -> tuple:
        import pathlib
        import nltk

        stored = self.mm.get_node_source_sentences(id)
        sentences = list(stored) if stored else []
        file_path = self.mm.get_node_file_path(id)
        node_emb = self.mm.embeddings_for_node(id)

        if not sentences and file_path and node_emb:
            try:
                from core.knowledgebase.notes.CollectionManager import CollectionManager
                cm = CollectionManager(self.repo_path)
                res = cm.collection.query(
                    query_embeddings=[node_emb],
                    n_results=5,
                    where={"file_path": file_path},
                    include=["documents"]
                )
                sentences = res['documents'][0] if res['documents'] else []
            except Exception:
                pass

        if not sentences:
            node_name = self.mm.get_node_name(id)
            if node_name and file_path:
                try:
                    text = pathlib.Path(file_path).read_text(errors="ignore")
                    sentences = self._match_sentences(nltk.tokenize.sent_tokenize(text), node_name)
                except Exception:
                    pass

        node_ids: List[int] = []
        try:
            node_ids = self.mm.get_node_neighbor_ids(id)
        except Exception:
            pass

        return sentences, node_ids

    def most_probable_filename_for_text(self: Searcher, query_text: Optional[str] = None) -> str:
        cm = CollectionManager(self.repo_path)
        res = cm.collection.query(
            query_texts=query_text,
            query_embeddings=None,
            n_results=1
        )
        fname = res['metadatas'][0][0]['file_path']
        return fname


if __name__ == '__main__':
    query_text = "counsul"
    example_reponame = 'History'
    example_repopath = os.path.join(os.path.dirname(
        __file__), '..', 'examples', example_reponame)
    searcher = Searcher(example_reponame)

    print(searcher.search_graph(query_text=query_text))
    print(searcher.search_text(query_text=query_text))
    print(searcher.most_probable_filename_for_text(query_text))
    print(searcher.node_id_to_sentences(
        searcher.sentence_to_node_ids('Napoleon bonaparte was born')[0]))
