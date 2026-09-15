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

import { assertArtifactAdmitted, type ArtifactAdmissionPolicy } from "./admission.ts";
import {
  assertCreationIntent,
  assertExactCreationIntent,
  assertExactTarget,
  assertTargetBoundAuthorizationDecision,
  authorizationConsumptionHash,
  authorizationLifecycleFactHash,
  assertAuthorizedSourceEvidenceAction,
  assertTrustedSourceEvidenceAuthorizationRecord,
  creationIntentIntegrityHash,
  lifecycleOutcome,
} from "./authority.ts";
import { canonicalJson, deepFreeze, newM3Uuid, sha256Bytes, sha256Canonical, type M3CanonicalValue } from "./canonical.ts";
import {
  M3_ARTIFACT_TYPES,
  M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION,
  M3_CAPABILITIES,
  M3_EVIDENCE_TYPES,
  M3_LINEAGE_TYPES,
  M3_MANUAL_ARTIFACT_CANONICALIZATION_VERSION,
  M3_SCHEMA_VERSION,
  M3_SOURCE_RECORD_CANONICALIZATION_VERSION,
  M3_SOURCE_TYPES,
  type ArtifactAvailabilityRecord,
  type ArtifactDuplicateResult,
  type CandidateSourceFactConfirmation,
  type CandidateToFinancialEventHandoff,
  type Evidence,
  type FinancialEventTraceReference,
  type JournalTraceReference,
  type M3ArtifactType,
  type AuthorizationTargetBinding,
  type M3AuthorizationConsumption,
  type M3AuthorizationDenialAudit,
  type M3AuthorizationLifecycleFact,
  type M3AuthorizationLifecycleAction,
  type M3CreationIntent,
  type M3TargetBoundAuthorizationDecision,
  type M3CapabilityGrant,
  type M3EvidenceType,
  type M3SourceType,
  type NormalizationRun,
  type NormalizedCandidateObservation,
  type Source,
  type SourceArtifact,
  type SourceLineageRelation,
  type SourceRecord,
  type SourceRecordDuplicateResult,
  type SourceRecordId,
  type TrustedSourceEvidenceAuthorizationRecord,
} from "./contracts.ts";
import { M3AuthorizationDeniedError, M3ContractError } from "./errors.ts";
import { SqliteSourceEvidenceStore } from "./sqlite-source-evidence-store.ts";

type AuthorizationCommand = {
  readonly organization_id: OrganizationId;
  readonly actor: ActorRef;
  readonly authorization_decision_id: Uuid;
  /** Required for target-bound v2 consumption; legacy callers are rejected. */
  readonly request_id?: RequestId;
  readonly trace_id?: TraceId;
  readonly creation_intent_id?: Uuid;
};

export interface TrustedClock {
  now(): Rfc3339Timestamp;
}

export const systemTrustedClock: TrustedClock = Object.freeze({
  now: () => new Date().toISOString() as Rfc3339Timestamp,
});

export interface CreateSourceCommand extends AuthorizationCommand {
  readonly source_type: M3SourceType;
  readonly source_system_ref?: string;
  readonly original_external_reference?: string;
  readonly received_at: Rfc3339Timestamp;
  readonly captured_at?: Rfc3339Timestamp;
  readonly ingestion_request_id: RequestId;
  readonly idempotency_key: IdempotencyKey;
  readonly trace_id: TraceId;
  readonly allowlisted_metadata?: Readonly<Record<string, string>>;
}

export interface IngestArtifactCommand extends AuthorizationCommand {
  readonly source_id: SourceId;
  readonly artifact_type: M3ArtifactType;
  readonly bytes: Uint8Array;
  readonly original_name?: string;
  readonly declared_content_type?: string;
  readonly detected_content_type: string;
  /** Optional transport assertion. It is compared to server-computed bytes, never trusted. */
  readonly expected_content_hash?: ContentHash;
  readonly admission_policy: ArtifactAdmissionPolicy;
  readonly received_at: Rfc3339Timestamp;
}

export interface IngestArtifactResult {
  readonly artifact: SourceArtifact;
  readonly duplicate: ArtifactDuplicateResult;
}

export interface RegisterSourceRecordCommand extends AuthorizationCommand {
  readonly source_id: SourceId;
  readonly source_artifact_id: SourceArtifactId;
  readonly source_system_ref?: string;
  readonly record_locator?: string;
  readonly external_record_identity?: string;
  readonly observed_at?: Rfc3339Timestamp;
  readonly source_timestamp?: Rfc3339Timestamp;
  readonly raw_record: M3CanonicalValue;
  readonly created_at: Rfc3339Timestamp;
}

export interface RegisterSourceRecordResult { readonly record?: SourceRecord; readonly duplicate: SourceRecordDuplicateResult; }

export interface CreateEvidenceCommand extends AuthorizationCommand {
  readonly evidence_type: Exclude<M3EvidenceType, "USER_CONFIRMATION">;
  readonly source_id: SourceId;
  readonly source_artifact_id: SourceArtifactId;
  readonly source_record_id?: SourceRecordId;
  readonly extraction_or_normalization_provenance_ref?: string;
  readonly created_at: Rfc3339Timestamp;
}

export interface NormalizeCandidateCommand extends AuthorizationCommand {
  readonly evidence_ids: readonly EvidenceId[];
  readonly normalization_version: string;
  readonly transformation_provenance_ref: string;
  readonly started_at: Rfc3339Timestamp;
  readonly completed_at: Rfc3339Timestamp;
  readonly observed_amount?: { readonly value: string; readonly currency: string };
  readonly observed_effective_date?: string;
  readonly observed_payment_date?: string;
  readonly observed_counterparty?: { readonly display_name?: string; readonly external_reference?: string };
  readonly observed_payment_source?: { readonly display_label?: string; readonly external_reference?: string };
  readonly semantic_category_proposal?: string;
  readonly unresolved_fields: readonly string[];
  readonly confidence?: number;
}

export interface ConfirmCandidateSourceFactsCommand extends AuthorizationCommand {
  readonly candidate_id: CandidateId;
  readonly expected_candidate_version: number;
  readonly expected_candidate_hash: ContentHash;
  readonly confirmed_at: Rfc3339Timestamp;
  readonly confirmed_field_keys: readonly CandidateSourceFactConfirmation["confirmed_field_keys"][number][];
  readonly confirmation_scope_version: string;
}

export interface CandidateHandoffCommand extends AuthorizationCommand {
  readonly candidate_id: CandidateId;
  readonly expected_candidate_version: number;
  readonly expected_candidate_hash: ContentHash;
  readonly request_id: RequestId;
  readonly trace_id: TraceId;
}

export interface MarkArtifactUnavailableCommand extends AuthorizationCommand {
  readonly source_artifact_id: SourceArtifactId;
  readonly reason_ref: string;
  readonly authorized_at: Rfc3339Timestamp;
}

export interface CorrectSourceRecordCommand extends AuthorizationCommand {
  readonly previous_source_record_id: SourceRecordId;
  readonly replacement_source: Omit<CreateSourceCommand, "organization_id" | "actor" | "authorization_decision_id" | "request_id" | "creation_intent_id">;
  readonly artifact: Omit<IngestArtifactCommand, "organization_id" | "actor" | "authorization_decision_id" | "request_id" | "trace_id" | "creation_intent_id" | "source_id">;
  readonly record: Omit<RegisterSourceRecordCommand, "organization_id" | "actor" | "authorization_decision_id" | "request_id" | "trace_id" | "creation_intent_id" | "source_id" | "source_artifact_id">;
}

export interface LinkCandidateEventCommand extends AuthorizationCommand {
  readonly candidate_id: CandidateId;
  readonly event: FinancialEventTraceReference;
}

export interface LinkEventJournalCommand extends AuthorizationCommand {
  readonly event: FinancialEventTraceReference;
  readonly journal: JournalTraceReference;
}

export interface SourceEvidenceTrace {
  readonly candidate: NormalizedCandidateObservation;
  readonly evidence: readonly Evidence[];
  readonly source_records: readonly SourceRecord[];
  readonly artifacts: readonly SourceArtifact[];
  readonly sources: readonly Source[];
  readonly events: readonly FinancialEventTraceReference[];
  readonly journals: readonly JournalTraceReference[];
  readonly lineage: readonly SourceLineageRelation[];
  readonly availability: readonly ArtifactAvailabilityRecord[];
  readonly confirmations: readonly CandidateSourceFactConfirmation[];
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new M3ContractError("M3_CONTRACT_VIOLATION", `${field} is required`, "M3_REQUIRED_FIELD_MISSING");
}

