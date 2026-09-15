import type {
  ActorId,
  CandidateId,
  ContentHash,
  EvidenceId,
  FinancialEventId,
  IdempotencyKey,
  OrganizationId,
  RequestId,
  SourceArtifactId,
  SourceId,
  TraceId,
  Uuid,
} from "../domain/common/ids.ts";
import type { Rfc3339Timestamp } from "../domain/common/time.ts";
import type { ActorRef } from "../domain/organizations/organization.ts";
import type { EvidenceRef, SourceRef } from "../domain/events/financial-event.ts";

export const M3_SCHEMA_VERSION = "wendy.m3.source-evidence/0.1.0" as const;
export const M3_SOURCE_RECORD_CANONICALIZATION_VERSION = "wendy.m3.source-record-canonical/0.1.0" as const;
export const M3_MANUAL_ARTIFACT_CANONICALIZATION_VERSION = "wendy.m3.manual-input-artifact-canonical/0.1.0" as const;
export const M3_AUTHORIZATION_RECORD_VERSION = "wendy.m3.trusted-source-evidence-authorization/1.0.0" as const;
/** Versioned supplement; the original M3 v0.1 authorization record remains immutable history. */
export const M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION = "wendy.m3.authorization-lifecycle/0.1.0" as const;

export const M3_SOURCE_TYPES = ["MANUAL_USER_INPUT", "FILE_UPLOAD", "BANK_RECORD_IMPORT"] as const;
export const M3_ARTIFACT_TYPES = ["MANUAL_INPUT_PAYLOAD", "FILE", "BANK_IMPORT"] as const;
export const M3_EVIDENCE_TYPES = ["SOURCE_ARTIFACT", "DOCUMENT", "USER_CONFIRMATION", "EXTERNAL_RECORD"] as const;
export const M3_LINEAGE_TYPES = ["DERIVED_FROM", "SUPERSEDES", "REPLACES"] as const;

export const M3_CAPABILITIES = {
  issue_authorization: "M3_SOURCE_EVIDENCE_DECISION_ISSUER",
  ingest: "M3_SOURCE_EVIDENCE_INGEST",
  read_raw: "M3_RAW_EVIDENCE_READ",
  correct: "M3_SOURCE_EVIDENCE_CORRECT",
  availability: "M3_RAW_EVIDENCE_AVAILABILITY",
  normalize: "M3_NORMALIZE_EVIDENCE",
  confirm: "M3_USER_CONFIRM_SOURCE_FACTS",
  trace: "M3_TRACE_LINK",
} as const;

export type M3SourceType = (typeof M3_SOURCE_TYPES)[number];
export type M3ArtifactType = (typeof M3_ARTIFACT_TYPES)[number];
export type M3EvidenceType = (typeof M3_EVIDENCE_TYPES)[number];
export type M3LineageType = (typeof M3_LINEAGE_TYPES)[number];
export type SourceRecordId = string & { readonly __brand: "SourceRecordId" };
export type NormalizationRunId = Uuid;
export type ConfirmationId = Uuid;
export type SourceLineageRelationId = Uuid;
export type ArtifactAvailabilityRecordId = Uuid;
export type M3AuthorizationDecisionId = Uuid;
export type M3CreationIntentId = Uuid;
export type M3AuthorizationLifecycleFactId = Uuid;
export type M3AuthorizationConsumptionId = Uuid;
export type M3AuthorizationDenialAuditId = Uuid;

/** The exact existing-resource operations frozen by the lifecycle amendment. */
export const M3_PROTECTED_AUTHORIZATION_OPERATIONS = [
  "READ_RAW_ARTIFACT",
  "READ_RAW_SOURCE_RECORD",
  "READ_EVIDENCE",
  "CORRECT_SOURCE_RECORD",
  "MARK_ARTIFACT_UNAVAILABLE",
] as const;
export type M3ProtectedAuthorizationOperation = (typeof M3_PROTECTED_AUTHORIZATION_OPERATIONS)[number];

