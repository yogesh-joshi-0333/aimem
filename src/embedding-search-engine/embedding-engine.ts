import { pipeline, env } from "@xenova/transformers";
import type { FeatureExtractionPipeline } from "@xenova/transformers";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMBEDDING_MODEL_DIR_NAME, EMBEDDING_MODEL_NAME } from "../config.js";
import { EmbeddingModelUnavailableError } from "./errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..", "..");
const MODELS_DIR = join(PACKAGE_ROOT, EMBEDDING_MODEL_DIR_NAME);

export class EmbeddingEngine {
  private embedder: FeatureExtractionPipeline | undefined;
  private loadPromise: Promise<FeatureExtractionPipeline> | undefined;

  private async loadModel(): Promise<FeatureExtractionPipeline> {
    if (this.embedder !== undefined) {
      return this.embedder;
    }
    if (this.loadPromise !== undefined) {
      return this.loadPromise;
    }

    if (!existsSync(join(MODELS_DIR, ".bundled"))) {
      throw new EmbeddingModelUnavailableError(
        "bundled model files not found under models/ — reinstall aimem to bundle the embedding model",
      );
    }

    env.cacheDir = MODELS_DIR;
    env.allowRemoteModels = false;

    this.loadPromise = pipeline("feature-extraction", EMBEDDING_MODEL_NAME).catch((err: unknown) => {
      this.loadPromise = undefined;
      throw new EmbeddingModelUnavailableError(err instanceof Error ? err.message : "unknown load failure");
    });

    this.embedder = await this.loadPromise;
    return this.embedder;
  }

  async embed(text: string): Promise<Float32Array> {
    const model = await this.loadModel();
    const output = await model(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data as Float32Array);
  }
}
