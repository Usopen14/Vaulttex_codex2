import type { Account } from "../domain/accounting/coa.ts";
import type { AccountingProfile } from "../domain/accounting/profiles.ts";
import type { ContentHash, EconomicGroupId, EventRelationshipId, FinancialEventId, IdempotencyKey, OrganizationId, RequestId, TraceId, Uuid } from "../domain/common/ids.ts";
import type { Money } from "../domain/common/money.ts";
import type { IsoDate, Rfc3339Timestamp } from "../domain/common/time.ts";
import type { ApprovalLevel, EvidenceRef, EventRelationship, ExpenseCategory, ExpenseRecognizedEvent, FinancialEvent, PaymentMadeEvent, PaymentSourceType, SourceRef } from "../domain/events/financial-event.ts";
import type { ActorRef, OrganizationRole } from "../domain/organizations/organization.ts";
import type { AccountingPeriod } from "../domain/periods/periods.ts";

export const PAID_EXPENSE_RULE_ID = "PAID_EXPENSE" as const;
export const PAID_EXPENSE_RULE_VERSION = "v1" as const;
export const FINANCIAL_EVENT_FINGERPRINT_VERSION = "wendy.financial-event-fingerprint/1.0.0" as const;
export const PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION = "wendy.paid-expense-effect-fingerprint/1.0.0" as const;
export const TAX_IMPACT_ELIGIBILITY_VERSION = "wendy.paid-expense.tax-impact-eligibility/1.0.0" as const;
export const ENGINEERING_CONTRACT_VERSION = "wendy.paid-expense.engineering-contract/1.0.0" as const;
export const DTO_SCHEMA_VERSION = "wendy.paid-expense.dto/1.0.0" as const;

export const PAID_EXPENSE_OPERATIONS = [
  "VALIDATE_PAID_EXPENSE",
  "USER_CONFIRM_PAID_EXPENSE",
  "REQUEST_ELEVATED_APPROVAL",
  "DECIDE_ELEVATED_APPROVAL",
  "REQUEST_PERIOD_AUTHORIZATION",
  "POST_PAID_EXPENSE",
  "REQUEST_PAID_EXPENSE_CORRECTION",
  "POST_PAID_EXPENSE_CORRECTION",
] as const;

export type PaidExpenseOperation = (typeof PAID_EXPENSE_OPERATIONS)[number];
export type PostingOutcome = "POSTED" | "REVIEW_REQUIRED" | "REJECTED" | "DUPLICATE" | "PERIOD_DENIED" | "IN_PROGRESS" | "UNKNOWN_OUTCOME";
export type MappingResolution = "EXACTLY_ONE" | "ZERO_ELIGIBLE" | "MULTIPLE_ELIGIBLE" | "INELIGIBLE" | "CROSS_ORGANIZATION";
export type TaxImpactEligibilityOutcome = "NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED" | "SEPARATE_ACCOUNTING_IMPACT_REQUIRED" | "UNRESOLVED";
export type AuthorizationOutcome = "ALLOWED" | "REVIEW_REQUIRED" | "DENIED";
export type PeriodAuthorizationOutcome = "POSTING_ALLOWED" | "PERIOD_DENIED" | "REVIEW_REQUIRED";
export type ApprovalControlMechanism = "STANDARD_INDEPENDENT_APPROVAL" | "OWNER_OVERRIDE" | "NOT_APPLICABLE";
export type JournalKind = "ORIGINAL" | "REVERSAL" | "CORRECTED_REPLACEMENT";

export interface EventVersionRef {
  readonly event_id: FinancialEventId;
  readonly event_version: number;
  readonly event_type: "ExpenseRecognized" | "PaymentMade";
}

export interface Fingerprint {
  readonly contract_version: typeof FINANCIAL_EVENT_FINGERPRINT_VERSION | typeof PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION;
  readonly value: ContentHash;
  readonly canonical_preimage: string;
}

