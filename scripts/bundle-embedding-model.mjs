import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(__dirname, "..", "models");
const markerFile = join(modelsDir, ".bundled");
// Set AIMEM_BUNDLE_MODEL=1 to actually download the model (maintainer-only, run before
// `npm publish`/`npm pack` so the tarball ships with the model already present). This
// script also runs as every end user's `npm install` postinstall hook -- see below.
const allowDownload = process.env.AIMEM_BUNDLE_MODEL === "1";

if (existsSync(markerFile)) {
  process.stderr.write(`aimem: embedding model already bundled at ${modelsDir}\n`);
  process.exit(0);
}

if (!allowDownload) {
  // aimem is documented and marketed as fully offline (FR-EMBED-01/05) -- the model must
  // ship inside the published npm tarball's models/ directory (see package.json's `files`
  // allowlist), never fetched at install time. If the marker file is missing here, the
  // package itself is broken (corrupted download, install from a source that doesn't
  // include models/, etc.) -- fail loudly instead of silently reaching out to Hugging Face
  // Hub, which would violate the offline guarantee without the user's knowledge or consent.
  process.stderr.write(
    "aimem: embedding model files not found under models/ — this install appears incomplete " +
      "or corrupted (the published package should always include a bundled model). " +
      "Please reinstall aimem-mcp from the npm registry. Refusing to download the model over " +
      "the network, since aimem is designed to run fully offline.\n",
  );
  process.exit(1);
}

const { pipeline, env } = await import("@xenova/transformers");
// Must match EMBEDDING_MODEL_NAME in src/config.ts — kept as a literal here
// because this script runs standalone via npm's postinstall hook, before src/ is compiled.
const modelName = "Xenova/all-MiniLM-L6-v2";

env.cacheDir = modelsDir;
env.allowRemoteModels = true;

process.stderr.write(`aimem: bundling embedding model ${modelName} into ${modelsDir} ...\n`);

await pipeline("feature-extraction", modelName);

const { writeFileSync, mkdirSync } = await import("node:fs");
mkdirSync(dirname(markerFile), { recursive: true });
writeFileSync(markerFile, new Date().toISOString());

process.stderr.write("aimem: embedding model bundled successfully.\n");