function assertKnown<T extends readonly string[]>(values: T, value: string, field: string): void {
  if (!values.includes(value)) throw new M3ContractError("M3_CONTRACT_VIOLATION", `${field} is not permitted`, "M3_ENUM_INVALID");
}

function assertOnlyCommandKeys(value: object, allowed: readonly string[], contract: string): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new M3ContractError("M3_CONTRACT_VIOLATION", `${contract} received an unsupported authority-bearing field`, "M3_UNSUPPORTED_COMMAND_FIELD");
  }
}

function assertOnlyObjectKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[], contract: string): void {
  assertOnlyCommandKeys(value, allowed, contract);
}

function asSourceId(): SourceId { return newM3Uuid() as SourceId; }
function asArtifactId(): SourceArtifactId { return newM3Uuid() as SourceArtifactId; }
function asRecordId(): SourceRecordId { return newM3Uuid() as unknown as SourceRecordId; }
function asEvidenceId(): EvidenceId { return newM3Uuid() as EvidenceId; }
function asCandidateId(): CandidateId { return newM3Uuid() as CandidateId; }

function artifactTypeFor(source_type: M3SourceType): M3ArtifactType {
  switch (source_type) {
    case "MANUAL_USER_INPUT": return "MANUAL_INPUT_PAYLOAD";
    case "FILE_UPLOAD": return "FILE";
    case "BANK_RECORD_IMPORT": return "BANK_IMPORT";
  }
}

function sourceRef(evidence: Evidence, artifact_content_hash: ContentHash): SourceRef {
  return deepFreeze({
    source_id: evidence.source_id,
    source_artifact_id: evidence.source_artifact_id,
    source_record_id: evidence.source_record_id ?? null,
    content_hash: artifact_content_hash,
  });
}

function evidenceRef(evidence: Evidence): EvidenceRef {
  return deepFreeze({ evidence_id: evidence.evidence_id, evidence_type: evidence.evidence_type, content_hash: evidence.content_hash });
}

function isSameActor(left: ActorRef, right: ActorRef): boolean {
  return left.actor_id === right.actor_id && left.actor_type === right.actor_type;
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const valueKey = key(value);
    if (seen.has(valueKey)) return false;
    seen.add(valueKey);
    return true;
  });
}

/** Canonical, reusable hash for the exact server-proposed creation payload. */
export function creationPayloadHash(value: M3CanonicalValue): ContentHash {
  return sha256Canonical(value).hash;
}

function opaqueTargetRef(operation: string, target: string): string {
  return sha256Canonical({ operation, target } as M3CanonicalValue).hash;
}

export function sourceCreationScope(command: CreateSourceCommand): M3CanonicalValue {
  return {
    source_type: command.source_type,
    ...(command.source_system_ref === undefined ? {} : { source_system_ref: command.source_system_ref }),
    ...(command.original_external_reference === undefined ? {} : { original_external_reference: command.original_external_reference }),
    received_at: command.received_at,
    ...(command.captured_at === undefined ? {} : { captured_at: command.captured_at }),
    ingestion_request_id: command.ingestion_request_id,
    idempotency_key: command.idempotency_key,
    trace_id: command.trace_id,
    ...(command.allowlisted_metadata === undefined ? {} : { allowlisted_metadata: command.allowlisted_metadata as M3CanonicalValue }),
  };
}

export function artifactCreationScope(command: IngestArtifactCommand, content_hash: ContentHash): M3CanonicalValue {
  return {
    source_id: command.source_id, artifact_type: command.artifact_type, content_hash,
    ...(command.original_name === undefined ? {} : { original_name: command.original_name }),
    ...(command.declared_content_type === undefined ? {} : { declared_content_type: command.declared_content_type }),
    detected_content_type: command.detected_content_type, byte_size: command.bytes.byteLength,
    content_admission_policy_ref: command.admission_policy.policy_ref, received_at: command.received_at,
  };
}

export function sourceRecordCreationScope(command: RegisterSourceRecordCommand, canonical_content_hash: ContentHash): M3CanonicalValue {
  return {
    source_id: command.source_id, source_artifact_id: command.source_artifact_id,
    ...(command.source_system_ref === undefined ? {} : { source_system_ref: command.source_system_ref }),
    ...(command.record_locator === undefined ? {} : { record_locator: command.record_locator }),
    ...(command.external_record_identity === undefined ? {} : { external_record_identity: command.external_record_identity }),
    ...(command.observed_at === undefined ? {} : { observed_at: command.observed_at }),
    ...(command.source_timestamp === undefined ? {} : { source_timestamp: command.source_timestamp }),
    canonical_content_hash, created_at: command.created_at,
  };
}

export function evidenceCreationScope(command: CreateEvidenceCommand, content_hash: ContentHash): M3CanonicalValue {
  return {
    evidence_type: command.evidence_type, source_id: command.source_id, source_artifact_id: command.source_artifact_id,
    ...(command.source_record_id === undefined ? {} : { source_record_id: command.source_record_id }),
    ...(command.extraction_or_normalization_provenance_ref === undefined ? {} : { extraction_or_normalization_provenance_ref: command.extraction_or_normalization_provenance_ref }),
    content_hash, created_at: command.created_at,
  };
}

export function correctionCreationScope(command: CorrectSourceRecordCommand, replacement_content_hash: ContentHash, replacement_record_hash: ContentHash): M3CanonicalValue {
  return {
    previous_source_record_id: command.previous_source_record_id,
    replacement_source: {
      source_type: command.replacement_source.source_type,
      ...(command.replacement_source.source_system_ref === undefined ? {} : { source_system_ref: command.replacement_source.source_system_ref }),
      ...(command.replacement_source.original_external_reference === undefined ? {} : { original_external_reference: command.replacement_source.original_external_reference }),
      received_at: command.replacement_source.received_at,
      ingestion_request_id: command.replacement_source.ingestion_request_id,
      idempotency_key: command.replacement_source.idempotency_key,
      trace_id: command.replacement_source.trace_id,
    },
    artifact: {
      artifact_type: command.artifact.artifact_type, content_hash: replacement_content_hash,
      detected_content_type: command.artifact.detected_content_type, byte_size: command.artifact.bytes.byteLength,
      content_admission_policy_ref: command.artifact.admission_policy.policy_ref, received_at: command.artifact.received_at,
    },
    record: {
      ...(command.record.source_system_ref === undefined ? {} : { source_system_ref: command.record.source_system_ref }),
      ...(command.record.record_locator === undefined ? {} : { record_locator: command.record.record_locator }),
      ...(command.record.external_record_identity === undefined ? {} : { external_record_identity: command.record.external_record_identity }),
      canonical_content_hash: replacement_record_hash, created_at: command.record.created_at,
    },
  };
}

/**
 * Generic M3 server service. Every command consumes a server-stored opaque
 * authorization decision; no method accepts a client role, capability list,
 * filesystem location, M2 decision, or Ledger object.
 */
export class SourceEvidenceService {
  private readonly grants: readonly M3CapabilityGrant[];
  private readonly store: SqliteSourceEvidenceStore;
  private readonly clock: TrustedClock;

  constructor(
    store: SqliteSourceEvidenceStore,
    grants: readonly M3CapabilityGrant[],
    clock: TrustedClock = systemTrustedClock,
  ) {
    this.store = store;
    this.grants = Object.freeze([...grants]);
    this.clock = clock;
  }

  registerTrustedAuthorization(record: TrustedSourceEvidenceAuthorizationRecord): void {
    assertTrustedSourceEvidenceAuthorizationRecord(record, this.grants);
    this.store.serializable(() => this.store.insertAuthorization(deepFreeze(record)));
  }

  /** Server-side registration only: the intent describes scope but grants no authority. */
  registerCreationIntent(record: M3CreationIntent): void {
    assertCreationIntent(record);
    this.store.serializable(() => this.store.insertCreationIntent(deepFreeze(record)));
  }

  /** Server-side registration only; callers can later pass only this opaque decision ID. */
  registerTargetBoundAuthorization(record: M3TargetBoundAuthorizationDecision): void {
    assertTargetBoundAuthorizationDecision(record, this.grants);
    if (record.creation_intent_id !== undefined && this.store.getCreationIntent(record.organization_id, record.creation_intent_id) === undefined) {
      throw new M3ContractError("M3_AUTHORIZATION_DENIED", "authorization references an unknown CreationIntent", "M3_CREATION_INTENT_NOT_FOUND");
    }
    this.store.serializable(() => this.store.insertTargetAuthorization(deepFreeze(record)));
  }

