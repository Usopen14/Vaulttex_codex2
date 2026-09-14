import { DatabaseSync } from "node:sqlite";

import { WendyDomainError, requireNonEmpty } from "../domain/common/errors.ts";
import type { OrganizationId, Uuid } from "../domain/common/ids.ts";
import type { ActorRef } from "../domain/organizations/organization.ts";

import { deepFreeze, sha256Canonical } from "./canonical.ts";
import { PAID_EXPENSE_CAPABILITIES } from "./authorization.ts";
import type {
  AuthorizationDecision,
  CapabilityGrant,
  TrustedAuthorizationDecisionRecord,
  TrustedTaxImpactEligibilityDecisionRecord,
} from "./contracts.ts";
import { M2ContractError } from "./errors.ts";
import { TAX_IMPACT_ELIGIBILITY_REVIEW_CAPABILITY, taxImpactEligibilityDecisionHash } from "./tax-impact.ts";

export type TrustedDecisionStatus = "ACTIVE" | "SUPERSEDED";

export interface LoadedAuthorizationDecision {
  readonly record: TrustedAuthorizationDecisionRecord;
  readonly status: TrustedDecisionStatus;
}

export interface LoadedTaxImpactEligibilityDecision {
  readonly record: TrustedTaxImpactEligibilityDecisionRecord;
  readonly status: TrustedDecisionStatus;
}

/**
 * Read-only port used by Ledger.  Implementations live in server-controlled
 * infrastructure; client request bodies contain only opaque decision IDs.
 */
export interface TrustedDecisionAuthority {
  loadAuthorization(authorization_decision_id: Uuid): LoadedAuthorizationDecision | undefined;
  loadTaxImpactEligibility(tax_impact_eligibility_decision_id: Uuid): LoadedTaxImpactEligibilityDecision | undefined;
}

function authorizationPayload(record: TrustedAuthorizationDecisionRecord): Record<string, unknown> {
  return {
    record_contract_version: record.record_contract_version,
    authorization: record.authorization,
    affected_effect: record.affected_effect,
    originator: record.originator,
    deciding_authority: record.deciding_authority,
    immutable_evidence_provenance_ref: record.immutable_evidence_provenance_ref,
    recorded_at: record.recorded_at,
    supersedes_authorization_decision_id: record.supersedes_authorization_decision_id,
  };
}

function taxPayload(record: TrustedTaxImpactEligibilityDecisionRecord): Record<string, unknown> {
  return {
    record_contract_version: record.record_contract_version,
    decision: record.decision,
    reviewer_authority: record.reviewer_authority,
    immutable_evidence_provenance_ref: record.immutable_evidence_provenance_ref,
    recorded_at: record.recorded_at,
  };
}

export function trustedAuthorizationRecordHash(record: Omit<TrustedAuthorizationDecisionRecord, "integrity_provenance_hash">): TrustedAuthorizationDecisionRecord["integrity_provenance_hash"] {
  return sha256Canonical(authorizationPayload(record as TrustedAuthorizationDecisionRecord) as never).hash;
}

export function trustedTaxImpactEligibilityRecordHash(record: Omit<TrustedTaxImpactEligibilityDecisionRecord, "integrity_provenance_hash">): TrustedTaxImpactEligibilityDecisionRecord["integrity_provenance_hash"] {
  return sha256Canonical(taxPayload(record as TrustedTaxImpactEligibilityDecisionRecord) as never).hash;
}

function hasActiveCapability(grants: readonly CapabilityGrant[], organization_id: OrganizationId, actor: ActorRef, capability: string, evidence: string): boolean {
  return grants.some((grant) => grant.organization_id === organization_id
    && grant.actor_id === actor.actor_id
    && grant.membership_status === "ACTIVE"
    && grant.capabilities.includes(capability)
    && grant.membership_evidence_ref === evidence);
}