export interface CategoryAccountMapping {
  readonly mapping_id: Uuid;
  readonly mapping_version: string;
  readonly organization_id: OrganizationId;
  readonly expense_category: ExpenseCategory;
  readonly effective_from: IsoDate;
  readonly effective_to: IsoDate | null;
  readonly account: Account;
  /** Immutable evidence that the target was debit-eligible at the evaluated accounting date. */
  readonly eligibility_at_effective_date: "ELIGIBLE" | "INELIGIBLE";
  readonly account_eligibility_evidence_ref: string;
  readonly coa_version_ref: string;
}

export interface PaymentSourceAccountMapping {
  readonly mapping_id: Uuid;
  readonly mapping_version: string;
  readonly organization_id: OrganizationId;
  readonly payment_source_id: string;
  readonly payment_source_type: PaymentSourceType;
  readonly effective_from: IsoDate;
  readonly effective_to: IsoDate | null;
  readonly account: Account;
  /** Immutable evidence that the target was credit-eligible at the evaluated accounting date. */
  readonly eligibility_at_effective_date: "ELIGIBLE" | "INELIGIBLE";
  readonly account_eligibility_evidence_ref: string;
  readonly coa_version_ref: string;
}

export interface MappingResolutionResponse {
  readonly contract_version: "wendy.paid-expense.category-account-resolution/1.0.0" | "wendy.paid-expense.payment-source-account-resolution/1.0.0";
  readonly organization_id: OrganizationId;
  readonly resolution: MappingResolution;
  readonly evaluated_effective_date: IsoDate;
  readonly mapping_id: Uuid | null;
  readonly mapping_version: string | null;
  readonly mapping_effective_from: IsoDate | null;
  readonly mapping_effective_to: IsoDate | null;
  readonly resolved_account_id: string | null;
  readonly coa_version_ref: string | null;
  readonly account_eligibility_evidence_ref: string | null;
  readonly reason_codes: readonly string[];
}

export interface TaxImpactEligibilityDecision {
  readonly contract_version: typeof TAX_IMPACT_ELIGIBILITY_VERSION;
  readonly tax_impact_eligibility_decision_id: Uuid;
  readonly decision_version: number;
  readonly policy_version: "WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.1";
  readonly organization_id: OrganizationId;
  readonly economic_group_id: EconomicGroupId;
  readonly financial_event_refs: readonly [EventVersionRef, EventVersionRef];
  readonly fulfills_relationship_id: EventRelationshipId;
  readonly accounting_rule: { readonly rule_id: typeof PAID_EXPENSE_RULE_ID; readonly immutable_rule_version: typeof PAID_EXPENSE_RULE_VERSION };
  readonly outcome: TaxImpactEligibilityOutcome;
  readonly accounting_reviewer: {
    readonly actor: ActorRef;
    readonly reviewer_authorization_evidence_ref: string;
    readonly accounting_reviewer_capability_ref: string;
  };
  readonly decision_basis: {
    readonly reason_code: string;
    readonly rationale: string;
    readonly evidence_reference: string;
    readonly evidence_refs: readonly EvidenceRef[];
  };
  readonly decided_at: Rfc3339Timestamp;
  readonly decision_provenance_hash: ContentHash;
  readonly supersedes_tax_impact_eligibility_decision_id: Uuid | null;
}

export interface TaxImpactEligibilityConsumption {
  readonly tax_impact_eligibility_decision_id: Uuid;
  readonly decision_version: number;
  readonly decision_provenance_hash: ContentHash;
  readonly organization_id: OrganizationId;
  readonly economic_group_id: EconomicGroupId;
  readonly event_refs: readonly [EventVersionRef, EventVersionRef];
  readonly accounting_rule: { readonly rule_id: typeof PAID_EXPENSE_RULE_ID; readonly immutable_rule_version: typeof PAID_EXPENSE_RULE_VERSION };
  readonly journal_entry_id: Uuid;
  readonly consumed_at: Rfc3339Timestamp;
  readonly posting_transaction_ref: string;
}