  appendAuthorizationLifecycleFact(input: Omit<M3AuthorizationLifecycleFact, "authorization_lifecycle_fact_id" | "lifecycle_version" | "immutable_provenance_hash">): M3AuthorizationLifecycleFact {
    return this.store.serializable(() => {
      const decision = this.store.getTargetAuthorization(input.affected_authorization_decision_id);
      if (decision === undefined || decision.organization_id !== input.organization_id) {
        throw new M3ContractError("M3_AUTHORIZATION_DENIED", "authorization lifecycle target is unavailable", "M3_LIFECYCLE_TARGET_NOT_FOUND");
      }
      if (this.store.getAuthorizationLifecycleFact(input.organization_id, input.affected_authorization_decision_id) !== undefined) {
        throw new M3ContractError("M3_IMMUTABLE_HISTORY", "an authorization already has a terminal lifecycle fact", "M3_LIFECYCLE_TERMINAL_ALREADY_RECORDED");
      }
      const lifecycleAuthorityIsActive = this.grants.some((grant) => grant.organization_id === input.organization_id
        && grant.actor_id === input.authority.actor_id
        && grant.membership_status === "ACTIVE"
        && grant.capabilities.includes(M3_CAPABILITIES.issue_authorization)
        && grant.membership_evidence_ref === input.authority_evidence_ref);
      if (!lifecycleAuthorityIsActive) {
        throw new M3ContractError("M3_AUTHORIZATION_DENIED", "lifecycle authority lacks active server capability", "M3_LIFECYCLE_AUTHORITY_UNAUTHORIZED");
      }
      if (input.action === "SUPERSEDED") {
        if (input.replacement_authorization_decision_id === null) throw new M3ContractError("M3_CONTRACT_VIOLATION", "SUPERSEDED requires replacement authorization", "M3_LIFECYCLE_REPLACEMENT_REQUIRED");
        const replacement = this.store.getTargetAuthorization(input.replacement_authorization_decision_id);
        if (replacement === undefined || replacement.organization_id !== input.organization_id) throw new M3ContractError("M3_AUTHORIZATION_DENIED", "replacement authorization must be same organization", "M3_LIFECYCLE_REPLACEMENT_SCOPE_INVALID");
      } else if (input.replacement_authorization_decision_id !== null) {
        throw new M3ContractError("M3_CONTRACT_VIOLATION", "REVOKED must not name a replacement", "M3_LIFECYCLE_REVOKE_REPLACEMENT_INVALID");
      }
      const unsigned = {
        authorization_lifecycle_fact_id: newM3Uuid(), lifecycle_version: 1, ...input,
      } satisfies Omit<M3AuthorizationLifecycleFact, "immutable_provenance_hash">;
      const fact = deepFreeze({ ...unsigned, immutable_provenance_hash: authorizationLifecycleFactHash(unsigned) });
      this.store.insertAuthorizationLifecycleFact(fact);
      return fact;
    });
  }

  private authorize(command: AuthorizationCommand, capability: string): TrustedSourceEvidenceAuthorizationRecord {
    const record = this.store.getAuthorization(command.authorization_decision_id);
    return assertAuthorizedSourceEvidenceAction(record, command.organization_id, command.actor, capability);
  }

  private provenanceContext(command: AuthorizationCommand): { readonly request_id: RequestId; readonly trace_id: TraceId } {
    return {
      request_id: command.request_id ?? newM3Uuid() as RequestId,
      trace_id: command.trace_id ?? newM3Uuid() as TraceId,
    };
  }

  private deny(command: AuthorizationCommand, operation: string, target: string, reason_code: string): never {
    const context = this.provenanceContext(command);
    const unsigned = {
      authorization_denial_audit_id: newM3Uuid(), organization_id: command.organization_id,
      requesting_principal: command.actor, requested_operation: operation,
      ...(command.authorization_decision_id === undefined ? {} : { supplied_authorization_decision_id: command.authorization_decision_id }),
      opaque_target_ref: opaqueTargetRef(operation, target), evaluated_at: this.clock.now(), outcome: "DENIED" as const,
      reason_code, request_id: context.request_id, trace_id: context.trace_id,
      policy_version_ref: M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION,
    } satisfies Omit<M3AuthorizationDenialAudit, "immutable_provenance_hash">;
    const audit = deepFreeze({ ...unsigned, immutable_provenance_hash: sha256Canonical(unsigned as never).hash });
    this.store.insertAuthorizationDenialAudit(audit);
    throw new M3AuthorizationDeniedError(reason_code);
  }

  private consume(command: AuthorizationCommand, decision: M3TargetBoundAuthorizationDecision, target: M3AuthorizationConsumption["target"], lifecycle: { readonly outcome: "ACTIVE" | "SUPERSEDED" | "REVOKED" | "EXPIRED"; readonly lifecycle_version: number | null }, consumed_at: Rfc3339Timestamp): void {
    const context = this.provenanceContext(command);
    const unsigned = {
      authorization_consumption_id: newM3Uuid(), organization_id: command.organization_id,
      authorization_decision_id: decision.authorization_decision_id, decision_integrity_hash: decision.decision_integrity_hash,
      authorization_contract_version: M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION,
      observed_lifecycle_outcome: lifecycle.outcome, observed_lifecycle_version: lifecycle.lifecycle_version,
      principal: command.actor, operation: decision.operation, target, consumed_at,
      request_id: context.request_id, trace_id: context.trace_id, result: "ALLOWED" as const,
      policy_version_ref: M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION,
    } satisfies Omit<M3AuthorizationConsumption, "immutable_provenance_hash">;
    this.store.insertAuthorizationConsumption(deepFreeze({ ...unsigned, immutable_provenance_hash: authorizationConsumptionHash(unsigned) }));
  }

  private authorizeTarget(command: AuthorizationCommand, operation: string, target: AuthorizationTargetBinding): M3TargetBoundAuthorizationDecision {
    const decision = this.store.getTargetAuthorization(command.authorization_decision_id);
    try {
      if (decision === undefined) return this.deny(command, operation, target.target_id, "M3_TARGET_AUTHORIZATION_REQUIRED");
      assertTargetBoundAuthorizationDecision(decision, this.grants);
      assertExactTarget(decision, command.organization_id, command.actor, operation, target);
      const evaluatedAt = this.clock.now();
      const outcome = lifecycleOutcome(decision, this.store.getAuthorizationLifecycleFact(command.organization_id, decision.authorization_decision_id), evaluatedAt);
      if (outcome.outcome !== "ACTIVE") return this.deny(command, operation, target.target_id, `M3_AUTHORIZATION_${outcome.outcome}`);
      this.consume(command, decision, target, outcome, evaluatedAt);
      return decision;
    } catch (error) {
      if (error instanceof M3ContractError && error.reason_code.startsWith("M3_TARGET_AUTHORIZATION")) return this.deny(command, operation, target.target_id, error.reason_code);
      throw error;
    }
  }

  private authorizeCreation(command: AuthorizationCommand, operation: string, proposed_target_resource_type: string, creation_payload_hash: ContentHash, parent_resource_identity: string | null, content_hash: ContentHash | null): M3CreationIntent {
    const decision = this.store.getTargetAuthorization(command.authorization_decision_id);
    try {
      if (decision === undefined || command.creation_intent_id === undefined) return this.deny(command, operation, command.creation_intent_id ?? "missing", "M3_CREATION_INTENT_REQUIRED");
      assertTargetBoundAuthorizationDecision(decision, this.grants);
      const intent = assertExactCreationIntent(decision, this.store.getCreationIntent(command.organization_id, command.creation_intent_id), command.organization_id, command.actor, operation, proposed_target_resource_type, creation_payload_hash, parent_resource_identity, content_hash);
      const evaluatedAt = this.clock.now();
      const outcome = lifecycleOutcome(decision, this.store.getAuthorizationLifecycleFact(command.organization_id, decision.authorization_decision_id), evaluatedAt);
      if (outcome.outcome !== "ACTIVE") return this.deny(command, operation, intent.creation_intent_id, `M3_AUTHORIZATION_${outcome.outcome}`);
      this.consume(command, decision, { target_type: "CREATION_INTENT", target_id: intent.creation_intent_id, target_content_identity: intent.integrity_provenance_hash }, outcome, evaluatedAt);
      return intent;
    } catch (error) {
      if (error instanceof M3ContractError) return this.deny(command, operation, command.creation_intent_id ?? "missing", error.reason_code);
      throw error;
    }
  }

