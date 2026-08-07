export class StorageCorruptedError extends Error {
  constructor(public readonly dbPath: string) {
    // Deliberately does NOT interpolate dbPath into the message (defense-in-depth, found
    // during the post-launch hardening pass): tool-router.ts currently only ever branches on
    // `instanceof StorageCorruptedError` and never reads `.message` for this error, but
    // keeping the absolute path out of .message means a future refactor that logs or
    // forwards `.message` by mistake can't leak it across the MCP tool-call boundary
    // (FR-ERR-04). The path is still available via the `dbPath` field for internal logging.
    super("Storage file failed integrity check");
    this.name = "StorageCorruptedError";
  }
}