export interface CapabilityGrant {
  readonly organization_id: OrganizationId;
  readonly actor_id: ActorRef["actor_id"];
  readonly role: OrganizationRole;
  readonly membership_status: "ACTIVE" | "INACTIVE";
  readonly capabilities: readonly string[];
  readonly membership_evidence_ref: string;
}

export interface AuthorizationDecision {
  readonly contract_version: "wendy.paid-expense.authorization-decision/1.0.0";
  readonly authorization_decision_id: Uuid;
  readonly organization_id: OrganizationId;
  readonly requested_operation: PaidExpenseOperation | "PAID_EXPENSE_CORRECTION";
  readonly decision: AuthorizationOutcome;
  readonly reason_codes: readonly string[];
  readonly required_next_action: string | null;
  readonly evaluated_at: Rfc3339Timestamp;
  readonly policy_version_refs: readonly string[];
  readonly authorization_evidence_ref: string;
  readonly independent_approver_resolution: {
    readonly originator_actor_id: ActorRef["actor_id"];
    readonly candidate_actor_ids_ref: string;
    readonly independent_eligible_actor_ids_ref: string;
    readonly actor_identity_comparison: "DIFFERENT" | "SAME";
    readonly resolution_at: Rfc3339Timestamp;
  };
  readonly approval_control_audit: {
    readonly control_mechanism: ApprovalControlMechanism;
    readonly self_approved: boolean;
    readonly owner_override_reason: string | null;
    readonly source_request_id: RequestId;
    readonly affected_event_refs: readonly EventVersionRef[];
    readonly policy_version_ref: string;
  };
}

/**
 * Server-authoritative envelope around a policy decision.  This is deliberately
 * separate from the DTO: a client can name a decision, but cannot manufacture
 * the authority record which binds and attests to it.
 */
export interface TrustedAuthorizationDecisionRecord {
  readonly record_contract_version: "wendy.paid-expense.trusted-authorization/1.0.0";
  readonly authorization: AuthorizationDecision;
  readonly affected_effect: {
    readonly economic_group_id: EconomicGroupId;
    readonly fulfills_relationship_id: EventRelationshipId;
    readonly event_refs: readonly [EventVersionRef, EventVersionRef];
    readonly source_request_id: RequestId;
    readonly required_approval_level: ApprovalLevel;
  };
  readonly originator: ActorRef;
  readonly deciding_authority: {
    readonly actor: ActorRef;
    readonly capability_evidence_ref: string;
    readonly authority_provenance_ref: string;
  };
  readonly immutable_evidence_provenance_ref: string;
  readonly integrity_provenance_hash: ContentHash;
  readonly recorded_at: Rfc3339Timestamp;
  readonly supersedes_authorization_decision_id: Uuid | null;
}

/** The T-01 DTO plus server-authoritative reviewer/capability attestation. */
export interface TrustedTaxImpactEligibilityDecisionRecord {
  readonly record_contract_version: "wendy.paid-expense.trusted-tax-impact-eligibility/1.0.0";
  readonly decision: TaxImpactEligibilityDecision;
  readonly reviewer_authority: {
    readonly actor: ActorRef;
    readonly capability_evidence_ref: string;
    readonly authority_provenance_ref: string;
  };
  readonly immutable_evidence_provenance_ref: string;
  readonly integrity_provenance_hash: ContentHash;
  readonly recorded_at: Rfc3339Timestamp;
}

/** Immutable snapshot attached to the exact Journal transaction that consumed it. */
export interface ConsumedDecisionProvenance {
  readonly provenance_id: Uuid;
  readonly organization_id: OrganizationId;
  readonly journal_entry_id: Uuid;
  readonly authorization: {
    readonly authorization_decision_id: Uuid;
    readonly requested_operation: AuthorizationDecision["requested_operation"];
    readonly decision: AuthorizationOutcome;
    readonly policy_version_refs: readonly string[];
    readonly authorization_evidence_ref: string;
    readonly integrity_provenance_hash: ContentHash;
    readonly deciding_actor: ActorRef;
    readonly capability_evidence_ref: string;
  };
  readonly tax_impact: {
    readonly tax_impact_eligibility_decision_id: Uuid;
    readonly decision_version: number;
    readonly policy_version: TaxImpactEligibilityDecision["policy_version"];
    readonly outcome: TaxImpactEligibilityOutcome;
    readonly decision_provenance_hash: ContentHash;
    readonly integrity_provenance_hash: ContentHash;
    readonly reviewer: ActorRef;
    readonly capability_evidence_ref: string;
    readonly evidence_reference: string;
  };
  readonly consumed_at: Rfc3339Timestamp;
  readonly posting_transaction_ref: string;
}