export const M3_AUTHORIZATION_TARGET_TYPES = ["SOURCE_ARTIFACT", "SOURCE_RECORD", "EVIDENCE"] as const;
export type M3AuthorizationTargetType = (typeof M3_AUTHORIZATION_TARGET_TYPES)[number];

export interface AuthorizationTargetBinding {
  readonly target_type: M3AuthorizationTargetType;
  readonly target_id: string;
  readonly target_content_identity: ContentHash;
}

/**
 * An authority-neutral, immutable server record describing one proposed
 * creation. It is deliberately not an authorization grant.
 */
export interface M3CreationIntent {
  readonly creation_intent_id: M3CreationIntentId;
  readonly organization_id: OrganizationId;
  readonly operation: string;
  readonly requesting_principal: ActorRef;
  readonly proposed_target_resource_type: string;
  readonly proposed_target_resource_id: string;
  readonly creation_payload_hash: ContentHash;
  readonly parent_resource_identity: string | null;
  readonly content_hash: ContentHash | null;
  readonly authorization_contract_version: typeof M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION;
  readonly created_at: Rfc3339Timestamp;
  readonly integrity_provenance_hash: ContentHash;
}

/** One opaque, trusted authorization for one exact existing target or intent. */
export interface M3TargetBoundAuthorizationDecision {
  readonly authorization_decision_id: M3AuthorizationDecisionId;
  readonly organization_id: OrganizationId;
  readonly authorized_principal: ActorRef;
  readonly operation: string;
  readonly target?: AuthorizationTargetBinding;
  readonly creation_intent_id?: M3CreationIntentId;
  readonly authorization_contract_version: typeof M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION;
  readonly issued_at: Rfc3339Timestamp;
  readonly expires_at: Rfc3339Timestamp | null;
  readonly issuer: {
    readonly actor: ActorRef;
    readonly capability_evidence_ref: string;
    readonly authority_provenance_ref: string;
  };
  readonly immutable_evidence_provenance_ref: string;
  readonly decision_integrity_hash: ContentHash;
}

export type M3AuthorizationLifecycleOutcome = "ACTIVE" | "SUPERSEDED" | "REVOKED" | "EXPIRED";
export type M3AuthorizationLifecycleAction = "SUPERSEDED" | "REVOKED";

export interface M3AuthorizationLifecycleFact {
  readonly authorization_lifecycle_fact_id: M3AuthorizationLifecycleFactId;
  readonly lifecycle_version: number;
  readonly organization_id: OrganizationId;
  readonly affected_authorization_decision_id: M3AuthorizationDecisionId;
  readonly action: M3AuthorizationLifecycleAction;
  readonly replacement_authorization_decision_id: M3AuthorizationDecisionId | null;
  readonly occurred_at: Rfc3339Timestamp;
  readonly authority: ActorRef;
  readonly authority_evidence_ref: string;
  readonly reason_ref: string;
  readonly immutable_provenance_hash: ContentHash;
}

export interface M3AuthorizationConsumption {
  readonly authorization_consumption_id: M3AuthorizationConsumptionId;
  readonly organization_id: OrganizationId;
  readonly authorization_decision_id: M3AuthorizationDecisionId;
  readonly decision_integrity_hash: ContentHash;
  readonly authorization_contract_version: typeof M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION;
  readonly observed_lifecycle_outcome: M3AuthorizationLifecycleOutcome;
  readonly observed_lifecycle_version: number | null;
  readonly principal: ActorRef;
  readonly operation: string;
  readonly target: AuthorizationTargetBinding | {
    readonly target_type: "CREATION_INTENT";
    readonly target_id: M3CreationIntentId;
    readonly target_content_identity: ContentHash;
  };
  readonly consumed_at: Rfc3339Timestamp;
  readonly request_id: RequestId;
  readonly trace_id: TraceId;
  readonly result: "ALLOWED";
  readonly policy_version_ref: typeof M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION;
  readonly immutable_provenance_hash: ContentHash;
}

