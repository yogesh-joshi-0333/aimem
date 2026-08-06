export class ConflictNotFoundError extends Error {
  constructor(conflictId: string) {
    super(`No pending conflict found with id ${conflictId}`);
    this.name = "ConflictNotFoundError";
  }
}
