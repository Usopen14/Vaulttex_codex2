import type { ActorRef } from "../domain/organizations/organization.ts";
import type { OrganizationId } from "../domain/common/ids.ts";

import { deepFreeze, sha256Canonical } from "./canonical.ts";
import {
  M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION,
  M3_CAPABILITIES,
  type AuthorizationTargetBinding,
  type M3AuthorizationConsumption,
  type M3AuthorizationLifecycleFact,
  type M3AuthorizationLifecycleOutcome,
  type M3CapabilityGrant,
  type M3CreationIntent,
  type M3TargetBoundAuthorizationDecision,
  type TrustedSourceEvidenceAuthorizationRecord,
} from "./contracts.ts";
import { M3ContractError } from "./errors.ts";

function authorizationPayload(record: Omit<TrustedSourceEvidenceAuthorizationRecord, "integrity_provenance_hash">): Record<string, unknown> {
  return {
    record_contract_version: record.record_contract_version,
    decision: record.decision,
    issued_by: record.issued_by,
    immutable_evidence_provenance_ref: record.immutable_evidence_provenance_ref,
    recorded_at: record.recorded_at,
  };
}

export function trustedSourceEvidenceAuthorizationHash(record: Omit<TrustedSourceEvidenceAuthorizationRecord, "integrity_provenance_hash">): TrustedSourceEvidenceAuthorizationRecord["integrity_provenance_hash"] {
  return sha256Canonical(authorizationPayload(record) as never).hash;
}

function hasActiveGrant(
  grants: readonly M3CapabilityGrant[],
  organization_id: OrganizationId,
  actor: ActorRef,
  capability: string,
  evidence_ref: string,
): boolean {
  return grants.some((grant) => grant.organization_id === organization_id
    && grant.actor_id === actor.actor_id
    && grant.membership_status === "ACTIVE"
    && grant.capabilities.includes(capability)
    && grant.membership_evidence_ref === evidence_ref);
}

/** Validates the authority record at its server-controlled registration boundary. */
export function assertTrustedSourceEvidenceAuthorizationRecord(
  record: TrustedSourceEvidenceAuthorizationRecord,
  grants: readonly M3CapabilityGrant[],
): void {
  const { decision, issued_by } = record;
  if (record.record_contract_version !== "wendy.m3.trusted-source-evidence-authorization/1.0.0"
      || decision.decision !== "ALLOWED"
      || decision.requested_capability_ref.trim().length === 0
      || decision.decision_provenance_ref.trim().length === 0
      || issued_by.capability_evidence_ref.trim().length === 0
      || issued_by.authority_provenance_ref.trim().length === 0
      || record.immutable_evidence_provenance_ref.trim().length === 0) {
    throw new M3ContractError("M3_AUTHORIZATION_DENIED", "trusted M3 authorization record is incomplete", "M3_TRUSTED_AUTHORIZATION_INVALID");
  }
  if (!hasActiveGrant(grants, decision.organization_id, issued_by.actor, M3_CAPABILITIES.issue_authorization, issued_by.capability_evidence_ref)) {
    throw new M3ContractError("M3_AUTHORIZATION_DENIED", "authorization issuer lacks active server capability", "M3_AUTHORIZATION_ISSUER_UNAUTHORIZED");
  }
  if (trustedSourceEvidenceAuthorizationHash(record) !== record.integrity_provenance_hash) {
    throw new M3ContractError("M3_AUTHORIZATION_DENIED", "trusted authorization integrity hash mismatch", "M3_AUTHORIZATION_INTEGRITY_MISMATCH");
  }
}

/**
 * Applies an already registered, immutable authorization record to one
 * server action. The request body conveys only the opaque decision ID; client
 * roles and organization claims never enter this check.
 */
export function assertAuthorizedSourceEvidenceAction(
  record: TrustedSourceEvidenceAuthorizationRecord | undefined,
  organization_id: OrganizationId,
  actor: ActorRef,
  requested_capability: string,
): TrustedSourceEvidenceAuthorizationRecord {
  if (record === undefined
      || record.decision.decision !== "ALLOWED"
      || record.decision.organization_id !== organization_id
      || record.decision.actor.actor_id !== actor.actor_id
      || record.decision.requested_capability_ref !== requested_capability) {
    throw new M3ContractError("M3_AUTHORIZATION_DENIED", "a matching trusted server authorization is required", "M3_AUTHORIZATION_REQUIRED");
  }
  return deepFreeze(record);
}

