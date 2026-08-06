import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../storage-engine.js";

describe("StorageEngine — concurrent access (FR-ERR-05)", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-concurrency-test-"));
    dbPath = join(dir, "memory.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("allows two StorageEngine instances on the same file to write without corruption", () => {
    const engineA = new StorageEngine(dbPath);
    const engineB = new StorageEngine(dbPath);

    const entityA = engineA.createEntity({ name: "from-a", entity_type: "decision" });
    const entityB = engineB.createEntity({ name: "from-b", entity_type: "decision" });

    engineA.createObservation({
      entity_id: entityA.id,
      observation: "written by engine A",
      source_trigger: "event",
    });
    engineB.createObservation({
      entity_id: entityB.id,
      observation: "written by engine B",
      source_trigger: "event",
    });

    expect(engineB.getEntityByName("from-a", "decision")?.id).toBe(entityA.id);
    expect(engineA.getEntityByName("from-b", "decision")?.id).toBe(entityB.id);
    expect(engineA.countEntities()).toBe(2);
    expect(engineB.countEntities()).toBe(2);

    engineA.close();
    engineB.close();
  });

  it("both writes persist after both connections close and a third connection reopens the file", () => {
    const engineA = new StorageEngine(dbPath);
    const engineB = new StorageEngine(dbPath);
    engineA.createEntity({ name: "persisted-a", entity_type: "decision" });
    engineB.createEntity({ name: "persisted-b", entity_type: "decision" });
    engineA.close();
    engineB.close();

    const engineC = new StorageEngine(dbPath);
    expect(engineC.countEntities()).toBe(2);
    engineC.close();
  });
});