export interface PeriodAuthorizationDecision {
  readonly contract_version: "wendy.paid-expense.period-authorization/1.0.0";
  readonly period_authorization_decision_id: Uuid;
  readonly organization_id: OrganizationId;
  readonly accounting_period_id: AccountingPeriod["accounting_period_id"];
  readonly observed_period_version: number;
  readonly requested_operation: "ORIGINAL_POST" | "REVERSAL" | "CORRECTED_REPLACEMENT";
  readonly decision: PeriodAuthorizationOutcome;
  readonly reason_codes: readonly string[];
  readonly required_approval_or_escalation: string | null;
  readonly accounting_profile_snapshot_ref: string;
  readonly period_policy_version_refs: readonly string[];
  readonly proposed_accounting_date: IsoDate;
  readonly proposed_posting_date: IsoDate;
  readonly decided_at: Rfc3339Timestamp;
}

export interface JournalLine {
  readonly line_id: Uuid;
  readonly line_number: number;
  readonly account_id: Account["account_id"];
  readonly debit: Money | null;
  readonly credit: Money | null;
  readonly line_provenance_ref: string;
}

export interface JournalDraft {
  readonly contract_version: "wendy.paid-expense.journal-draft/1.0.0";
  readonly journal_draft_id: Uuid;
  readonly organization_id: OrganizationId;
  readonly financial_effect_fingerprint: Fingerprint;
  readonly event_refs: readonly [EventVersionRef, EventVersionRef];
  readonly economic_group_id: EconomicGroupId;
  readonly fulfills_relationship_ref: EventRelationshipId;
  readonly accounting_rule: { readonly rule_id: typeof PAID_EXPENSE_RULE_ID; readonly immutable_rule_version: typeof PAID_EXPENSE_RULE_VERSION };
  readonly accounting_date: IsoDate;
  readonly posting_date: IsoDate;
  readonly currency: "THB";
  readonly mapping_provenance: { readonly category_mapping: MappingResolutionResponse; readonly payment_source_mapping: MappingResolutionResponse };
  readonly lines: readonly [JournalLine, JournalLine];
  readonly total_debit: Money;
  readonly total_credit: Money;
  readonly provenance: {
    readonly source_refs: readonly SourceRef[];
    readonly evidence_refs: readonly EvidenceRef[];
    readonly confirmation_audit_ref: string;
    readonly validation_result_ref: Uuid;
    readonly tax_impact_eligibility_decision_ref: Uuid;
    readonly authorization_decision_ref: Uuid;
    readonly period_authorization_ref: Uuid;
    readonly trace_id: TraceId;
  };
}

export interface PostedJournal {
  readonly journal_entry_id: Uuid;
  readonly organization_id: OrganizationId;
  readonly journal_kind: JournalKind;
  readonly original_journal_entry_id: Uuid | null;
  readonly immutable_draft: JournalDraft;
  readonly committed_at: Rfc3339Timestamp;
  readonly committed_transaction_ref: string;
  readonly tax_impact_consumption: TaxImpactEligibilityConsumption | null;
}

export interface PostingResult {
  readonly contract_version: "wendy.paid-expense.posting-result/1.0.0";
  readonly organization_id: OrganizationId;
  readonly idempotency_namespace: string;
  readonly idempotency_key: IdempotencyKey;
  readonly outcome: PostingOutcome;
  readonly financial_effect_fingerprint: ContentHash | null;
  readonly journal_entry_id: Uuid | null;
  readonly existing_result_ref: string | null;
  readonly review_case_ref: string | null;
  readonly period_authorization_ref: Uuid | null;
  readonly reason_codes: readonly string[];
  readonly committed_transaction_ref: string | null;
  readonly trace_id: TraceId;
}

