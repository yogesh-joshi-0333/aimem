import { resolve } from "node:path";

export function resolveProjectRoot(explicitRoot?: string): string {
  if (explicitRoot !== undefined && explicitRoot.length > 0) {
    return resolve(explicitRoot);
  }
  return resolve(process.cwd());
}
