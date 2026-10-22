# ODIN — Obsidian Driven Information Network

> Transform your unstructured notes into an interactive, AI-powered knowledge graph — inside Obsidian.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-4.7-3178C6?logo=typescript&logoColor=white)
![Cytoscape.js](https://img.shields.io/badge/Cytoscape.js-3.26-F7A800)
![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?logo=obsidian&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Memgraph](https://img.shields.io/badge/Memgraph-2.15-FB6E00)

---

## Overview

ODIN is an Obsidian community plugin that uses an LLM to extract entities and relationships from your notes and renders them as an interactive knowledge graph. It bridges your writing and your ideas — clicking a node in the graph highlights the matching sentences in your editor, and asking questions in the Chat panel produces answers grounded in your vault.

The backend (**BOR — Backend for ODIN and Rune**) runs as a local service that handles LLM calls, graph storage in Memgraph, and semantic embeddings. Everything runs locally by default via Ollama.

---

## Features

### Knowledge Graph Generation
- Right-click any note → **Generate Knowledge Graph** — LLM extracts named entities and their relationships
- Real-time progress indicator (%) during generation
- **Regenerate** to refresh a graph when note content changes
- Preview nodes appear incrementally as generation proceeds

### Interactive Graph Visualization
- Cytoscape.js canvas with CoSE-Bilkent physics-based layout
- Nodes and directed edges with relationship labels
- Viewport position cached per file — graph returns to where you left it
- Background click clears all selections

### Node Clustering
- **Label propagation** algorithm (topology-based community detection)
- **Section-based grouping** when markdown headers are present
- Cluster bubbles with hub-node identification (highest-degree node)
- Expand / collapse individual clusters; cross-cluster edges shown as dashed lines
- **Re-Cluster** button toggles clustering mode; **Collapse All** resets to full clustering

### Node & Cluster Summaries
- Click a node → **Summary** tab shows an LLM-generated summary
- Cached summaries indicated visually; regenerate on demand
- Click a cluster bubble → combined summary of all member nodes
- One-click copy to clipboard

### Text ↔ Graph Linking
- Click any graph node → editor selection jumps to matching sentences in the note
- Right-click selected text → **Find node in graph** — highlights all semantically matching nodes
- Right-click → **Unhighlight nodes** to clear active highlighting

### AI Chat Panel
- **Chat** tab: ask questions about the active note's knowledge graph
- File-scoped chat history — each note maintains its own conversation
- Edit or regenerate previous messages; copy AI responses
- AI-identified concepts appear as **chat nodes** in the graph, linked to related existing nodes

### Context Menu (right-click in editor)
| Option | Action |
|---|---|
| Generate Knowledge Graph | Build graph for the current note |
| Regenerate Knowledge Graph | Rebuild with updated content |
| Generate questions | Extract thought-provoking questions from selected text |
| Find node in graph | Highlight nodes matching selected text |
| Unhighlight nodes in graph | Clear all active highlighting |

### Session Persistence
- Viewport position, selected nodes, and chat history all saved per file
- State restored automatically when switching between notes

---

## Tech Stack

| Layer | Technology |
|---|---|
| Plugin framework | Obsidian |
| Frontend | React 18, TypeScript, Styled Components |
| Graph visualization | Cytoscape.js 3.26, cytoscape-cose-bilkent |
| Backend API | FastAPI (Python) |
| Graph database | Memgraph 2.15 |
| LLM | Ollama — default: `granite3.3:8b` |
| Embeddings | Ollama — default: `qwen3-embedding:0.6b` |
| Deployment | Docker / Docker Compose |

---

## Prerequisites

- **Obsidian** with an active vault
- **Docker & Docker Compose** (recommended) — or Python 3.9+ for manual setup
- **Ollama** running locally with your chosen models pulled — or an OpenAI API key for cloud LLM

---

## Installation

### Option A — Docker (Recommended)

```bash
# Clone into your vault's plugins folder
git clone <repo-url> <vault>/.obsidian/plugins/odin
cd <vault>/.obsidian/plugins/odin

# Configure environment (copy and edit)
cp .env.example .env
# Set LLM_MODEL_NAME, EMBEDDING_MODEL_NAME, and optionally OPENAI_API_KEY

docker compose up
```

Services started:

| Service | Port |
|---|---|
| ODIN frontend | 1234 |
| BOR backend (FastAPI) | 8000 |
| Memgraph | 7687 |

### Option B — Manual

**Frontend:**
```bash
cd <vault>/.obsidian/plugins/odin
npm install
npm run dev
```

**Backend (BOR):**
```bash
conda create -n bor_env python=3.9.16
conda activate bor_env
pip install -e ./bor
bash bor/core/run_memgraph_290.sh      # start Memgraph
uvicorn bor.core.restapi.api:app --reload
```

---

## Obsidian Setup

1. Copy / clone the plugin into `<vault>/.obsidian/plugins/odin`
2. Obsidian → **Settings** → **Community Plugins** → disable **Restricted Mode**
3. Enable **ODIN** in the Community Plugins list
4. The **Graph Prompt View** opens automatically in the right sidebar

---

## Usage

1. Open any note in Obsidian
2. Right-click in the editor → **Generate Knowledge Graph**
3. Watch the graph build in the sidebar panel (progress shown as %)
4. **Click a node** — the editor highlights the sentences it was extracted from
5. **Right-click selected text** → **Find node in graph** to go the other way
6. Click **Re-Cluster** to group nodes into communities
7. **Click a cluster bubble** → the Summary tab shows a combined AI summary
8. Switch to the **Chat** tab and ask questions about the note's graph
9. Right-click → **Unhighlight nodes** to reset selections

---

## Development

```bash
npm run dev      # watch mode — rebuilds on save
npm run build    # production bundle
```

The build output is written directly into the Obsidian plugin folder via `esbuild.config.mjs`. Reload Obsidian (or use the hot-reload plugin) to pick up changes.

---

## Notes

- **LLM quality matters** — GPT-3.5 / small models produce lower-fidelity graphs. GPT-4 or `granite3.3:8b` via Ollama gives noticeably better results.
- The BOR backend must be running at `http://localhost:8000` before any plugin feature will work.
- All data (graphs, embeddings, summaries) is stored locally in Memgraph and on disk — nothing leaves your machine unless you configure a cloud LLM.
