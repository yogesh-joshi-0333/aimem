# aimem — Security Standards

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Core Security Principle

Everything stays on the local machine, in the local project folder, readable only by the local user — the entire v1 trust boundary is "local process + local filesystem," identical to the trust model of a `.env` file.

## Network Binding Rules

aimem is a **local stdio MCP server**. It MUST NOT open any TCP/UDP listening socket, and MUST NOT bind to any network interface, in v1. All communication is JSON-RPC over stdin/stdout with the single AI client process that spawned it. There is no network attack surface to secure because there is no network surface at all.

## Authentication Rules

None. There is no auth layer in v1 — the server trusts its stdio parent process implicitly, the same way any local CLI tool trusts its invoking shell. This is appropriate because: (a) there is a single local user, (b) the server is spawned directly by the trusted AI client, not exposed to any other process or network peer, and (c) adding an auth layer would add complexity with no corresponding threat it defends against in this deployment model.

## Input Validation Requirements

- Every MCP tool input MUST be validated against its declared JSON schema (see [architecture/api-design.md](../architecture/api-design.md)) before any handler logic runs.
- Reject unknown/extra fields rather than silently ignoring them.
- Reject string fields exceeding a sane maximum length (e.g. 10,000 characters for `observation`) to prevent unbounded memory growth from a single malformed call.
- Never interpret memory content as executable code, shell commands, or SQL — all queries use parameterized statements, never string concatenation.

## Data Handling Rules

- **Plaintext storage is an accepted v1 risk.** Credentials and other sensitive values shared in conversation are stored in plaintext in `.aimem/memory.db`, exactly as they would be in a local `.env` file. This is an explicit, documented v1 decision, not an oversight.
- The trust boundary is: local-only storage + mandatory `.gitignore` exclusion of `.aimem/`. As long as both hold, plaintext storage carries the same risk profile as any other local secret file already in common use.
- This decision is revisitable for v2/open-source: encryption-at-rest for sensitive fields is explicitly listed as deferred in [requirements/PRD.md](../requirements/PRD.md) Non-Goals, to be reconsidered once the project has a broader (non-solo) audience.
- The server MUST auto-add `.aimem/` to the project's `.gitignore` on first initialization if not already present (FR-STORE-06) — this is the primary control preventing accidental credential leakage via version control.
- No memory content is ever transmitted off the local machine — no telemetry, no crash reporting with payloads, no "phone home" of any kind.

## Permissions / Access Control

| Path | Permission | Rationale |
|---|---|---|
| `.aimem/` directory | `0700` (owner rwx only) | Prevents other local OS users from reading project memory |
| `.aimem/memory.db` file | `0600` (owner rw only) | Same rationale, applied to the file itself |

These permissions are set on creation (Phase 2) and are POSIX-specific; Windows relies on default per-user filesystem ACLs since POSIX mode bits do not apply.

## Rate Limiting

Not applicable in v1. Rate limiting exists to protect a shared resource from abuse by multiple untrusted callers (e.g. a public API). aimem has exactly one caller (the local AI client, spawned by the single local user) and no shared resource beyond the local disk — there is no multi-tenant or network-exposed scenario in v1 for rate limiting to defend against. This should be revisited only if a future version introduces network exposure or multi-agent shared access.

See also: [requirements/functional-requirements.md](../requirements/functional-requirements.md) (FR-SEC-*), [error-handling.md](error-handling.md), [../decisions/ADR.md](../decisions/ADR.md).
