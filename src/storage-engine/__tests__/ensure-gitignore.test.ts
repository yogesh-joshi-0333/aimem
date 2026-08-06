import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureAimemGitignored } from "../ensure-gitignore.js";

describe("ensureAimemGitignored", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-gitignore-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a .gitignore with the .aimem/ entry if none exists", () => {
    ensureAimemGitignored(dir);
    const contents = readFileSync(join(dir, ".gitignore"), "utf-8");
    expect(contents).toContain(".aimem/");
  });

  it("appends the entry to an existing .gitignore that lacks it", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n");
    ensureAimemGitignored(dir);
    const contents = readFileSync(join(dir, ".gitignore"), "utf-8");
    expect(contents).toContain("node_modules/");
    expect(contents).toContain(".aimem/");
  });

  it("does not duplicate the entry if already present", () => {
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n.aimem/\n");
    ensureAimemGitignored(dir);
    const contents = readFileSync(join(dir, ".gitignore"), "utf-8");
    const occurrences = contents.split("\n").filter((line) => line.trim() === ".aimem/").length;
    expect(occurrences).toBe(1);
  });
});
