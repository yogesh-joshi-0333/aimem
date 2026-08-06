# Module: Embedding / Search Engine

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Role

The Embedding/Search Engine provides fully offline semantic search: it loads a bundled MiniLM-class ONNX model via `transformers.js` on first use, generates vector embeddings for observation text, stores those vectors in a `sqlite-vec` virtual table living inside the same `memory.db` file, and executes similarity queries that back the `memory_search` tool alongside structured filters supplied by the Retrieval Engine.

## Technology

| Component | Technology | Version |
|---|---|---|
| Local inference | `@xenova/transformers` | `^2.17.0` |
| Model | MiniLM-class sentence embedding model (ONNX format) | bundled at install |
| Vector index | `sqlite-vec` (SQLite extension) | `^0.1.6` |

## Planned File Structure

```
src/embedding-search-engine/
├── embedding-engine.ts        # model load, embed(text) -> Float32Array
├── vector-index.ts            # sqlite-vec virtual table setup + similarity queries
├── types.ts                   # SearchResult, EmbeddingVector
└── __tests__/
    ├── embedding-engine.test.ts
    └── embedding-search.integration.test.ts
```

## Key Functions / Methods

| Function | Purpose |
|---|---|
| `loadModel()` | Lazily loads the bundled ONNX model into memory on first call |
| `embed(text: string): Promise<Float32Array>` | Produces a fixed-length embedding vector for input text |
| `registerVecExtension(db)` | Loads the `sqlite-vec` extension into an open SQLite connection |
| `embedAndStore(observationId, text)` | Generates and persists an embedding tied to an observation row |
| `searchSimilar(queryText, limit)` | Embeds the query and returns top-N similar observations with scores |

## Lifecycle

1. **Startup** — extension registration happens when the Storage Engine opens its connection; the model itself is NOT loaded yet (lazy).
2. **Normal operation** — on the first `memory_store`/`memory_scan`/`memory_search` call, the model loads into memory once per server process and stays warm for subsequent calls.
3. **Shutdown/error** — no special cleanup required beyond normal process exit; the model holds no open file handles beyond its own bundled asset files (read-only).

## Dependencies on Other Modules

- Depends on [storage-engine.md](storage-engine.md) for the open SQLite connection and the `vec_observations` virtual table's row lifecycle.
- Consumed by [capture-engine.md](capture-engine.md) (embed on store) and [retrieval-engine.md](retrieval-engine.md) (embed on search).

## Module-Specific Error Handling

- If the bundled model files are missing or fail to load (e.g. corrupted install), throws a distinct `EmbeddingModelUnavailableError`, mapped by the MCP Server module to `INTERNAL_ERROR` with a message that does not expose internal file paths.
- Embedding failures never partially write a vector — the corresponding `observations` row insert and its `vec_observations` insert happen in the same transaction.

## Configuration Options

| Option | Default | Notes |
|---|---|---|
| Model name/path | Bundled MiniLM-class model under `models/` | Not user-configurable in v1 |
| Embedding dimension | Fixed by the chosen model (e.g. 384) | Determined at model selection time in Phase 3 |
| Search result limit | 10 (default), 50 (max) | Set per-call via `memory_search` input |

See also: [../architecture/system-overview.md](../architecture/system-overview.md), [../requirements/functional-requirements.md](../requirements/functional-requirements.md) (FR-EMBED-*).