  createSource(command: CreateSourceCommand): Source {
    assertKnown(M3_SOURCE_TYPES, command.source_type, "source_type");
    return this.store.serializable(() => {
      const intent = this.authorizeCreation(command, "CREATE_SOURCE", "SOURCE", creationPayloadHash(sourceCreationScope(command)), null, null);
      const replay = this.store.findSourceByIdempotency(command.organization_id, command.idempotency_key);
      if (replay !== undefined) return replay;
      const source = this.buildSource(command, intent.proposed_target_resource_id as SourceId);
      this.store.insertSource(source);
      return source;
    });
  }

  private buildSource(command: CreateSourceCommand, source_id: SourceId): Source {
    if (command.source_system_ref !== undefined) requireNonEmpty(command.source_system_ref, "source_system_ref");
    if (command.original_external_reference !== undefined) requireNonEmpty(command.original_external_reference, "original_external_reference");
    const metadata = command.allowlisted_metadata === undefined ? undefined : Object.freeze({ ...command.allowlisted_metadata });
    return deepFreeze({
      source_id,
      organization_id: command.organization_id,
      source_type: command.source_type,
      ...(command.source_system_ref === undefined ? {} : { source_system_ref: command.source_system_ref }),
      ...(command.original_external_reference === undefined ? {} : { original_external_reference: command.original_external_reference }),
      status: "RECEIVED",
      received_at: command.received_at,
      ...(command.captured_at === undefined ? {} : { captured_at: command.captured_at }),
      ingestion_request_id: command.ingestion_request_id,
      received_by: command.actor,
      idempotency_key: command.idempotency_key,
      trace_id: command.trace_id,
      artifact_links: [],
      ...(metadata === undefined ? {} : { allowlisted_metadata: metadata }),
      created_at: command.received_at,
    });
  }

  ingestArtifact(command: IngestArtifactCommand): IngestArtifactResult {
    assertKnown(M3_ARTIFACT_TYPES, command.artifact_type, "artifact_type");
    return this.store.serializable(() => {
      const source = this.requireSource(command.organization_id, command.source_id);
      if (artifactTypeFor(source.source_type) !== command.artifact_type) {
        throw new M3ContractError("M3_CONTRACT_VIOLATION", "artifact type is incompatible with source type", "M3_ARTIFACT_SOURCE_TYPE_MISMATCH");
      }
      if (command.artifact_type === "MANUAL_INPUT_PAYLOAD") this.assertCanonicalManualPayload(command.bytes);
      assertArtifactAdmitted(command.admission_policy, {
        ...(command.declared_content_type === undefined ? {} : { declared_content_type: command.declared_content_type }),
        detected_content_type: command.detected_content_type,
        byte_size: command.bytes.byteLength,
        ...(command.original_name === undefined ? {} : { original_name: command.original_name }),
      });
      const computed = sha256Bytes(command.bytes);
      if (command.expected_content_hash !== undefined && command.expected_content_hash !== computed) {
        throw new M3ContractError("M3_ADMISSION_REJECTED", "transport content hash does not match server bytes", "M3_ARTIFACT_HASH_MISMATCH");
      }
      const intent = this.authorizeCreation(command, "CREATE_ARTIFACT", "SOURCE_ARTIFACT", creationPayloadHash(artifactCreationScope(command, computed)), source.source_id, computed);
      const existing = this.store.findArtifactByHash(command.organization_id, computed);
      if (existing !== undefined) {
        if (!this.store.hasSourceArtifactLink(command.organization_id, source.source_id, existing.source_artifact_id)) {
          this.store.insertSourceArtifactLink(command.organization_id, source.source_id, existing.source_artifact_id, "REDELIVERED", command.received_at);
        }
        return deepFreeze({ artifact: existing, duplicate: {
          organization_id: command.organization_id,
          submitted_source_id: source.source_id,
          submitted_content_hash: computed,
          canonical_source_artifact_id: existing.source_artifact_id,
          resolution: "DUPLICATE_ARTIFACT",
          evaluated_at: command.received_at,
          provenance_ref: `m3-artifact-duplicate:${existing.source_artifact_id}`,
        } });
      }
      const artifact = deepFreeze({
        source_artifact_id: intent.proposed_target_resource_id as SourceArtifactId,
        organization_id: command.organization_id,
        source_id: source.source_id,
        artifact_type: command.artifact_type,
        ...(command.original_name === undefined ? {} : { original_name: command.original_name }),
        ...(command.declared_content_type === undefined ? {} : { declared_content_type: command.declared_content_type }),
        detected_content_type: command.detected_content_type,
        content_hash: computed,
        byte_size: command.bytes.byteLength,
        content_admission_policy_ref: command.admission_policy.policy_ref,
        received_at: command.received_at,
        storage_content_ref: `m3-artifact:${newM3Uuid()}`,
        created_at: command.received_at,
        created_by: command.actor,
        immutable_provenance_ref: `m3-artifact-provenance:${newM3Uuid()}`,
      } satisfies SourceArtifact);
      this.store.insertArtifact(artifact, command.bytes);
      this.store.insertSourceArtifactLink(command.organization_id, source.source_id, artifact.source_artifact_id, "ORIGINATED", command.received_at);
      return deepFreeze({ artifact, duplicate: {
        organization_id: command.organization_id,
        submitted_source_id: source.source_id,
        submitted_content_hash: computed,
        canonical_source_artifact_id: artifact.source_artifact_id,
        resolution: "NEW_ARTIFACT",
        evaluated_at: command.received_at,
        provenance_ref: `m3-artifact-duplicate:${artifact.source_artifact_id}`,
      } });
    });
  }

  registerSourceRecord(command: RegisterSourceRecordCommand): RegisterSourceRecordResult {
    return this.store.serializable(() => {
      this.assertLinkedSourceArtifact(command.organization_id, command.source_id, command.source_artifact_id);
      const canonical = sha256Canonical(command.raw_record);
      const intent = this.authorizeCreation(command, "CREATE_SOURCE_RECORD", "SOURCE_RECORD", creationPayloadHash(sourceRecordCreationScope(command, canonical.hash)), command.source_artifact_id, canonical.hash);
      const stableIdentityProvided = command.source_system_ref !== undefined && command.external_record_identity !== undefined;
      const incompleteStableIdentity = (command.source_system_ref === undefined) !== (command.external_record_identity === undefined);
      if (incompleteStableIdentity || (!stableIdentityProvided && command.record_locator === undefined)) {
        return deepFreeze({ duplicate: this.reviewRequiredRecordResult(command, canonical.hash) });
      }
      if (stableIdentityProvided) {
        requireNonEmpty(command.source_system_ref!, "source_system_ref");
        requireNonEmpty(command.external_record_identity!, "external_record_identity");
      }
      if (command.record_locator !== undefined) requireNonEmpty(command.record_locator, "record_locator");
      const byExternal = stableIdentityProvided ? this.store.findSourceRecordByExternalIdentity(command.organization_id, command.source_system_ref!, command.external_record_identity!) : undefined;
      const byLocator = command.record_locator === undefined ? undefined : this.store.findSourceRecordByArtifactLocator(command.organization_id, command.source_artifact_id, command.record_locator);
      if (byExternal !== undefined && byLocator !== undefined && byExternal.source_record_id !== byLocator.source_record_id) {
        return deepFreeze({ duplicate: this.reviewRequiredRecordResult(command, canonical.hash) });
      }
      const existing = byExternal ?? byLocator;
      if (existing !== undefined) {
        return deepFreeze({ record: existing, duplicate: {
          organization_id: command.organization_id,
          submitted_source_id: command.source_id,
          submitted_source_artifact_id: command.source_artifact_id,
          ...(command.record_locator === undefined ? {} : { submitted_record_locator: command.record_locator }),
          ...(command.external_record_identity === undefined ? {} : { submitted_external_record_identity: command.external_record_identity }),
          submitted_canonical_content_hash: canonical.hash,
          source_record_id: existing.source_record_id,
          canonical_source_record_id: existing.source_record_id,
          resolution: "DUPLICATE_RECORD",
          identity_basis: byExternal === undefined ? "ARTIFACT_AND_RECORD_LOCATOR" : "STABLE_EXTERNAL_RECORD_IDENTITY",
          evaluated_at: command.created_at,
          provenance_ref: `m3-record-duplicate:${existing.source_record_id}`,
        } });
      }
      const record = this.buildSourceRecord(command, canonical.hash, intent.proposed_target_resource_id as SourceRecordId);
      this.store.insertSourceRecord(record, canonical.canonical_preimage);
      return deepFreeze({ record, duplicate: {
        organization_id: command.organization_id,
        submitted_source_id: command.source_id,
        submitted_source_artifact_id: command.source_artifact_id,
        ...(command.record_locator === undefined ? {} : { submitted_record_locator: command.record_locator }),
        ...(command.external_record_identity === undefined ? {} : { submitted_external_record_identity: command.external_record_identity }),
        submitted_canonical_content_hash: canonical.hash,
        source_record_id: record.source_record_id,
        canonical_source_record_id: record.source_record_id,
        resolution: "NEW_RECORD",
        identity_basis: stableIdentityProvided ? "STABLE_EXTERNAL_RECORD_IDENTITY" : "ARTIFACT_AND_RECORD_LOCATOR",
        evaluated_at: command.created_at,
        provenance_ref: `m3-record-duplicate:${record.source_record_id}`,
      } });
    });
  }

