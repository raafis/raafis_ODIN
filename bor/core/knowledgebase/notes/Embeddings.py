from __future__ import annotations

from typing import List

import httpx

from core.knowledgebase import constants


class Embeddings:
    @staticmethod
    def get_embedding(text: str, model: str = constants.EMBEDDING_MODEL_NAME) -> List[float]:
        text = text.replace("\n", " ")
        response = httpx.post(
            f"{constants.OLLAMA_BASE_URL}/api/embeddings",
            json={"model": model, "prompt": text},
            timeout=300.0
        )
        response.raise_for_status()
        return response.json()["embedding"]


if __name__ == '__main__':
    print(Embeddings.get_embedding('bonaparte'))