/** Non-authoritative audit evidence: a denial must never be recorded as consumption. */
export interface M3AuthorizationDenialAudit {
  readonly authorization_denial_audit_id: M3AuthorizationDenialAuditId;
  readonly organization_id: OrganizationId;
  readonly requesting_principal: ActorRef;
  readonly requested_operation: string;
  readonly supplied_authorization_decision_id?: M3AuthorizationDecisionId;
  readonly opaque_target_ref: string;
  readonly evaluated_at: Rfc3339Timestamp;
  readonly outcome: "DENIED";
  readonly reason_code: string;
  readonly request_id: RequestId;
  readonly trace_id: TraceId;
  readonly policy_version_ref: typeof M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION;
  readonly immutable_provenance_hash: ContentHash;
}

export interface SourceArtifactLink {
  readonly source_artifact_id: SourceArtifactId;
  readonly link_kind: "ORIGINATED" | "REDELIVERED";
  readonly linked_at: Rfc3339Timestamp;
}

export interface Source {
  readonly source_id: SourceId;
  readonly organization_id: OrganizationId;
  readonly source_type: M3SourceType;
  readonly source_system_ref?: string;
  readonly original_external_reference?: string;
  readonly status: string;
  readonly received_at: Rfc3339Timestamp;
  readonly captured_at?: Rfc3339Timestamp;
  readonly ingestion_request_id: RequestId;
  readonly received_by: ActorRef;
  readonly idempotency_key: IdempotencyKey;
  readonly trace_id: TraceId;
  readonly artifact_links: readonly SourceArtifactLink[];
  readonly allowlisted_metadata?: Readonly<Record<string, string>>;
  readonly created_at: Rfc3339Timestamp;
}

export interface SourceArtifact {
  readonly source_artifact_id: SourceArtifactId;
  readonly organization_id: OrganizationId;
  readonly source_id: SourceId;
  readonly artifact_type: M3ArtifactType;
  readonly original_name?: string;
  readonly declared_content_type?: string;
  readonly detected_content_type?: string;
  readonly content_hash: ContentHash;
  readonly byte_size: number;
  readonly content_admission_policy_ref: string;
  readonly received_at: Rfc3339Timestamp;
  readonly storage_content_ref: string;
  readonly created_at: Rfc3339Timestamp;
  readonly created_by: ActorRef;
  readonly immutable_provenance_ref: string;
}

export interface SourceRecord {
  readonly source_record_id: SourceRecordId;
  readonly organization_id: OrganizationId;
  readonly source_id: SourceId;
  readonly source_artifact_id: SourceArtifactId;
  readonly source_system_ref?: string;
  readonly record_locator?: string;
  readonly external_record_identity?: string;
  readonly observed_at?: Rfc3339Timestamp;
  readonly source_timestamp?: Rfc3339Timestamp;
  readonly canonicalization_version: typeof M3_SOURCE_RECORD_CANONICALIZATION_VERSION;
  readonly canonical_content_hash: ContentHash;
  readonly raw_record_content_ref: string;
  readonly created_at: Rfc3339Timestamp;
  readonly immutable_provenance_ref: string;
}

export interface Evidence {
  readonly evidence_id: EvidenceId;
  readonly organization_id: OrganizationId;
  readonly evidence_type: M3EvidenceType;
  readonly source_id: SourceId;
  readonly source_artifact_id: SourceArtifactId;
  readonly source_record_id?: SourceRecordId;
  readonly content_hash: ContentHash;
  readonly extraction_or_normalization_provenance_ref?: string;
  readonly created_at: Rfc3339Timestamp;
  readonly created_by: ActorRef;
  readonly immutable_provenance_ref: string;
}

