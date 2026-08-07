export class ConflictNotFoundError extends Error {
  constructor(conflictId: string) {
    super(`No pending conflict found with id ${conflictId}`);
    this.name = "ConflictNotFoundError";
  }
}

export class ObservationNotFoundError extends Error {
  constructor(observationId: string) {
    super(`No observation found with id ${observationId}`);
    this.name = "ObservationNotFoundError";
  }
}