function targetDecisionPayload(record: Omit<M3TargetBoundAuthorizationDecision, "decision_integrity_hash">): Record<string, unknown> {
  return {
    authorization_decision_id: record.authorization_decision_id,
    organization_id: record.organization_id,
    authorized_principal: record.authorized_principal,
    operation: record.operation,
    ...(record.target === undefined ? {} : { target: record.target }),
    ...(record.creation_intent_id === undefined ? {} : { creation_intent_id: record.creation_intent_id }),
    authorization_contract_version: record.authorization_contract_version,
    issued_at: record.issued_at,
    expires_at: record.expires_at,
    issuer: record.issuer,
    immutable_evidence_provenance_ref: record.immutable_evidence_provenance_ref,
  };
}

export function targetBoundAuthorizationHash(record: Omit<M3TargetBoundAuthorizationDecision, "decision_integrity_hash">): M3TargetBoundAuthorizationDecision["decision_integrity_hash"] {
  return sha256Canonical(targetDecisionPayload(record) as never).hash;
}

function creationIntentPayload(record: Omit<M3CreationIntent, "integrity_provenance_hash">): Record<string, unknown> {
  return {
    creation_intent_id: record.creation_intent_id,
    organization_id: record.organization_id,
    operation: record.operation,
    requesting_principal: record.requesting_principal,
    proposed_target_resource_type: record.proposed_target_resource_type,
    proposed_target_resource_id: record.proposed_target_resource_id,
    creation_payload_hash: record.creation_payload_hash,
    parent_resource_identity: record.parent_resource_identity,
    content_hash: record.content_hash,
    authorization_contract_version: record.authorization_contract_version,
    created_at: record.created_at,
  };
}

export function creationIntentIntegrityHash(record: Omit<M3CreationIntent, "integrity_provenance_hash">): M3CreationIntent["integrity_provenance_hash"] {
  return sha256Canonical(creationIntentPayload(record) as never).hash;
}

function lifecyclePayload(record: Omit<M3AuthorizationLifecycleFact, "immutable_provenance_hash">): Record<string, unknown> {
  return {
    authorization_lifecycle_fact_id: record.authorization_lifecycle_fact_id,
    lifecycle_version: record.lifecycle_version,
    organization_id: record.organization_id,
    affected_authorization_decision_id: record.affected_authorization_decision_id,
    action: record.action,
    replacement_authorization_decision_id: record.replacement_authorization_decision_id,
    occurred_at: record.occurred_at,
    authority: record.authority,
    authority_evidence_ref: record.authority_evidence_ref,
    reason_ref: record.reason_ref,
  };
}

export function authorizationLifecycleFactHash(record: Omit<M3AuthorizationLifecycleFact, "immutable_provenance_hash">): M3AuthorizationLifecycleFact["immutable_provenance_hash"] {
  return sha256Canonical(lifecyclePayload(record) as never).hash;
}

function consumptionPayload(record: Omit<M3AuthorizationConsumption, "immutable_provenance_hash">): Record<string, unknown> {
  return {
    authorization_consumption_id: record.authorization_consumption_id,
    organization_id: record.organization_id,
    authorization_decision_id: record.authorization_decision_id,
    decision_integrity_hash: record.decision_integrity_hash,
    authorization_contract_version: record.authorization_contract_version,
    observed_lifecycle_outcome: record.observed_lifecycle_outcome,
    observed_lifecycle_version: record.observed_lifecycle_version,
    principal: record.principal,
    operation: record.operation,
    target: record.target,
    consumed_at: record.consumed_at,
    request_id: record.request_id,
    trace_id: record.trace_id,
    result: record.result,
    policy_version_ref: record.policy_version_ref,
  };
}

export function authorizationConsumptionHash(record: Omit<M3AuthorizationConsumption, "immutable_provenance_hash">): M3AuthorizationConsumption["immutable_provenance_hash"] {
  return sha256Canonical(consumptionPayload(record) as never).hash;
}

function isNonEmpty(value: string): boolean { return value.trim().length > 0; }

/** Validates immutable CreationIntent registration. It does not grant authority. */
export function assertCreationIntent(record: M3CreationIntent): void {
  if (record.authorization_contract_version !== M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION
      || !isNonEmpty(record.operation)
      || !isNonEmpty(record.proposed_target_resource_type)
      || !isNonEmpty(record.proposed_target_resource_id)
      || creationIntentIntegrityHash(record) !== record.integrity_provenance_hash) {
    throw new M3ContractError("M3_AUTHORIZATION_DENIED", "CreationIntent is incomplete or has invalid integrity", "M3_CREATION_INTENT_INVALID");
  }
}

