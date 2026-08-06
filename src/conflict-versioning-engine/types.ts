export interface ConflictCheckResult {
  readonly conflict_detected: true;
  readonly conflict_id: string;
  readonly existing_value: string;
  readonly new_value: string;
}

export type ConfirmAction = "confirm" | "reject";

export interface ConfirmUpdateResult {
  readonly updated: boolean;
  readonly new_version?: number;
}
