# aimem — Error Handling

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Core Principle

The server must never crash the host AI client process, and must never silently discard data it cannot explain — every failure either resolves invisibly (missing file → fresh start) or surfaces as an explicit, structured, exact-text error.

## Error Response JSON Format

```json
{
  "success": false,
  "error": {
    "code": "STORAGE_CORRUPTED",
    "message": "Your project memory file (.aimem/memory.db) exists but could not be read. It may be corrupted. No data has been modified or deleted — please back up .aimem/memory.db and report this issue before continuing."
  }
}
```

No field beyond `success`, `error.code`, and `error.message` is present in an error response. No stack trace, no absolute filesystem path beyond the `.aimem/...` relative segment, no internal object dumps.

## Standard Error Messages (Exact Text)

| Case | Is it an error? | `code` | Exact `message` |
|---|---|---|---|
| `.aimem/memory.db` missing | No — silent fresh start | N/A | (no message; server proceeds as if memory is empty) |
| `.aimem/memory.db` exists but corrupted/unreadable | Yes | `STORAGE_CORRUPTED` | `Your project memory file (.aimem/memory.db) exists but could not be read. It may be corrupted. No data has been modified or deleted — please back up .aimem/memory.db and report this issue before continuing.` |
| Tool input fails schema validation | Yes | `INVALID_INPUT` | `The input provided to this tool is invalid or incomplete. Please check the required fields and try again.` |
| Conflict confirmation references unknown `conflict_id` | Yes | `CONFLICT_NOT_FOUND` | `No pending memory conflict was found with the given conflict_id. It may have already been resolved.` |
| Conflict detected on write | Yes (structured, not a failure) | N/A (`conflict_detected: true` in success data) | N/A — see [architecture/api-design.md](../architecture/api-design.md) `memory_store` conflict response |
| Unclassified internal failure | Yes | `INTERNAL_ERROR` | `An unexpected internal error occurred in aimem. Your existing memory data has not been modified.` |

## Error Handling Layers

**Layer 1 — Storage layer (throws typed errors, never returns partial/ambiguous state):**

```typescript
// src/storage-engine/storage-engine.ts
export class StorageCorruptedError extends Error {
  constructor(public readonly dbPath: string) {
    super(`Storage file at ${dbPath} failed integrity check`);
    this.name = "StorageCorruptedError";
  }
}

function openDatabase(dbPath: string): Database {
  let db: Database;
  try {
    db = new Database(dbPath); // better-sqlite3 throws SqliteError here for non-SQLite-file garbage
  } catch {
    throw new StorageCorruptedError(dbPath);
  }
  const result = db.pragma("integrity_check");
  if (result[0]?.integrity_check !== "ok") {
    db.close();
    throw new StorageCorruptedError(dbPath);
  }
  return db;
}
```

Note (added during Phase 2 implementation): `better-sqlite3`'s `new Database(path)` constructor itself throws a driver-level `SqliteError` (`"file is not a database"`) for a file containing arbitrary non-SQLite bytes — this happens *before* `pragma("integrity_check")` ever runs, so the constructor call must be wrapped in its own try/catch and reclassified to `StorageCorruptedError`, not just the pragma check. Verified via a unit test that writes garbage bytes to the db path and asserts `StorageCorruptedError` is thrown ([storage-engine.test.ts](../../src/storage-engine/__tests__/storage-engine.test.ts)).

**Critical note (found and fixed during Phase 7 e2e testing):** `StorageEngine`'s constructor throws `StorageCorruptedError` *synchronously*. Early `server.ts` built all `ServerDependencies` — including `new StorageEngine(...)` — eagerly at `startServer()` time, meaning a corrupted `.aimem/memory.db` crashed the entire server process before it finished connecting, producing an unrecoverable "Connection closed" MCP transport error instead of a normal per-call `STORAGE_CORRUPTED` response. This directly violated Rule 9 ("never crash the host process on a handled error") and FR-ERR-02. Fixed by making dependency construction lazy (`LazyServerDependencies` in [../../src/server.ts](../../src/server.ts)): the server always starts successfully and registers its tools regardless of storage state, and `StorageEngine` is only constructed on the *first actual tool call*, inside the same try/catch that `ToolRouter.handleToolCall` already uses to classify errors. Caught by an e2e test that pre-writes garbage bytes to `.aimem/memory.db` before spawning the server and asserts the connection survives and returns the exact `STORAGE_CORRUPTED` message.

**Layer 2 — Tool handler boundary (catches everything, maps to the exact response format):**

```typescript
// src/mcp-server/tool-router.ts
async function handleToolCall(toolName: string, input: unknown) {
  try {
    return { success: true, data: await dispatch(toolName, input) };
  } catch (err) {
    if (err instanceof StorageCorruptedError) {
      return {
        success: false,
        error: {
          code: "STORAGE_CORRUPTED",
          message:
            "Your project memory file (.aimem/memory.db) exists but could not be read. It may be corrupted. No data has been modified or deleted — please back up .aimem/memory.db and report this issue before continuing.",
        },
      };
    }
    if (err instanceof InvalidInputError) {
      return {
        success: false,
        error: {
          code: "INVALID_INPUT",
          message:
            "The input provided to this tool is invalid or incomplete. Please check the required fields and try again.",
        },
      };
    }
    logger.error({ msg: "unhandled_tool_error", tool: toolName, errName: (err as Error).name });
    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected internal error occurred in aimem. Your existing memory data has not been modified.",
      },
    };
  }
}
```

**Layer 3 — Missing-file handling (not an error path at all):**

```typescript
function openOrInitDatabase(dbPath: string): Database {
  if (!fs.existsSync(dbPath)) {
    return initFreshDatabase(dbPath); // no warning, no error — silent fresh start
  }
  return openDatabase(dbPath); // may throw StorageCorruptedError
}
```

## What NOT To Do

- Do NOT include stack traces in any MCP tool response, ever, in any environment.
- Do NOT silently swallow a `StorageCorruptedError` and proceed as if memory were empty — this destroys the user's data without telling them.
- Do NOT silently discard or delete a corrupted `memory.db` file automatically — leave it in place for manual inspection/backup.
- Do NOT return raw driver/SQLite error text (e.g. `SQLITE_CORRUPT`) directly to the client — always map to the exact standard message above.
- Do NOT treat a missing `.aimem/` directory as an error condition requiring user notification.

See also: [architecture/api-design.md](../architecture/api-design.md), [../RULES.md](../RULES.md) Rule 9, [testing-guide.md](testing-guide.md).