  private buildSourceRecord(command: RegisterSourceRecordCommand, canonical_content_hash: ContentHash, source_record_id: SourceRecordId): SourceRecord {
    return deepFreeze({
      source_record_id,
      organization_id: command.organization_id,
      source_id: command.source_id,
      source_artifact_id: command.source_artifact_id,
      ...(command.source_system_ref === undefined ? {} : { source_system_ref: command.source_system_ref }),
      ...(command.record_locator === undefined ? {} : { record_locator: command.record_locator }),
      ...(command.external_record_identity === undefined ? {} : { external_record_identity: command.external_record_identity }),
      ...(command.observed_at === undefined ? {} : { observed_at: command.observed_at }),
      ...(command.source_timestamp === undefined ? {} : { source_timestamp: command.source_timestamp }),
      canonicalization_version: M3_SOURCE_RECORD_CANONICALIZATION_VERSION,
      canonical_content_hash,
      raw_record_content_ref: `m3-record:${newM3Uuid()}`,
      created_at: command.created_at,
      immutable_provenance_ref: `m3-record-provenance:${newM3Uuid()}`,
    });
  }

  private reviewRequiredRecordResult(command: RegisterSourceRecordCommand, hash: ContentHash): SourceRecordDuplicateResult {
    return deepFreeze({
      organization_id: command.organization_id,
      submitted_source_id: command.source_id,
      submitted_source_artifact_id: command.source_artifact_id,
      ...(command.record_locator === undefined ? {} : { submitted_record_locator: command.record_locator }),
      ...(command.external_record_identity === undefined ? {} : { submitted_external_record_identity: command.external_record_identity }),
      submitted_canonical_content_hash: hash,
      resolution: "REVIEW_REQUIRED",
      identity_basis: "NONE",
      evaluated_at: command.created_at,
      provenance_ref: "m3-record-duplicate:review-required",
    });
  }

  createEvidence(command: CreateEvidenceCommand): Evidence {
    assertKnown(M3_EVIDENCE_TYPES, command.evidence_type, "evidence_type");
    return this.store.serializable(() => {
      this.assertLinkedSourceArtifact(command.organization_id, command.source_id, command.source_artifact_id);
      const artifact = this.requireArtifact(command.organization_id, command.source_artifact_id);
      const record = command.source_record_id === undefined ? undefined : this.requireRecord(command.organization_id, command.source_record_id);
      if (record !== undefined && (record.source_id !== command.source_id || record.source_artifact_id !== command.source_artifact_id)) {
        throw new M3ContractError("M3_CONTRACT_VIOLATION", "evidence source record must match its source and artifact", "M3_EVIDENCE_REFERENCE_MISMATCH");
      }
      if (command.evidence_type === "EXTERNAL_RECORD" && record === undefined) {
        throw new M3ContractError("M3_CONTRACT_VIOLATION", "EXTERNAL_RECORD evidence requires a source record", "M3_EXTERNAL_RECORD_MISSING");
      }
      const content = record?.canonical_content_hash ?? artifact.content_hash;
      const intent = this.authorizeCreation(command, "CREATE_EVIDENCE", "EVIDENCE", creationPayloadHash(evidenceCreationScope(command, content)), command.source_artifact_id, content);
      return this.createEvidenceUnchecked({
        organization_id: command.organization_id,
        actor: command.actor,
        evidence_type: command.evidence_type,
        source_id: command.source_id,
        artifact,
        ...(record === undefined ? {} : { source_record: record }),
        ...(command.extraction_or_normalization_provenance_ref === undefined ? {} : { extraction_or_normalization_provenance_ref: command.extraction_or_normalization_provenance_ref }),
        created_at: command.created_at,
        evidence_id: intent.proposed_target_resource_id as EvidenceId,
      });
    });
  }

  private createEvidenceUnchecked(input: {
    readonly organization_id: OrganizationId;
    readonly actor: ActorRef;
    readonly evidence_type: M3EvidenceType;
    readonly source_id: SourceId;
    readonly artifact: SourceArtifact;
    readonly source_record?: SourceRecord;
    readonly extraction_or_normalization_provenance_ref?: string;
    readonly created_at: Rfc3339Timestamp;
    readonly content_hash_override?: ContentHash;
    readonly evidence_id?: EvidenceId;
  }): Evidence {
    const evidence = deepFreeze({
      evidence_id: input.evidence_id ?? asEvidenceId(),
      organization_id: input.organization_id,
      evidence_type: input.evidence_type,
      source_id: input.source_id,
      source_artifact_id: input.artifact.source_artifact_id,
      ...(input.source_record === undefined ? {} : { source_record_id: input.source_record.source_record_id }),
      content_hash: input.content_hash_override ?? (input.source_record?.canonical_content_hash ?? input.artifact.content_hash),
      ...(input.extraction_or_normalization_provenance_ref === undefined ? {} : { extraction_or_normalization_provenance_ref: input.extraction_or_normalization_provenance_ref }),
      created_at: input.created_at,
      created_by: input.actor,
      immutable_provenance_ref: `m3-evidence-provenance:${newM3Uuid()}`,
    } satisfies Evidence);
    this.store.insertEvidence(evidence);
    return evidence;
  }

