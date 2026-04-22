from __future__ import annotations

from typing import Union, Optional

import pathlib
import os

import chromadb
from chromadb import EmbeddingFunction, Embeddings as ChromaEmbeddings
import nltk

import core.knowledgebase.constants as constants
from core.knowledgebase.Utils import Utils
from core.knowledgebase.notes.Embeddings import Embeddings


class _OllamaEF(EmbeddingFunction):
    def __call__(self, input: list[str]) -> ChromaEmbeddings:
        return [Embeddings.get_embedding(text) for text in input]


class CollectionManager:
    def __init__(self: CollectionManager, repo_path: Optional[str] = None) -> None:

        self.chroma_client = chromadb.PersistentClient(
            constants.CHROMA_DATA_DIR, settings=chromadb.Settings(allow_reset=True))

        self.ada_ef = _OllamaEF()

        if repo_path is not None:
            self.collection_name = Utils.collection_name_from_repo_path(
                repo_path)
            self._make_collection(self.collection_name)

        return

    def _make_collection(self: CollectionManager, collection_name: str) -> None:
        self.collection = self.chroma_client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": constants.CHROMA_VECTOR_SPACE},
            embedding_function=self.ada_ef
        )
        return

    def _delete_collection(self: CollectionManager, collection_name: str) -> None:
        self.chroma_client.delete_collection(name=collection_name)
        return

    def delete_all(self: CollectionManager) -> None:
        self.chroma_client.reset()
        return

    def add_file(self: CollectionManager, file_path: Union[str, os.PathLike]) -> None:
        text = pathlib.Path(file_path).read_text()
        sentences = nltk.tokenize.sent_tokenize(text)
        batch_size = 15
        for start in range(0, len(sentences), batch_size):
            batch = sentences[start:start + batch_size]
            batch_ids = [f"{file_path}_{start + j}" for j in range(len(batch))]
            self.collection.upsert(
                documents=batch,
                metadatas=[{"file_path": str(file_path)}] * len(batch),
                ids=batch_ids
            )
        return

    def delete_file(self: CollectionManager, file_path: Union[str, os.PathLike]) -> None:
        self.collection.delete(
            where={"file_path": file_path}
        )
        return

    def rename_file(self: CollectionManager, old_file_path: Union[str, os.PathLike], new_file_path: Union[str, os.PathLike]) -> None:
        ids = self.collection.get(
            where={"file_path": str(old_file_path)}
        )['ids']
        self.collection.update(
            ids, metadatas=[{"file_path": str(new_file_path)}] * len(ids))
        return

    def delete_all_from_collection(self: CollectionManager) -> None:
        self._delete_collection(self.collection_name)
        self._make_collection(self.collection_name)
        return


if __name__ == '__main__':

    example_reponame = 'History'
    example_repopath = os.path.join(os.path.dirname(
        __file__), '..', 'examples', example_reponame)

    example_fname = 'napoleon.txt'
    example_fpath = os.path.join(example_repopath, example_fname)

    cm = CollectionManager(example_repopath)
    cm.delete_all_from_collection()
    cm.add_file(example_fpath)

    print(cm.collection.query(query_texts="napoleon"))
