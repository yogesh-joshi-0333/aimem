import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingEngine } from "../embedding-engine.js";

describe("Embedding engine — fully offline (FR-EMBED-01, FR-EMBED-05)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("network access attempted — aimem must never call fetch() at embed time");
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("generates an embedding without making any network call", async () => {
    const embedder = new EmbeddingEngine();
    const vector = await embedder.embed("this must work fully offline");
    expect(vector.length).toBe(384);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
