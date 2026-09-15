import {
  actorId,
  actorRef,
  contentHash,
  organizationId,
  rfc3339Timestamp,
  type ActorRef,
  type OrganizationId,
} from "../src/index.ts";
import {
  M3_AUTHORIZATION_RECORD_VERSION,
  M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION,
  M3_CAPABILITIES,
  SourceEvidenceService,
  SqliteSourceEvidenceStore,
  type TrustedClock,
  newM3Uuid,
  creationIntentIntegrityHash,
  targetBoundAuthorizationHash,
  trustedSourceEvidenceAuthorizationHash,
  type M3CapabilityGrant,
  type AuthorizationTargetBinding,
  type M3CreationIntent,
  type M3TargetBoundAuthorizationDecision,
  type TrustedSourceEvidenceAuthorizationRecord,
} from "../src/m3/index.ts";

export const m3Ids = Object.freeze({
  organization: organizationId("11c58877-f02d-4f6d-b38e-aa2191053c27"),
  otherOrganization: organizationId("12c58877-f02d-4f6d-b38e-aa2191053c27"),
  timestamp: rfc3339Timestamp("2026-09-15T10:00:00+07:00"),
  laterTimestamp: rfc3339Timestamp("2026-09-15T10:01:00+07:00"),
});

export const m3User = actorRef({ actor_type: "USER", actor_id: actorId("13c58877-f02d-4f6d-b38e-aa2191053c27"), display_name: "M3 user" });
export const m3Issuer = actorRef({ actor_type: "SERVICE", actor_id: actorId("14c58877-f02d-4f6d-b38e-aa2191053c27"), display_name: "M3 authorization issuer" });
export const m3OtherUser = actorRef({ actor_type: "USER", actor_id: actorId("15c58877-f02d-4f6d-b38e-aa2191053c27"), display_name: "Other organization user" });

export const admissionPolicy = Object.freeze({
  policy_ref: "security-m3-upload-policy/1.0.0",
  allowed_content_types: ["application/json", "text/plain"] as const,
  maximum_artifact_byte_size: 8_192,
});

function grantsFor(organization_id: OrganizationId, actor: ActorRef): readonly M3CapabilityGrant[] {
  return [{
    organization_id,
    actor_id: actor.actor_id,
    membership_status: "ACTIVE",
    capabilities: [M3_CAPABILITIES.issue_authorization, ...Object.values(M3_CAPABILITIES)],
    membership_evidence_ref: `membership:${organization_id}:${actor.actor_id}`,
  }];
}

export class M3Runtime {
  readonly grants: readonly M3CapabilityGrant[];
  readonly store: SqliteSourceEvidenceStore;
  readonly service: SourceEvidenceService;

  constructor(filename = ":memory:", clock?: TrustedClock) {
    this.grants = [...grantsFor(m3Ids.organization, m3Issuer), ...grantsFor(m3Ids.organization, m3User), ...grantsFor(m3Ids.otherOrganization, m3Issuer), ...grantsFor(m3Ids.otherOrganization, m3OtherUser)];
    this.store = new SqliteSourceEvidenceStore(filename);
    this.service = new SourceEvidenceService(this.store, this.grants, clock);
  }

  close(): void { this.store.close(); }

  authorization(capability: string, organization_id = m3Ids.organization, actor = m3User) {
    const unsigned = {
      record_contract_version: M3_AUTHORIZATION_RECORD_VERSION,
      decision: {
        authorization_decision_id: newM3Uuid(), organization_id, actor,
        requested_capability_ref: capability, decision: "ALLOWED" as const,
        evaluated_at: m3Ids.timestamp, decision_provenance_ref: `decision:${capability}:${newM3Uuid()}`,
      },
      issued_by: {
        actor: m3Issuer,
        capability_evidence_ref: `membership:${organization_id}:${m3Issuer.actor_id}`,
        authority_provenance_ref: `issuer:${newM3Uuid()}`,
      },
      immutable_evidence_provenance_ref: `authorization:${newM3Uuid()}`,
      recorded_at: m3Ids.timestamp,
    } satisfies Omit<TrustedSourceEvidenceAuthorizationRecord, "integrity_provenance_hash">;
    const record = Object.freeze({ ...unsigned, integrity_provenance_hash: trustedSourceEvidenceAuthorizationHash(unsigned) });
    this.service.registerTrustedAuthorization(record);
    return record.decision.authorization_decision_id;
  }

  creationIntent(input: {
    readonly operation: string;
    readonly proposed_target_resource_type: string;
    readonly creation_payload_hash: ReturnType<typeof contentHash>;
    readonly parent_resource_identity: string | null;
    readonly content_hash: ReturnType<typeof contentHash> | null;
    readonly organization_id?: OrganizationId;
    readonly actor?: ActorRef;
    readonly proposed_target_resource_id?: string;
  }): M3CreationIntent {
    const organization_id = input.organization_id ?? m3Ids.organization;
    const requesting_principal = input.actor ?? m3User;
    const unsigned = {
      creation_intent_id: newM3Uuid(), organization_id, operation: input.operation,
      requesting_principal, proposed_target_resource_type: input.proposed_target_resource_type,
      proposed_target_resource_id: input.proposed_target_resource_id ?? newM3Uuid(),
      creation_payload_hash: input.creation_payload_hash, parent_resource_identity: input.parent_resource_identity,
      content_hash: input.content_hash, authorization_contract_version: M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION,
      created_at: m3Ids.timestamp,
    } satisfies Omit<M3CreationIntent, "integrity_provenance_hash">;
    const record = Object.freeze({ ...unsigned, integrity_provenance_hash: creationIntentIntegrityHash(unsigned) });
    this.service.registerCreationIntent(record);
    return record;
  }

  targetAuthorization(input: {
    readonly operation: string;
    readonly target?: AuthorizationTargetBinding;
    readonly creation_intent_id?: M3CreationIntent["creation_intent_id"];
    readonly organization_id?: OrganizationId;
    readonly actor?: ActorRef;
    readonly expires_at?: M3TargetBoundAuthorizationDecision["expires_at"];
  }): M3TargetBoundAuthorizationDecision {
    const organization_id = input.organization_id ?? m3Ids.organization;
    const authorized_principal = input.actor ?? m3User;
    const unsigned = {
      authorization_decision_id: newM3Uuid(), organization_id, authorized_principal, operation: input.operation,
      ...(input.target === undefined ? {} : { target: input.target }),
      ...(input.creation_intent_id === undefined ? {} : { creation_intent_id: input.creation_intent_id }),
      authorization_contract_version: M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION,
      issued_at: m3Ids.timestamp, expires_at: input.expires_at ?? null,
      issuer: { actor: m3Issuer, capability_evidence_ref: `membership:${organization_id}:${m3Issuer.actor_id}`, authority_provenance_ref: `issuer:${newM3Uuid()}` },
      immutable_evidence_provenance_ref: `authorization:${newM3Uuid()}`,
    } satisfies Omit<M3TargetBoundAuthorizationDecision, "decision_integrity_hash">;
    const record = Object.freeze({ ...unsigned, decision_integrity_hash: targetBoundAuthorizationHash(unsigned) });
    this.service.registerTargetBoundAuthorization(record);
    return record;
  }
}

export function futureHash(): ReturnType<typeof contentHash> { return contentHash("f".repeat(64)); }