  normalizeCandidate(command: NormalizeCandidateCommand): NormalizedCandidateObservation {
    return this.store.serializable(() => {
      assertOnlyCommandKeys(command, [
        "organization_id", "actor", "authorization_decision_id", "evidence_ids", "normalization_version", "transformation_provenance_ref", "started_at", "completed_at",
        "observed_amount", "observed_effective_date", "observed_payment_date", "observed_counterparty", "observed_payment_source", "semantic_category_proposal", "unresolved_fields", "confidence",
      ], "normalized candidate");
      this.authorize(command, M3_CAPABILITIES.normalize);
      if (command.evidence_ids.length === 0) throw new M3ContractError("M3_CONTRACT_VIOLATION", "normalization requires evidence", "M3_NORMALIZATION_EVIDENCE_REQUIRED");
      requireNonEmpty(command.normalization_version, "normalization_version");
      requireNonEmpty(command.transformation_provenance_ref, "transformation_provenance_ref");
      if (command.confidence !== undefined && (!Number.isFinite(command.confidence) || command.confidence < 0 || command.confidence > 1)) {
        throw new M3ContractError("M3_CONTRACT_VIOLATION", "confidence must be within zero through one", "M3_CONFIDENCE_INVALID");
      }
      if (command.observed_amount !== undefined) assertOnlyObjectKeys(command.observed_amount, ["value", "currency"], "observed money");
      if (command.observed_counterparty !== undefined) assertOnlyObjectKeys(command.observed_counterparty, ["display_name", "external_reference"], "observed counterparty");
      if (command.observed_payment_source !== undefined) assertOnlyObjectKeys(command.observed_payment_source, ["display_label", "external_reference"], "observed payment source");
      const evidence = uniqueBy(command.evidence_ids.map((id) => this.requireEvidence(command.organization_id, id)), (item) => item.evidence_id);
      const input_evidence_refs = evidence.map(evidenceRef);
      const source_refs = uniqueBy(evidence.map((item) => sourceRef(item, this.requireArtifact(command.organization_id, item.source_artifact_id).content_hash)), (item) => `${item.source_id}:${item.source_artifact_id}:${item.source_record_id ?? ""}:${item.content_hash}`);
      const runPayload = {
        organization_id: command.organization_id,
        normalizer: command.actor,
        normalizer_version: command.normalization_version,
        transformation_provenance_ref: command.transformation_provenance_ref,
        input_evidence_refs,
        started_at: command.started_at,
        completed_at: command.completed_at,
      };
      const normalization_run_id = newM3Uuid();
      const candidate_id = asCandidateId();
      const candidateBase = {
        candidate_id,
        organization_id: command.organization_id,
        candidate_version: 1,
        candidate_kind: "PAID_EXPENSE_OBSERVATION" as const,
        authority: "OBSERVATION_ONLY" as const,
        evidence_refs: input_evidence_refs,
        source_refs,
        normalization_run_id,
        normalization_version: command.normalization_version,
        normalizer: command.actor,
        normalized_at: command.completed_at,
        transformation_provenance_ref: command.transformation_provenance_ref,
        ...(command.observed_amount === undefined ? {} : { observed_amount: { ...command.observed_amount } }),
        ...(command.observed_effective_date === undefined ? {} : { observed_effective_date: command.observed_effective_date }),
        ...(command.observed_payment_date === undefined ? {} : { observed_payment_date: command.observed_payment_date }),
        ...(command.observed_counterparty === undefined ? {} : { observed_counterparty: { ...command.observed_counterparty } }),
        ...(command.observed_payment_source === undefined ? {} : { observed_payment_source: { ...command.observed_payment_source } }),
        ...(command.semantic_category_proposal === undefined ? {} : { semantic_category_proposal: command.semantic_category_proposal }),
        unresolved_fields: [...command.unresolved_fields],
        ...(command.confidence === undefined ? {} : { confidence: command.confidence }),
        created_at: command.completed_at,
        immutable_provenance_ref: `m3-candidate-provenance:${newM3Uuid()}`,
      };
      // Confidence remains non-authoritative metadata and may be fractional;
      // represent it as a lexical string in the canonical hash preimage so
      // source-record/manual canonical JSON retains its safe-integer rule.
      const candidateHashPayload = command.confidence === undefined
        ? candidateBase
        : { ...candidateBase, confidence: String(command.confidence) };
      const candidate_hash = sha256Canonical(candidateHashPayload as never).hash;
      const run = deepFreeze({
        normalization_run_id,
        ...runPayload,
        immutable_output_hash: candidate_hash,
      } satisfies NormalizationRun);
      const candidate = deepFreeze({ ...candidateBase, candidate_hash } satisfies NormalizedCandidateObservation);
      this.store.insertNormalization(run);
      this.store.insertCandidate(candidate);
      for (const item of evidence) {
        this.store.insertLineage(deepFreeze({
          source_lineage_relation_id: newM3Uuid(), organization_id: command.organization_id, relation_type: "DERIVED_FROM",
          from_object_type: "NORMALIZATION_RUN", from_object_id: run.normalization_run_id,
          to_object_type: "EVIDENCE", to_object_id: item.evidence_id,
          created_at: command.completed_at, created_by: command.actor, immutable_provenance_ref: `m3-lineage:${newM3Uuid()}`,
        }));
        this.store.insertLineage(deepFreeze({
          source_lineage_relation_id: newM3Uuid(), organization_id: command.organization_id, relation_type: "DERIVED_FROM",
          from_object_type: "NORMALIZED_CANDIDATE", from_object_id: candidate.candidate_id,
          to_object_type: "EVIDENCE", to_object_id: item.evidence_id,
          created_at: command.completed_at, created_by: command.actor, immutable_provenance_ref: `m3-lineage:${newM3Uuid()}`,
        }));
      }
      return candidate;
    });
  }

  confirmCandidateSourceFacts(command: ConfirmCandidateSourceFactsCommand): CandidateSourceFactConfirmation {
    return this.store.serializable(() => {
      assertOnlyCommandKeys(command, [
        "organization_id", "actor", "authorization_decision_id", "candidate_id", "expected_candidate_version", "expected_candidate_hash", "confirmed_at", "confirmed_field_keys", "confirmation_scope_version",
      ], "candidate source-fact confirmation");
      this.authorize(command, M3_CAPABILITIES.confirm);
      if (command.actor.actor_type !== "USER") throw new M3ContractError("M3_AUTHORIZATION_DENIED", "only a user may make USER_CONFIRM source-fact confirmation", "M3_CONFIRMATION_ACTOR_INVALID");
      const candidate = this.requireCandidate(command.organization_id, command.candidate_id);
      if (candidate.candidate_version !== command.expected_candidate_version || candidate.candidate_hash !== command.expected_candidate_hash) {
        throw new M3ContractError("M3_CONTRACT_VIOLATION", "candidate confirmation does not bind the current immutable candidate", "M3_CONFIRMATION_CANDIDATE_MISMATCH");
      }
      const allowedFields = new Set<CandidateSourceFactConfirmation["confirmed_field_keys"][number]>([
        "amount", "currency", "effective_or_business_date", "payment_source_observation", "counterparty_or_merchant_observation", "semantic_category_proposal", "source_evidence_linkage",
      ]);
      if (command.confirmed_field_keys.length === 0 || command.confirmed_field_keys.some((field) => !allowedFields.has(field))) {
        throw new M3ContractError("M3_CONTRACT_VIOLATION", "confirmation includes a non-source/business authority field", "M3_CONFIRMATION_SCOPE_INVALID");
      }
      const baseEvidence = this.requireEvidence(command.organization_id, candidate.evidence_refs[0]!.evidence_id);
      const confirmation_id = newM3Uuid();
      const confirmationPayload = {
        confirmation_id,
        organization_id: command.organization_id,
        candidate_id: candidate.candidate_id,
        expected_candidate_version: command.expected_candidate_version,
        expected_candidate_hash: command.expected_candidate_hash,
        confirmed_by: command.actor,
        confirmed_at: command.confirmed_at,
        confirmed_field_keys: [...command.confirmed_field_keys],
        authority: "SOURCE_BUSINESS_FACTS_ONLY" as const,
        confirmation_scope_version: command.confirmation_scope_version,
      };
      const confirmation_hash = sha256Canonical(confirmationPayload as never).hash;
      const confirmationEvidence = this.createEvidenceUnchecked({
        organization_id: command.organization_id,
        actor: command.actor,
        evidence_type: "USER_CONFIRMATION",
        source_id: baseEvidence.source_id,
        artifact: this.requireArtifact(command.organization_id, baseEvidence.source_artifact_id),
        ...(baseEvidence.source_record_id === undefined ? {} : { source_record: this.requireRecord(command.organization_id, baseEvidence.source_record_id) }),
        extraction_or_normalization_provenance_ref: `m3-confirmation:${confirmation_id}`,
        created_at: command.confirmed_at,
        content_hash_override: confirmation_hash,
      });
      const confirmation = deepFreeze({
        ...confirmationPayload,
        confirmation_evidence_ref: evidenceRef(confirmationEvidence),
        confirmation_hash,
      } satisfies CandidateSourceFactConfirmation);
      this.store.insertConfirmation(confirmation);
      return confirmation;
    });
  }

  createCandidateHandoff(command: CandidateHandoffCommand): CandidateToFinancialEventHandoff {
    return this.store.serializable(() => {
      this.authorize(command, M3_CAPABILITIES.confirm);
      const candidate = this.requireCandidate(command.organization_id, command.candidate_id);
      if (candidate.candidate_version !== command.expected_candidate_version || candidate.candidate_hash !== command.expected_candidate_hash) {
        throw new M3ContractError("M3_CONTRACT_VIOLATION", "candidate handoff does not bind the expected candidate", "M3_HANDOFF_CANDIDATE_MISMATCH");
      }
      if (!this.store.hasCandidateConfirmation(command.organization_id, candidate.candidate_id)) {
        throw new M3ContractError("M3_CONTRACT_VIOLATION", "candidate cannot bypass USER_CONFIRM", "M3_HANDOFF_USER_CONFIRM_REQUIRED");
      }
      const confirmation = this.store.latestCandidateConfirmation(command.organization_id, candidate.candidate_id);
      if (confirmation === undefined) throw new M3ContractError("M3_INFRASTRUCTURE_FAILURE", "candidate confirmation was not retained", "M3_CONFIRMATION_TRACE_MISSING");
      return deepFreeze({
        organization_id: command.organization_id,
        candidate_id: candidate.candidate_id,
        expected_candidate_version: candidate.candidate_version,
        expected_candidate_hash: candidate.candidate_hash,
        source_refs: candidate.source_refs,
        evidence_refs: candidate.evidence_refs,
        confirmation_evidence_ref: confirmation.confirmation_evidence_ref,
        requested_by: command.actor,
        request_id: command.request_id,
        trace_id: command.trace_id,
      });
    });
  }

