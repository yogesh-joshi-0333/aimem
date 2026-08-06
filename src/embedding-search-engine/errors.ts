export class EmbeddingModelUnavailableError extends Error {
  constructor(reason: string) {
    super(`Embedding model unavailable: ${reason}`);
    this.name = "EmbeddingModelUnavailableError";
  }
}