export interface NormalizationRun {
  readonly normalization_run_id: NormalizationRunId;
  readonly organization_id: OrganizationId;
  readonly normalizer: ActorRef;
  readonly normalizer_version: string;
  readonly transformation_provenance_ref: string;
  readonly input_evidence_refs: readonly EvidenceRef[];
  readonly started_at: Rfc3339Timestamp;
  readonly completed_at: Rfc3339Timestamp;
  readonly immutable_output_hash: ContentHash;
}

export interface ObservedMoney { readonly value: string; readonly currency: string; }

export interface NormalizedCandidateObservation {
  readonly candidate_id: CandidateId;
  readonly organization_id: OrganizationId;
  readonly candidate_version: number;
  readonly candidate_hash: ContentHash;
  readonly candidate_kind: "PAID_EXPENSE_OBSERVATION";
  readonly authority: "OBSERVATION_ONLY";
  readonly evidence_refs: readonly EvidenceRef[];
  readonly source_refs: readonly SourceRef[];
  readonly normalization_run_id: NormalizationRunId;
  readonly normalization_version: string;
  readonly normalizer: ActorRef;
  readonly normalized_at: Rfc3339Timestamp;
  readonly transformation_provenance_ref: string;
  readonly observed_amount?: ObservedMoney;
  readonly observed_effective_date?: string;
  readonly observed_payment_date?: string;
  readonly observed_counterparty?: { readonly display_name?: string; readonly external_reference?: string };
  readonly observed_payment_source?: { readonly display_label?: string; readonly external_reference?: string };
  readonly semantic_category_proposal?: string;
  readonly unresolved_fields: readonly string[];
  readonly confidence?: number;
  readonly created_at: Rfc3339Timestamp;
  readonly immutable_provenance_ref: string;
}

export interface CandidateSourceFactConfirmation {
  readonly confirmation_id: ConfirmationId;
  readonly organization_id: OrganizationId;
  readonly candidate_id: CandidateId;
  readonly expected_candidate_version: number;
  readonly expected_candidate_hash: ContentHash;
  readonly confirmed_by: ActorRef;
  readonly confirmed_at: Rfc3339Timestamp;
  readonly confirmation_evidence_ref: EvidenceRef;
  readonly confirmed_field_keys: readonly ("amount" | "currency" | "effective_or_business_date" | "payment_source_observation" | "counterparty_or_merchant_observation" | "semantic_category_proposal" | "source_evidence_linkage")[];
  readonly authority: "SOURCE_BUSINESS_FACTS_ONLY";
  readonly confirmation_scope_version: string;
  readonly confirmation_hash: ContentHash;
}

export interface SourceLineageRelation {
  readonly source_lineage_relation_id: SourceLineageRelationId;
  readonly organization_id: OrganizationId;
  readonly relation_type: M3LineageType;
  readonly from_object_type: "NORMALIZATION_RUN" | "NORMALIZED_CANDIDATE" | "SOURCE_RECORD" | "SOURCE_ARTIFACT";
  readonly from_object_id: string;
  readonly to_object_type: "EVIDENCE" | "SOURCE_RECORD" | "SOURCE_ARTIFACT";
  readonly to_object_id: string;
  readonly reason_ref?: string;
  readonly created_at: Rfc3339Timestamp;
  readonly created_by: ActorRef;
  readonly immutable_provenance_ref: string;
}

export interface ArtifactAvailabilityRecord {
  readonly artifact_availability_record_id: ArtifactAvailabilityRecordId;
  readonly organization_id: OrganizationId;
  readonly source_artifact_id: SourceArtifactId;
  readonly original_content_hash: ContentHash;
  readonly original_declared_content_type?: string;
  readonly original_detected_content_type?: string;
  readonly original_byte_size?: number;
  readonly original_source_locator_or_reference?: string;
  readonly availability: "AVAILABLE" | "UNAVAILABLE";
  readonly authorized_at: Rfc3339Timestamp;
  readonly reason_ref: string;
  readonly authorized_by: ActorRef;
  readonly authorization_decision_ref: M3AuthorizationDecisionId;
  readonly authorization_capability_ref: string;
  /** Additive M3 provenance retained when raw bytes later become unavailable. */
  readonly historical_source_ids: readonly SourceId[];
  readonly historical_source_record_ids: readonly SourceRecordId[];
  readonly historical_evidence_ids: readonly EvidenceId[];
  readonly historical_financial_event_refs: readonly { readonly event_id: FinancialEventId; readonly event_version: number }[];
  readonly historical_journal_entry_refs: readonly string[];
  readonly immutable_provenance_ref: string;
}

