export class InvalidInputError extends Error {
  constructor(reason: string) {
    super(`Invalid input: ${reason}`);
    this.name = "InvalidInputError";
  }
}