export interface PaidExpensePair {
  readonly expense: ExpenseRecognizedEvent;
  readonly payment: PaymentMadeEvent;
  readonly fulfills_relationship: EventRelationship;
}

export interface OriginalPostingCommand {
  readonly operation: "POST_PAID_EXPENSE";
  readonly organization_id: OrganizationId;
  readonly request_id: RequestId;
  readonly trace_id: TraceId;
  readonly idempotency_key: IdempotencyKey;
  /** Authenticated requester that owns the idempotency key; never the Ledger writer. */
  readonly requester: ActorRef;
  readonly pair: PaidExpensePair;
  readonly accounting_profile: AccountingProfile;
  readonly accounting_period: AccountingPeriod;
  readonly period_authorization: PeriodAuthorizationDecision;
  /** Opaque client references. The Ledger loads authoritative records itself. */
  readonly authorization_decision_id: Uuid;
  readonly tax_impact_eligibility_decision_id: Uuid;
  readonly category_mappings: readonly CategoryAccountMapping[];
  readonly payment_source_mappings: readonly PaymentSourceAccountMapping[];
  readonly validation_result_ref: Uuid;
  readonly confirmation_audit_ref: string;
  readonly requested_at: Rfc3339Timestamp;
}

export interface CorrectionPostingCommand {
  readonly operation: "POST_PAID_EXPENSE_CORRECTION";
  readonly organization_id: OrganizationId;
  readonly request_id: RequestId;
  readonly trace_id: TraceId;
  readonly idempotency_key: IdempotencyKey;
  readonly requester: ActorRef;
  readonly original_journal_entry_id: Uuid;
  readonly reason: string;
  readonly source_evidence_refs: readonly EvidenceRef[];
  /** Opaque client reference to a separately issued correction authority decision. */
  readonly authorization_decision_id: Uuid;
  readonly reversal_accounting_period: AccountingPeriod;
  readonly reversal_period_authorization: PeriodAuthorizationDecision;
  readonly replacement: OriginalPostingCommand;
  readonly correction_relationships: readonly EventRelationship[];
  readonly requested_at: Rfc3339Timestamp;
}

export interface CorrectionCase {
  readonly contract_version: "wendy.paid-expense.correction-case/1.0.0";
  readonly correction_case_id: Uuid;
  readonly organization_id: OrganizationId;
  readonly original_journal_entry_id: Uuid;
  readonly reversal_journal_entry_id: Uuid;
  readonly corrected_replacement_journal_entry_id: Uuid;
  readonly original_effect_fingerprint: ContentHash;
  readonly replacement_effect_fingerprint: ContentHash;
  readonly reason: string;
  readonly source_request_id: RequestId;
  readonly requester: ActorRef;
  readonly approval_decision_ref: Uuid;
  readonly reversal_period_authorization_ref: Uuid;
  readonly replacement_period_authorization_ref: Uuid;
  readonly original_rule_mapping_provenance_ref: string;
  readonly replacement_rule_mapping_provenance_ref: string;
  readonly event_relationship_refs: readonly EventRelationshipId[];
  readonly created_at: Rfc3339Timestamp;
}

export interface M2AuditRecord {
  readonly audit_id: Uuid;
  readonly organization_id: OrganizationId;
  readonly action: "POST_PAID_EXPENSE" | "POST_PAID_EXPENSE_CORRECTION";
  readonly actor: ActorRef;
  readonly source_request_id: RequestId;
  readonly trace_id: TraceId;
  readonly journal_entry_ids: readonly Uuid[];
  readonly created_at: Rfc3339Timestamp;
  readonly immutable_payload_hash: ContentHash;
}

export type M2FinancialEvent = FinancialEvent;