/** Validates the server-side registration boundary for a target-bound decision. */
export function assertTargetBoundAuthorizationDecision(record: M3TargetBoundAuthorizationDecision, grants: readonly M3CapabilityGrant[]): void {
  const hasTarget = record.target !== undefined;
  const hasIntent = record.creation_intent_id !== undefined;
  if (record.authorization_contract_version !== M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION
      || hasTarget === hasIntent
      || !isNonEmpty(record.operation)
      || !isNonEmpty(record.issuer.capability_evidence_ref)
      || !isNonEmpty(record.issuer.authority_provenance_ref)
      || !isNonEmpty(record.immutable_evidence_provenance_ref)
      || targetBoundAuthorizationHash(record) !== record.decision_integrity_hash
      || !hasActiveGrant(grants, record.organization_id, record.issuer.actor, M3_CAPABILITIES.issue_authorization, record.issuer.capability_evidence_ref)) {
    throw new M3ContractError("M3_AUTHORIZATION_DENIED", "target-bound authorization is invalid or issuer is unauthorized", "M3_TARGET_AUTHORIZATION_INVALID");
  }
  if (record.target !== undefined && (!isNonEmpty(record.target.target_id) || !isNonEmpty(record.target.target_content_identity))) {
    throw new M3ContractError("M3_AUTHORIZATION_DENIED", "target-bound authorization target is incomplete", "M3_TARGET_AUTHORIZATION_TARGET_INVALID");
  }
}

export function lifecycleOutcome(
  decision: M3TargetBoundAuthorizationDecision,
  fact: M3AuthorizationLifecycleFact | undefined,
  authoritativeNow: string,
): { readonly outcome: M3AuthorizationLifecycleOutcome; readonly lifecycle_version: number | null } {
  if (fact !== undefined) return { outcome: fact.action, lifecycle_version: fact.lifecycle_version };
  if (decision.expires_at !== null && Date.parse(authoritativeNow) >= Date.parse(decision.expires_at)) return { outcome: "EXPIRED", lifecycle_version: null };
  return { outcome: "ACTIVE", lifecycle_version: null };
}

export function assertExactTarget(
  decision: M3TargetBoundAuthorizationDecision,
  organization_id: OrganizationId,
  principal: ActorRef,
  operation: string,
  target: AuthorizationTargetBinding,
): void {
  if (decision.organization_id !== organization_id
      || decision.authorized_principal.actor_id !== principal.actor_id
      || decision.authorized_principal.actor_type !== principal.actor_type
      || decision.operation !== operation
      || decision.target === undefined
      || decision.target.target_type !== target.target_type
      || decision.target.target_id !== target.target_id
      || decision.target.target_content_identity !== target.target_content_identity) {
    throw new M3ContractError("M3_AUTHORIZATION_DENIED", "matching target-bound authorization is required", "M3_TARGET_AUTHORIZATION_REQUIRED");
  }
}

export function assertExactCreationIntent(
  decision: M3TargetBoundAuthorizationDecision,
  intent: M3CreationIntent | undefined,
  organization_id: OrganizationId,
  principal: ActorRef,
  operation: string,
  proposed_target_resource_type: string,
  creation_payload_hash: string,
  parent_resource_identity: string | null,
  content_hash: string | null,
): M3CreationIntent {
  if (intent === undefined
      || decision.organization_id !== organization_id
      || decision.authorized_principal.actor_id !== principal.actor_id
      || decision.authorized_principal.actor_type !== principal.actor_type
      || decision.operation !== operation
      || decision.creation_intent_id !== intent.creation_intent_id
      || intent.organization_id !== organization_id
      || intent.requesting_principal.actor_id !== principal.actor_id
      || intent.requesting_principal.actor_type !== principal.actor_type
      || intent.operation !== operation
      || intent.proposed_target_resource_type !== proposed_target_resource_type
      || intent.creation_payload_hash !== creation_payload_hash
      || intent.parent_resource_identity !== parent_resource_identity
      || intent.content_hash !== content_hash) {
    throw new M3ContractError("M3_AUTHORIZATION_DENIED", "matching server-authoritative CreationIntent is required", "M3_CREATION_INTENT_REQUIRED");
  }
  assertCreationIntent(intent);
  return deepFreeze(intent);
}
