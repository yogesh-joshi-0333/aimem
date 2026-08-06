import type { ObservationRecord } from "../storage-engine/types.js";
import { DUPLICATE_SIMILARITY_THRESHOLD } from "./types.js";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    const row = distances[i];
    if (row !== undefined) {
      row[0] = i;
    }
  }
  for (let j = 0; j < cols; j += 1) {
    const row = distances[0];
    if (row !== undefined) {
      row[j] = j;
    }
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prevRow = distances[i - 1];
      const currentRow = distances[i];
      if (prevRow === undefined || currentRow === undefined) {
        continue;
      }
      const deletion = (prevRow[j] ?? 0) + 1;
      const insertion = (currentRow[j - 1] ?? 0) + 1;
      const substitution = (prevRow[j - 1] ?? 0) + cost;
      currentRow[j] = Math.min(deletion, insertion, substitution);
    }
  }

  return distances[rows - 1]?.[cols - 1] ?? 0;
}

export function stringSimilarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);
  if (normA === normB) {
    return 1;
  }
  const maxLength = Math.max(normA.length, normB.length);
  if (maxLength === 0) {
    return 1;
  }
  const distance = levenshteinDistance(normA, normB);
  return 1 - distance / maxLength;
}

export function isDuplicate(candidateText: string, existingObservations: readonly ObservationRecord[]): boolean {
  return existingObservations.some(
    (existing) => stringSimilarity(candidateText, existing.observation) >= DUPLICATE_SIMILARITY_THRESHOLD,
  );
}