function authorizationIssuerCapability(operation: AuthorizationDecision["requested_operation"]): string {
  return operation === "PAID_EXPENSE_CORRECTION" || operation === "POST_PAID_EXPENSE_CORRECTION"
    ? PAID_EXPENSE_CAPABILITIES.correction_approval
    : PAID_EXPENSE_CAPABILITIES.submit;
}

function assertAuthorizationRecord(record: TrustedAuthorizationDecisionRecord, grants: readonly CapabilityGrant[]): void {
  const authorization = record.authorization;
  requireNonEmpty(record.deciding_authority.capability_evidence_ref, "deciding_authority.capability_evidence_ref");
  requireNonEmpty(record.deciding_authority.authority_provenance_ref, "deciding_authority.authority_provenance_ref");
  requireNonEmpty(record.immutable_evidence_provenance_ref, "immutable_evidence_provenance_ref");
  const expected = [...record.affected_effect.event_refs].sort((left, right) => left.event_type.localeCompare(right.event_type));
  const observed = [...authorization.approval_control_audit.affected_event_refs].sort((left, right) => left.event_type.localeCompare(right.event_type));
  const exactEvents = expected.length === 2 && observed.length === 2 && observed.every((value, index) => value.event_id === expected[index]?.event_id && value.event_version === expected[index]?.event_version && value.event_type === expected[index]?.event_type);
  if (authorization.authorization_evidence_ref.trim().length === 0
      || authorization.decision !== "ALLOWED"
      || authorization.independent_approver_resolution.originator_actor_id !== record.originator.actor_id
      || authorization.approval_control_audit.source_request_id !== record.affected_effect.source_request_id
      || authorization.approval_control_audit.policy_version_ref.length === 0
      || authorization.policy_version_refs.length === 0
      || !exactEvents) {
    throw new M2ContractError("AUTHORIZATION_DENIED", "trusted authorization record is incomplete", "TRUSTED_AUTHORIZATION_RECORD_INVALID");
  }
  const issuerCapability = authorizationIssuerCapability(authorization.requested_operation);
  if (!hasActiveCapability(grants, authorization.organization_id, record.deciding_authority.actor, issuerCapability, record.deciding_authority.capability_evidence_ref)) {
    throw new M2ContractError("AUTHORIZATION_DENIED", "authorization authority lacks an active server-side capability", "TRUSTED_AUTHORIZATION_ISSUER_UNAUTHORIZED");
  }
  if (trustedAuthorizationRecordHash(record) !== record.integrity_provenance_hash) {
    throw new M2ContractError("AUTHORIZATION_DENIED", "trusted authorization integrity hash mismatch", "TRUSTED_AUTHORIZATION_INTEGRITY_MISMATCH");
  }
}

function assertTaxRecord(record: TrustedTaxImpactEligibilityDecisionRecord, grants: readonly CapabilityGrant[]): void {
  const decision = record.decision;
  requireNonEmpty(record.reviewer_authority.capability_evidence_ref, "reviewer_authority.capability_evidence_ref");
  requireNonEmpty(record.reviewer_authority.authority_provenance_ref, "reviewer_authority.authority_provenance_ref");
  requireNonEmpty(record.immutable_evidence_provenance_ref, "immutable_evidence_provenance_ref");
  if (record.reviewer_authority.actor.actor_id !== decision.accounting_reviewer.actor.actor_id
      || !hasActiveCapability(grants, decision.organization_id, record.reviewer_authority.actor, TAX_IMPACT_ELIGIBILITY_REVIEW_CAPABILITY, record.reviewer_authority.capability_evidence_ref)
      || taxImpactEligibilityDecisionHash(decision) !== decision.decision_provenance_hash
      || trustedTaxImpactEligibilityRecordHash(record) !== record.integrity_provenance_hash) {
    throw new M2ContractError("AUTHORIZATION_DENIED", "trusted T-01 decision is not server-authorized or has been altered", "TRUSTED_TAX_DECISION_INVALID");
  }
}

