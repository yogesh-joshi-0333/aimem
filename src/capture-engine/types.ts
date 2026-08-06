import type { SourceTrigger } from "../storage-engine/types.js";

export interface CaptureCandidate {
  readonly entity: string;
  readonly entity_type: string;
  readonly observation: string;
  readonly attribute?: string;
}

export interface StoreResult {
  readonly id: string;
  readonly created_at: string;
  readonly conflict_detected: false;
}

export interface StoreConflictResult {
  readonly conflict_detected: true;
  readonly conflict_id: string;
  readonly existing_value: string;
  readonly new_value: string;
}

export type StoreOutcome = StoreResult | StoreConflictResult;

export interface ScanConflictSummary {
  readonly conflict_id: string;
  readonly entity: string;
  readonly existing_value: string;
  readonly new_value: string;
}

export interface ScanResult {
  readonly stored: readonly string[];
  readonly skipped_duplicates: readonly string[];
  readonly conflicts: readonly ScanConflictSummary[];
}

export const DUPLICATE_SIMILARITY_THRESHOLD = 0.95;

export type { SourceTrigger };