  readRawArtifact(command: AuthorizationCommand & { readonly source_artifact_id: SourceArtifactId }): Uint8Array {
    return this.store.serializable(() => {
      const artifact = this.store.getArtifact(command.organization_id, command.source_artifact_id);
      if (artifact === undefined) return this.deny(command, "READ_RAW_ARTIFACT", command.source_artifact_id, "M3_TARGET_NOT_AVAILABLE");
      this.authorizeTarget(command, "READ_RAW_ARTIFACT", { target_type: "SOURCE_ARTIFACT", target_id: artifact.source_artifact_id, target_content_identity: artifact.content_hash });
      const availability = this.store.latestAvailability(command.organization_id, command.source_artifact_id);
      if (availability?.availability === "UNAVAILABLE") {
        throw new M3ContractError("M3_AUTHORIZATION_DENIED", "raw artifact is recorded as unavailable", "M3_RAW_ARTIFACT_UNAVAILABLE");
      }
      const bytes = this.store.readArtifactBytes(command.organization_id, command.source_artifact_id);
      if (bytes === undefined) throw new M3ContractError("M3_INFRASTRUCTURE_FAILURE", "artifact bytes are absent", "M3_RAW_ARTIFACT_MISSING");
      return bytes;
    });
  }

  readRawSourceRecord(command: AuthorizationCommand & { readonly source_record_id: SourceRecordId }): string {
    return this.store.serializable(() => {
      const record = this.store.getSourceRecord(command.organization_id, command.source_record_id);
      if (record === undefined) return this.deny(command, "READ_RAW_SOURCE_RECORD", command.source_record_id, "M3_TARGET_NOT_AVAILABLE");
      this.authorizeTarget(command, "READ_RAW_SOURCE_RECORD", { target_type: "SOURCE_RECORD", target_id: record.source_record_id, target_content_identity: record.canonical_content_hash });
      return record.raw_record_json;
    });
  }

  markArtifactUnavailable(command: MarkArtifactUnavailableCommand): ArtifactAvailabilityRecord {
    return this.store.serializable(() => {
      const artifact = this.store.getArtifact(command.organization_id, command.source_artifact_id);
      if (artifact === undefined) return this.deny(command, "MARK_ARTIFACT_UNAVAILABLE", command.source_artifact_id, "M3_TARGET_NOT_AVAILABLE");
      const authorization = this.authorizeTarget(command, "MARK_ARTIFACT_UNAVAILABLE", { target_type: "SOURCE_ARTIFACT", target_id: artifact.source_artifact_id, target_content_identity: artifact.content_hash });
      const historical = this.store.sourceProvenanceForArtifact(command.organization_id, artifact.source_artifact_id);
      requireNonEmpty(command.reason_ref, "reason_ref");
      const record = deepFreeze({
        artifact_availability_record_id: newM3Uuid(), organization_id: command.organization_id,
        source_artifact_id: artifact.source_artifact_id, original_content_hash: artifact.content_hash,
        ...(artifact.declared_content_type === undefined ? {} : { original_declared_content_type: artifact.declared_content_type }),
        ...(artifact.detected_content_type === undefined ? {} : { original_detected_content_type: artifact.detected_content_type }),
        original_byte_size: artifact.byte_size,
        original_source_locator_or_reference: artifact.immutable_provenance_ref,
        availability: "UNAVAILABLE" as const, authorized_at: command.authorized_at, reason_ref: command.reason_ref,
        authorized_by: command.actor, authorization_decision_ref: authorization.authorization_decision_id,
        authorization_capability_ref: M3_CAPABILITIES.availability,
        historical_source_ids: historical.source_ids,
        historical_source_record_ids: historical.source_record_ids,
        historical_evidence_ids: historical.evidence_ids,
        historical_financial_event_refs: this.store.eventRefsForArtifact(command.organization_id, artifact.source_artifact_id),
        historical_journal_entry_refs: this.store.journalRefsForArtifact(command.organization_id, artifact.source_artifact_id),
        immutable_provenance_ref: `m3-availability:${newM3Uuid()}`,
      } satisfies ArtifactAvailabilityRecord);
      this.store.insertAvailability(record);
      return record;
    });
  }

  linkCandidateToFinancialEvent(command: LinkCandidateEventCommand): void {
    this.store.serializable(() => {
      this.authorize(command, M3_CAPABILITIES.trace);
      this.requireCandidate(command.organization_id, command.candidate_id);
      this.store.linkCandidateEvent(command.organization_id, command.candidate_id, command.event);
    });
  }

  linkFinancialEventToJournal(command: LinkEventJournalCommand): void {
    this.store.serializable(() => {
      this.authorize(command, M3_CAPABILITIES.trace);
      this.store.linkEventJournal(command.organization_id, command.event, command.journal);
    });
  }

  traceCandidate(command: AuthorizationCommand & { readonly candidate_id: CandidateId }): SourceEvidenceTrace {
    return this.store.serializable(() => {
      this.authorize(command, M3_CAPABILITIES.trace);
      const trace = this.store.traceCandidate(command.organization_id, command.candidate_id);
      if (trace === undefined) throw new M3ContractError("M3_AUTHORIZATION_DENIED", "candidate is not available in authorized organization scope", "M3_TRACE_NOT_FOUND");
      return deepFreeze({ ...trace, confirmations: this.store.confirmationsForCandidate(command.organization_id, command.candidate_id) });
    });
  }

  /** Reverse provenance lookup. It reads only M3 trace references and never reads or mutates Ledger state. */
  traceJournal(command: AuthorizationCommand & { readonly journal_entry_id: string }): readonly SourceEvidenceTrace[] {
    return this.store.serializable(() => {
      this.authorize(command, M3_CAPABILITIES.trace);
      return deepFreeze(this.store.candidateIdsForJournal(command.organization_id, command.journal_entry_id).map((candidate_id) => {
        const trace = this.store.traceCandidate(command.organization_id, candidate_id);
        if (trace === undefined) throw new M3ContractError("M3_INFRASTRUCTURE_FAILURE", "journal trace candidate is missing", "M3_TRACE_CANDIDATE_MISSING");
        return deepFreeze({ ...trace, confirmations: this.store.confirmationsForCandidate(command.organization_id, candidate_id) });
      }));
    });
  }

  readEvidence(command: AuthorizationCommand & { readonly evidence_id: EvidenceId }): Evidence {
    return this.store.serializable(() => {
      const evidence = this.store.getEvidence(command.organization_id, command.evidence_id);
      if (evidence === undefined) return this.deny(command, "READ_EVIDENCE", command.evidence_id, "M3_TARGET_NOT_AVAILABLE");
      this.authorizeTarget(command, "READ_EVIDENCE", { target_type: "EVIDENCE", target_id: evidence.evidence_id, target_content_identity: evidence.content_hash });
      return evidence;
    });
  }

