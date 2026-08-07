export type SourceTrigger = "event" | "turn_scan" | "context_threshold_scan" | "manual";

export interface EntityRecord {
  readonly id: string;
  readonly name: string;
  readonly entity_type: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateEntityInput {
  readonly name: string;
  readonly entity_type: string;
}

export interface RelationRecord {
  readonly id: string;
  readonly from_entity_id: string;
  readonly to_entity_id: string;
  readonly relation_type: string;
  readonly created_at: string;
}

export interface CreateRelationInput {
  readonly from_entity_id: string;
  readonly to_entity_id: string;
  readonly relation_type: string;
}

export interface ObservationRecord {
  readonly id: string;
  readonly entity_id: string;
  readonly attribute: string | null;
  readonly observation: string;
  readonly confidence: number;
  readonly source_trigger: SourceTrigger;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly invalidated_at: string | null;
}

export interface CreateObservationInput {
  readonly entity_id: string;
  readonly attribute?: string;
  readonly observation: string;
  readonly confidence?: number;
  readonly source_trigger: SourceTrigger;
}

export interface ObservationVersionRecord {
  readonly id: string;
  readonly observation_id: string;
  readonly version: number;
  readonly value: string;
  readonly superseded_at: string;
  readonly superseded_by_version: number;
}

export type ConflictStatus = "pending" | "confirmed" | "rejected";

export interface ConflictRecord {
  readonly id: string;
  readonly observation_id: string;
  readonly existing_value: string;
  readonly new_value: string;
  readonly status: ConflictStatus;
  readonly created_at: string;
  readonly resolved_at: string | null;
}