export interface M3CapabilityGrant {
  readonly organization_id: OrganizationId;
  readonly actor_id: ActorId;
  readonly membership_status: "ACTIVE" | "INACTIVE";
  readonly capabilities: readonly string[];
  readonly membership_evidence_ref: string;
}

export interface SourceEvidenceAuthorizationDecision {
  readonly authorization_decision_id: M3AuthorizationDecisionId;
  readonly organization_id: OrganizationId;
  readonly actor: ActorRef;
  readonly requested_capability_ref: string;
  readonly decision: "ALLOWED" | "DENIED";
  readonly evaluated_at: Rfc3339Timestamp;
  readonly decision_provenance_ref: string;
}

export interface TrustedSourceEvidenceAuthorizationRecord {
  readonly record_contract_version: typeof M3_AUTHORIZATION_RECORD_VERSION;
  readonly decision: SourceEvidenceAuthorizationDecision;
  readonly issued_by: { readonly actor: ActorRef; readonly capability_evidence_ref: string; readonly authority_provenance_ref: string };
  readonly immutable_evidence_provenance_ref: string;
  readonly recorded_at: Rfc3339Timestamp;
  readonly integrity_provenance_hash: ContentHash;
}

export interface ArtifactDuplicateResult {
  readonly organization_id: OrganizationId;
  readonly submitted_source_id: SourceId;
  readonly submitted_content_hash: ContentHash;
  readonly canonical_source_artifact_id: SourceArtifactId;
  readonly resolution: "NEW_ARTIFACT" | "DUPLICATE_ARTIFACT";
  readonly evaluated_at: Rfc3339Timestamp;
  readonly provenance_ref: string;
}

export interface SourceRecordDuplicateResult {
  readonly organization_id: OrganizationId;
  readonly submitted_source_id: SourceId;
  readonly submitted_source_artifact_id: SourceArtifactId;
  readonly submitted_record_locator?: string;
  readonly submitted_external_record_identity?: string;
  readonly submitted_canonical_content_hash: ContentHash;
  readonly source_record_id?: SourceRecordId;
  readonly canonical_source_record_id?: SourceRecordId;
  readonly resolution: "NEW_RECORD" | "DUPLICATE_RECORD" | "DISTINCT_RECORD" | "REVIEW_REQUIRED";
  readonly identity_basis: "STABLE_EXTERNAL_RECORD_IDENTITY" | "ARTIFACT_AND_RECORD_LOCATOR" | "NONE";
  readonly evaluated_at: Rfc3339Timestamp;
  readonly provenance_ref: string;
}

export interface CandidateToFinancialEventHandoff {
  readonly organization_id: OrganizationId;
  readonly candidate_id: CandidateId;
  readonly expected_candidate_version: number;
  readonly expected_candidate_hash: ContentHash;
  readonly source_refs: readonly SourceRef[];
  readonly evidence_refs: readonly EvidenceRef[];
  /** Required evidence that binds the user confirmation to this exact candidate. */
  readonly confirmation_evidence_ref: EvidenceRef;
  readonly requested_by: ActorRef;
  readonly request_id: RequestId;
  readonly trace_id: TraceId;
}

export interface FinancialEventTraceReference {
  readonly event_id: FinancialEventId;
  readonly event_version: number;
  readonly event_type: "ExpenseRecognized" | "PaymentMade";
}

export interface JournalTraceReference { readonly journal_entry_id: string; }
