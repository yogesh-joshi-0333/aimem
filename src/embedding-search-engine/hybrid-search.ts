import type Database from "better-sqlite3";
import { searchKeyword } from "./keyword-search.js";
import { searchSimilar } from "./vector-index.js";
import { MIN_HYBRID_CANDIDATE_POOL_SIZE } from "./types.js";
import type { HybridSearchResult } from "./types.js";

const RRF_K = 60; // standard Reciprocal Rank Fusion smoothing constant

/**
 * Combines vector similarity search and FTS5 keyword search via Reciprocal
 * Rank Fusion (RRF) rather than trying to normalize and blend two
 * differently-scaled raw scores (sqlite-vec's distance and FTS5's bm25-based
 * rank are not on comparable scales, and empirically FTS5's rank column is
 * an unbounded small-negative number that varies with corpus statistics —
 * see docs/implementation/phases.md Phase 9E). RRF combines by *rank
 * position* in each list, not raw score, which sidesteps that problem
 * entirely and is a well-established, robust fusion technique.
 *
 * A result appearing near the top of either list scores highly; a result
 * appearing in both lists scores higher than either alone.
 */
export async function searchHybrid(
  db: Database.Database,
  queryEmbedding: Float32Array,
  queryText: string,
  limit: number,
): Promise<readonly HybridSearchResult[]> {
  // Each mode's candidate pool must be at least `limit` -- a fixed pool size smaller than
  // the caller's requested limit would structurally cap results below what was asked for
  // even when enough distinct live candidates exist (found during the post-launch
  // hardening pass: MAX_SEARCH_LIMIT allows up to 50, but the pool was a fixed 20).
  const candidatePoolSize = Math.max(limit, MIN_HYBRID_CANDIDATE_POOL_SIZE);
  const vectorResults = searchSimilar(db, queryEmbedding, candidatePoolSize);
  const keywordResults = searchKeyword(db, queryText, candidatePoolSize);

  const scores = new Map<string, number>();

  vectorResults.forEach((result, index) => {
    const rrfScore = 1 / (RRF_K + index + 1);
    scores.set(result.observation_id, (scores.get(result.observation_id) ?? 0) + rrfScore);
  });

  keywordResults.forEach((result, index) => {
    const rrfScore = 1 / (RRF_K + index + 1);
    scores.set(result.observation_id, (scores.get(result.observation_id) ?? 0) + rrfScore);
  });

  return Array.from(scores.entries())
    .map(([observation_id, score]) => ({ observation_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
