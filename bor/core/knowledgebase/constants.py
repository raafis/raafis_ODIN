import os
import dotenv

f = dotenv.find_dotenv()
if not f:
    f = dotenv.find_dotenv('template.env')
dotenv.load_dotenv(f)

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")

MEMGRAPH_HOST = os.environ.get("MEMGRAPH_HOST", "127.0.0.1")
MEMGRAPH_PORT = os.environ.get("MEMGRAPH_PORT", "7687")
MEMGRAPH_PORT = int(MEMGRAPH_PORT)

CHROMA_DATA_DIR = os.environ.get("CHROMA_DATA_DIR")
CHROMA_VECTOR_SPACE = os.environ.get("CHROMA_VECTOR_SPACE")

EMBEDDING_MODEL_NAME = os.environ.get(
    "EMBEDDING_MODEL_NAME", "nomic-embed-text")
LLM_MODEL_NAME = os.environ.get("LLM_MODEL_NAME", "dolphin3:8b")
LLM_MODEL_TEMPERATURE = os.environ.get("LLM_MODEL_TEMPERATURE", "0.2")
LLM_MODEL_TEMPERATURE = float(LLM_MODEL_TEMPERATURE)

MOCK = (os.environ.get("MOCK", 'False') == 'True')
