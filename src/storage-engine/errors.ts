export class StorageCorruptedError extends Error {
  constructor(public readonly dbPath: string) {
    super(`Storage file at ${dbPath} failed integrity check`);
    this.name = "StorageCorruptedError";
  }
}
