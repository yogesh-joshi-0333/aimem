import type Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { randomInt } from "node:crypto";
import { EMBEDDING_DIMENSIONS } from "./types.js";
import type { SimilaritySearchResult } from "./types.js";

export function registerVecExtension(db: Database.Database): void {
  sqliteVec.load(db);
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_observations USING vec0(embedding float[${EMBEDDING_DIMENSIONS}])`,
  );
}

function toBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

function nowIso(): string {
  return new Date().toISOString();
}

const MAX_RANDOM_ROWID = 2 ** 48 - 1; // node:crypto randomInt's supported range ceiling

function nextVecRowid(): bigint {
  // 48-bit random rowid: astronomically unlikely to collide within a single project's memory.db,
  // and a UNIQUE constraint on observation_embeddings.vec_rowid catches the rare case if it ever happens.
  return BigInt(randomInt(0, MAX_RANDOM_ROWID));
}

export function upsertEmbedding(db: Database.Database, observationId: string, embedding: Float32Array): void {
  const buffer = toBuffer(embedding);
  const existing = db
    .prepare(`SELECT vec_rowid FROM observation_embeddings WHERE observation_id = ?`)
    .get(observationId) as { vec_rowid: number } | undefined;

  if (existing !== undefined) {
    db.prepare(`UPDATE vec_observations SET embedding = ? WHERE rowid = ?`).run(buffer, BigInt(existing.vec_rowid));
    return;
  }

  let vecRowid = nextVecRowid();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const collision = db.prepare(`SELECT 1 FROM observation_embeddings WHERE vec_rowid = ?`).get(vecRowid);
    if (collision === undefined) {
      break;
    }
    vecRowid = nextVecRowid();
  }

  db.prepare(`INSERT INTO vec_observations (rowid, embedding) VALUES (?, ?)`).run(vecRowid, buffer);
  db.prepare(
    `INSERT INTO observation_embeddings (observation_id, vec_rowid, created_at) VALUES (?, ?, ?)`,
  ).run(observationId, vecRowid, nowIso());
}

export function searchSimilar(
  db: Database.Database,
  queryEmbedding: Float32Array,
  limit: number,
): readonly SimilaritySearchResult[] {
  const buffer = toBuffer(queryEmbedding);
  const rows = db
    .prepare(
      `SELECT oe.observation_id as observation_id, v.distance as distance
       FROM vec_observations v
       JOIN observation_embeddings oe ON oe.vec_rowid = v.rowid
       WHERE v.embedding MATCH ? AND k = ?
       ORDER BY v.distance`,
    )
    .all(buffer, limit) as ReadonlyArray<{ observation_id: string; distance: number }>;
  return rows.map((row) => ({ observation_id: row.observation_id, distance: row.distance }));
}