  /** Source correction is append-only and deliberately does not mutate candidates, events, or Journals. */
  correctSourceRecord(command: CorrectSourceRecordCommand): { readonly source: Source; readonly artifact: SourceArtifact; readonly record?: SourceRecord; readonly evidence?: Evidence } {
    return this.store.serializable(() => {
      const previous = this.store.getSourceRecord(command.organization_id, command.previous_source_record_id);
      if (previous === undefined) return this.deny(command, "CORRECT_SOURCE_RECORD", command.previous_source_record_id, "M3_TARGET_NOT_AVAILABLE");
      const predecessorArtifact = this.requireArtifact(command.organization_id, previous.source_artifact_id);
      const artifactHash = sha256Bytes(command.artifact.bytes);
      const canonical = sha256Canonical(command.record.raw_record);
      const intent = this.authorizeCreation(command, "CORRECT_SOURCE_RECORD", "SOURCE_RECORD", creationPayloadHash(correctionCreationScope(command, artifactHash, canonical.hash)), previous.source_record_id, artifactHash);
      const sourceCommand: CreateSourceCommand = { ...command.replacement_source, organization_id: command.organization_id, actor: command.actor, authorization_decision_id: command.authorization_decision_id };
      assertKnown(M3_SOURCE_TYPES, sourceCommand.source_type, "source_type");
      const source = this.buildSource(sourceCommand, asSourceId());
      this.store.insertSource(source);
      if (artifactTypeFor(source.source_type) !== command.artifact.artifact_type) throw new M3ContractError("M3_CONTRACT_VIOLATION", "replacement artifact type is incompatible with source", "M3_ARTIFACT_SOURCE_TYPE_MISMATCH");
      assertArtifactAdmitted(command.artifact.admission_policy, {
        ...(command.artifact.declared_content_type === undefined ? {} : { declared_content_type: command.artifact.declared_content_type }),
        detected_content_type: command.artifact.detected_content_type, byte_size: command.artifact.bytes.byteLength,
        ...(command.artifact.original_name === undefined ? {} : { original_name: command.artifact.original_name }),
      });
      if (command.artifact.artifact_type === "MANUAL_INPUT_PAYLOAD") this.assertCanonicalManualPayload(command.artifact.bytes);
      if (artifactHash === predecessorArtifact.content_hash) throw new M3ContractError("M3_CONTRACT_VIOLATION", "replacement content must be distinct from predecessor artifact", "M3_REPLACEMENT_NOT_DISTINCT");
      const replacementArtifact = deepFreeze({
        source_artifact_id: asArtifactId(), organization_id: command.organization_id, source_id: source.source_id,
        artifact_type: command.artifact.artifact_type,
        ...(command.artifact.original_name === undefined ? {} : { original_name: command.artifact.original_name }),
        ...(command.artifact.declared_content_type === undefined ? {} : { declared_content_type: command.artifact.declared_content_type }),
        detected_content_type: command.artifact.detected_content_type, content_hash: artifactHash, byte_size: command.artifact.bytes.byteLength,
        content_admission_policy_ref: command.artifact.admission_policy.policy_ref, received_at: command.artifact.received_at,
        storage_content_ref: `m3-artifact:${newM3Uuid()}`, created_at: command.artifact.received_at, created_by: command.actor,
        immutable_provenance_ref: `m3-artifact-provenance:${newM3Uuid()}`,
      } satisfies SourceArtifact);
      this.store.insertArtifact(replacementArtifact, command.artifact.bytes);
      this.store.insertSourceArtifactLink(command.organization_id, source.source_id, replacementArtifact.source_artifact_id, "ORIGINATED", command.artifact.received_at);
      const replacementRecord = this.buildSourceRecord({ ...command.record, organization_id: command.organization_id, actor: command.actor, authorization_decision_id: command.authorization_decision_id, source_id: source.source_id, source_artifact_id: replacementArtifact.source_artifact_id }, canonical.hash, intent.proposed_target_resource_id as SourceRecordId);
      this.store.insertSourceRecord(replacementRecord, canonical.canonical_preimage);
      const evidence = this.createEvidenceUnchecked({ organization_id: command.organization_id, actor: command.actor, evidence_type: "EXTERNAL_RECORD", source_id: source.source_id, artifact: replacementArtifact, source_record: replacementRecord, created_at: command.record.created_at });
      this.store.insertLineage(deepFreeze({ source_lineage_relation_id: newM3Uuid(), organization_id: command.organization_id, relation_type: "SUPERSEDES", from_object_type: "SOURCE_RECORD", from_object_id: replacementRecord.source_record_id, to_object_type: "SOURCE_RECORD", to_object_id: previous.source_record_id, created_at: command.record.created_at, created_by: command.actor, immutable_provenance_ref: `m3-lineage:${newM3Uuid()}` }));
      this.store.insertLineage(deepFreeze({ source_lineage_relation_id: newM3Uuid(), organization_id: command.organization_id, relation_type: "REPLACES", from_object_type: "SOURCE_ARTIFACT", from_object_id: replacementArtifact.source_artifact_id, to_object_type: "SOURCE_ARTIFACT", to_object_id: predecessorArtifact.source_artifact_id, created_at: command.record.created_at, created_by: command.actor, immutable_provenance_ref: `m3-lineage:${newM3Uuid()}` }));
      return deepFreeze({ source, artifact: replacementArtifact, record: replacementRecord, evidence });
    });
  }

  private requireSource(organization_id: OrganizationId, source_id: SourceId): Source {
    const source = this.store.getSource(organization_id, source_id);
    if (source === undefined) throw new M3ContractError("M3_AUTHORIZATION_DENIED", "source is unavailable in authorized organization scope", "M3_SOURCE_NOT_FOUND");
    return source;
  }
  private requireArtifact(organization_id: OrganizationId, source_artifact_id: SourceArtifactId): SourceArtifact {
    const artifact = this.store.getArtifact(organization_id, source_artifact_id);
    if (artifact === undefined) throw new M3ContractError("M3_AUTHORIZATION_DENIED", "artifact is unavailable in authorized organization scope", "M3_ARTIFACT_NOT_FOUND");
    return artifact;
  }
  private requireRecord(organization_id: OrganizationId, source_record_id: SourceRecordId): SourceRecord {
    const record = this.store.getSourceRecord(organization_id, source_record_id);
    if (record === undefined) throw new M3ContractError("M3_AUTHORIZATION_DENIED", "source record is unavailable in authorized organization scope", "M3_RECORD_NOT_FOUND");
    const { raw_record_json: _raw, ...result } = record;
    return deepFreeze(result);
  }
  private requireEvidence(organization_id: OrganizationId, evidence_id: EvidenceId): Evidence {
    const evidence = this.store.getEvidence(organization_id, evidence_id);
    if (evidence === undefined) throw new M3ContractError("M3_AUTHORIZATION_DENIED", "evidence is unavailable in authorized organization scope", "M3_EVIDENCE_NOT_FOUND");
    return evidence;
  }
  private requireCandidate(organization_id: OrganizationId, candidate_id: CandidateId): NormalizedCandidateObservation {
    const candidate = this.store.getCandidate(organization_id, candidate_id);
    if (candidate === undefined) throw new M3ContractError("M3_AUTHORIZATION_DENIED", "candidate is unavailable in authorized organization scope", "M3_CANDIDATE_NOT_FOUND");
    return candidate;
  }
  private assertLinkedSourceArtifact(organization_id: OrganizationId, source_id: SourceId, source_artifact_id: SourceArtifactId): void {
    this.requireSource(organization_id, source_id);
    this.requireArtifact(organization_id, source_artifact_id);
    if (!this.store.hasSourceArtifactLink(organization_id, source_id, source_artifact_id)) throw new M3ContractError("M3_CONTRACT_VIOLATION", "source must be linked to its artifact", "M3_SOURCE_ARTIFACT_LINK_REQUIRED");
  }
  private assertCanonicalManualPayload(bytes: Uint8Array): void {
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new M3ContractError("M3_ADMISSION_REJECTED", "manual input must be valid canonical JSON", "M3_MANUAL_PAYLOAD_INVALID"); }
    let canonical: string;
    try { canonical = canonicalJson(parsed as M3CanonicalValue); }
    catch (error) {
      if (error instanceof M3ContractError) throw error;
      throw new M3ContractError("M3_ADMISSION_REJECTED", "manual input cannot be canonicalized", "M3_MANUAL_PAYLOAD_INVALID");
    }
    if (new TextDecoder().decode(bytes) !== canonical) {
      throw new M3ContractError("M3_ADMISSION_REJECTED", "manual input is not the frozen canonical byte representation", "M3_MANUAL_PAYLOAD_NOT_CANONICAL");
    }
  }
}

/** Converts structured manual source input into the frozen exact-byte representation. */
export function canonicalManualArtifactBytes(payload: M3CanonicalValue): Uint8Array {
  return new TextEncoder().encode(canonicalJson(payload));
}

export const M3_IMPLEMENTATION_CONTRACT = deepFreeze({
  schema_version: M3_SCHEMA_VERSION,
  manual_artifact_canonicalization_version: M3_MANUAL_ARTIFACT_CANONICALIZATION_VERSION,
  source_record_canonicalization_version: M3_SOURCE_RECORD_CANONICALIZATION_VERSION,
  source_types: M3_SOURCE_TYPES,
  artifact_types: M3_ARTIFACT_TYPES,
  evidence_types: M3_EVIDENCE_TYPES,
  lineage_types: M3_LINEAGE_TYPES,
});
