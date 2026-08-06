import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AIMEM_DIR_NAME } from "../config.js";

const GITIGNORE_ENTRY = `${AIMEM_DIR_NAME}/`;

export function ensureAimemGitignored(projectRoot: string): void {
  const gitignorePath = join(projectRoot, ".gitignore");

  if (!existsSync(gitignorePath)) {
    appendFileSync(gitignorePath, `${GITIGNORE_ENTRY}\n`);
    return;
  }

  const contents = readFileSync(gitignorePath, "utf-8");
  const alreadyPresent = contents
    .split("\n")
    .some((line) => line.trim() === GITIGNORE_ENTRY || line.trim() === AIMEM_DIR_NAME);

  if (!alreadyPresent) {
    const needsLeadingNewline = contents.length > 0 && !contents.endsWith("\n");
    appendFileSync(gitignorePath, `${needsLeadingNewline ? "\n" : ""}${GITIGNORE_ENTRY}\n`);
  }
}