/** Server-side reference implementation. Registration is an authority action, never a Ledger action. */
export class InMemoryTrustedDecisionAuthority implements TrustedDecisionAuthority {
  #authorizations = new Map<Uuid, TrustedAuthorizationDecisionRecord>();
  #tax = new Map<Uuid, TrustedTaxImpactEligibilityDecisionRecord>();
  #supersededAuthorizations = new Set<Uuid>();
  #supersededTax = new Set<Uuid>();
  private readonly grants: readonly CapabilityGrant[];

  constructor(grants: readonly CapabilityGrant[]) { this.grants = Object.freeze([...grants]); }

  registerAuthorization(record: TrustedAuthorizationDecisionRecord): void {
    assertAuthorizationRecord(record, this.grants);
    const id = record.authorization.authorization_decision_id;
    if (this.#authorizations.has(id)) throw new M2ContractError("IMMUTABLE_HISTORY", "trusted authorization decision already exists", "TRUSTED_AUTHORIZATION_IMMUTABLE");
    if (record.supersedes_authorization_decision_id !== null) {
      if (!this.#authorizations.has(record.supersedes_authorization_decision_id)) throw new M2ContractError("M2_CONTRACT_VIOLATION", "superseded authorization decision is absent", "TRUSTED_AUTHORIZATION_SUPERSEDES_MISSING");
      this.#supersededAuthorizations.add(record.supersedes_authorization_decision_id);
    }
    this.#authorizations.set(id, deepFreeze(record));
  }

  registerTaxImpactEligibility(record: TrustedTaxImpactEligibilityDecisionRecord): void {
    assertTaxRecord(record, this.grants);
    const id = record.decision.tax_impact_eligibility_decision_id;
    if (this.#tax.has(id)) throw new M2ContractError("IMMUTABLE_HISTORY", "trusted T-01 decision already exists", "TRUSTED_TAX_DECISION_IMMUTABLE");
    if (record.decision.supersedes_tax_impact_eligibility_decision_id !== null) {
      if (!this.#tax.has(record.decision.supersedes_tax_impact_eligibility_decision_id)) throw new M2ContractError("M2_CONTRACT_VIOLATION", "superseded T-01 decision is absent", "TRUSTED_TAX_DECISION_SUPERSEDES_MISSING");
      this.#supersededTax.add(record.decision.supersedes_tax_impact_eligibility_decision_id);
    }
    this.#tax.set(id, deepFreeze(record));
  }

  loadAuthorization(id: Uuid): LoadedAuthorizationDecision | undefined {
    const record = this.#authorizations.get(id);
    return record === undefined ? undefined : deepFreeze({ record, status: this.#supersededAuthorizations.has(id) ? "SUPERSEDED" : "ACTIVE" });
  }

  loadTaxImpactEligibility(id: Uuid): LoadedTaxImpactEligibilityDecision | undefined {
    const record = this.#tax.get(id);
    return record === undefined ? undefined : deepFreeze({ record, status: this.#supersededTax.has(id) ? "SUPERSEDED" : "ACTIVE" });
  }
}

/**
 * Durable adapter for independently opened SQLite connections. The M2 Ledger
 * schema owns its tables/migrations; this authority refuses an uninitialized
 * database rather than creating production tables opportunistically.
 */
export class SqliteTrustedDecisionAuthority implements TrustedDecisionAuthority {
  private readonly database: DatabaseSync;
  private readonly grants: readonly CapabilityGrant[];

  constructor(filename: string, grants: readonly CapabilityGrant[]) {
    this.database = new DatabaseSync(filename, { timeout: 5_000 });
    this.database.exec("PRAGMA foreign_keys = ON");
    const table = this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'wendy_m2_trusted_authorization'").get();
    if (table === undefined) {
      this.database.close();
      throw new M2ContractError("M2_CONTRACT_VIOLATION", "M2 schema must be initialized before the trusted decision authority", "M2_SCHEMA_NOT_INITIALIZED");
    }
    this.grants = Object.freeze([...grants]);
  }

  registerAuthorization(record: TrustedAuthorizationDecisionRecord): void {
    assertAuthorizationRecord(record, this.grants);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (record.supersedes_authorization_decision_id !== null && this.database.prepare("SELECT 1 FROM wendy_m2_trusted_authorization WHERE authorization_decision_id = ?").get(record.supersedes_authorization_decision_id) === undefined) {
        throw new M2ContractError("M2_CONTRACT_VIOLATION", "superseded authorization decision is absent", "TRUSTED_AUTHORIZATION_SUPERSEDES_MISSING");
      }
      this.database.prepare("INSERT INTO wendy_m2_trusted_authorization (authorization_decision_id, organization_id, record_json) VALUES (?, ?, ?)").run(record.authorization.authorization_decision_id, record.authorization.organization_id, JSON.stringify(record));
      if (record.supersedes_authorization_decision_id !== null) this.database.prepare("INSERT INTO wendy_m2_decision_supersession (decision_kind, superseded_decision_id, replacement_decision_id) VALUES ('AUTHORIZATION', ?, ?)").run(record.supersedes_authorization_decision_id, record.authorization.authorization_decision_id);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  registerTaxImpactEligibility(record: TrustedTaxImpactEligibilityDecisionRecord): void {
    assertTaxRecord(record, this.grants);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (record.decision.supersedes_tax_impact_eligibility_decision_id !== null && this.database.prepare("SELECT 1 FROM wendy_m2_trusted_tax_impact WHERE tax_impact_eligibility_decision_id = ?").get(record.decision.supersedes_tax_impact_eligibility_decision_id) === undefined) {
        throw new M2ContractError("M2_CONTRACT_VIOLATION", "superseded T-01 decision is absent", "TRUSTED_TAX_DECISION_SUPERSEDES_MISSING");
      }
      this.database.prepare("INSERT INTO wendy_m2_trusted_tax_impact (tax_impact_eligibility_decision_id, organization_id, record_json) VALUES (?, ?, ?)").run(record.decision.tax_impact_eligibility_decision_id, record.decision.organization_id, JSON.stringify(record));
      if (record.decision.supersedes_tax_impact_eligibility_decision_id !== null) this.database.prepare("INSERT INTO wendy_m2_decision_supersession (decision_kind, superseded_decision_id, replacement_decision_id) VALUES ('TAX_IMPACT', ?, ?)").run(record.decision.supersedes_tax_impact_eligibility_decision_id, record.decision.tax_impact_eligibility_decision_id);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  loadAuthorization(id: Uuid): LoadedAuthorizationDecision | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m2_trusted_authorization WHERE authorization_decision_id = ?").get(id) as { readonly record_json: string } | undefined;
    if (row === undefined) return undefined;
    const superseded = this.database.prepare("SELECT 1 FROM wendy_m2_decision_supersession WHERE decision_kind = 'AUTHORIZATION' AND superseded_decision_id = ?").get(id) !== undefined;
    return deepFreeze({ record: JSON.parse(row.record_json) as TrustedAuthorizationDecisionRecord, status: superseded ? "SUPERSEDED" : "ACTIVE" });
  }

  loadTaxImpactEligibility(id: Uuid): LoadedTaxImpactEligibilityDecision | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m2_trusted_tax_impact WHERE tax_impact_eligibility_decision_id = ?").get(id) as { readonly record_json: string } | undefined;
    if (row === undefined) return undefined;
    const superseded = this.database.prepare("SELECT 1 FROM wendy_m2_decision_supersession WHERE decision_kind = 'TAX_IMPACT' AND superseded_decision_id = ?").get(id) !== undefined;
    return deepFreeze({ record: JSON.parse(row.record_json) as TrustedTaxImpactEligibilityDecisionRecord, status: superseded ? "SUPERSEDED" : "ACTIVE" });
  }

  close(): void { this.database.close(); }
}
