import { pipeline, env } from "@xenova/transformers";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(__dirname, "..", "models");
// Must match EMBEDDING_MODEL_NAME in src/config.ts — kept as a literal here
// because this script runs standalone via npm's postinstall hook, before src/ is compiled.
const modelName = "Xenova/all-MiniLM-L6-v2";
const markerFile = join(modelsDir, ".bundled");

if (existsSync(markerFile)) {
  process.stderr.write(`aimem: embedding model already bundled at ${modelsDir}\n`);
  process.exit(0);
}

env.cacheDir = modelsDir;
env.allowRemoteModels = true;

process.stderr.write(`aimem: bundling embedding model ${modelName} into ${modelsDir} ...\n`);

await pipeline("feature-extraction", modelName);

const { writeFileSync, mkdirSync } = await import("node:fs");
mkdirSync(dirname(markerFile), { recursive: true });
writeFileSync(markerFile, new Date().toISOString());

process.stderr.write("aimem: embedding model bundled successfully.\n");
