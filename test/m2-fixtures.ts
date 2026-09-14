import {
  accountId,
  accountingPeriodId,
  actorId,
  actorRef,
  contentHash,
  createAccount,
  createAccountingPeriod,
  createAccountingProfile,
  createEventRelationship,
  createFinancialEvent,
  economicGroupId,
  eventFingerprint,
  eventRelationshipId,
  financialEventId,
  idempotencyKey,
  isoDate,
  money,
  requestId,
  traceId,
  uuid,
  type Account,
  type AccountingPeriod,
  type AccountingProfile,
  type ActorRef,
  type EventRelationship,
} from "../src/index.ts";
import {
  authorizePaidExpensePeriod,
  decidePaidExpenseAuthorization,
  financialEventFingerprint,
  taxImpactEligibilityDecisionHash,
  trustedAuthorizationRecordHash,
  trustedTaxImpactEligibilityRecordHash,
  InMemoryTrustedDecisionAuthority,
  type AuthorizationDecision,
  type CapabilityGrant,
  type CategoryAccountMapping,
  type OriginalPostingCommand,
  type CorrectionPostingCommand,
  type PostedJournal,
  type PaidExpensePair,
  type PaymentSourceAccountMapping,
  type PeriodAuthorizationDecision,
  type TaxImpactEligibilityDecision,
  type TrustedAuthorizationDecisionRecord,
  type TrustedTaxImpactEligibilityDecisionRecord,
} from "../src/m2/index.ts";
import { expenseEvent, fulfillsRelationship, ids, paymentEvent, user } from "./m1-fixtures.ts";

const HASH_C = contentHash("c".repeat(64));

export const m2Ids = Object.freeze({
  service: actorId("11c58877-f02d-4f6d-b38e-aa2191053c27"),
  reviewer: actorId("12c58877-f02d-4f6d-b38e-aa2191053c27"),
  accountant: actorId("13c58877-f02d-4f6d-b38e-aa2191053c27"),
  expenseAccount: accountId("14c58877-f02d-4f6d-b38e-aa2191053c27"),
  cashAccount: accountId("15c58877-f02d-4f6d-b38e-aa2191053c27"),
  period: accountingPeriodId("16c58877-f02d-4f6d-b38e-aa2191053c27"),
  categoryMapping: uuid("17c58877-f02d-4f6d-b38e-aa2191053c27"),
  paymentMapping: uuid("18c58877-f02d-4f6d-b38e-aa2191053c27"),
  taxDecision: uuid("19c58877-f02d-4f6d-b38e-aa2191053c27"),
  authorization: uuid("20c58877-f02d-4f6d-b38e-aa2191053c27"),
  validation: uuid("21c58877-f02d-4f6d-b38e-aa2191053c27"),
});

export const serviceActor = actorRef({ actor_type: "SERVICE", actor_id: m2Ids.service, display_name: "Ledger Posting Service" });
export const reviewerActor = actorRef({ actor_type: "USER", actor_id: m2Ids.reviewer, display_name: "Accounting reviewer" });
export const accountantActor = actorRef({ actor_type: "USER", actor_id: m2Ids.accountant, display_name: "Independent accountant" });

export const accountingProfile: AccountingProfile = createAccountingProfile({
  organization_id: ids.organization,
  fiscal_year_start: isoDate("2026-01-01"),
  fiscal_year_end: isoDate("2026-12-31"),
  accounting_standard: "M2 fixture",
  entity_type: "M2 fixture",
  functional_currency: "THB",
  timezone: "Asia/Bangkok",
});

export function period(status: AccountingPeriod["status"] = "OPEN", period_version = 1): AccountingPeriod {
  return createAccountingPeriod({
    accounting_period_id: m2Ids.period,
    organization_id: ids.organization,
    start_date: isoDate("2026-09-01"),
    end_date: isoDate("2026-09-30"),
    status,
    period_version,
    created_at: ids.timestamp,
    created_by: user,
  });
}

export const grants: readonly CapabilityGrant[] = Object.freeze([
  { organization_id: ids.organization, actor_id: user.actor_id, role: "PREPARER", membership_status: "ACTIVE", capabilities: ["PAID_EXPENSE_SUBMIT", "PAID_EXPENSE_USER_CONFIRM"], membership_evidence_ref: "membership:user" },
  { organization_id: ids.organization, actor_id: serviceActor.actor_id, role: "SERVICE", membership_status: "ACTIVE", capabilities: ["PAID_EXPENSE_LEDGER_POST"], membership_evidence_ref: "membership:ledger-service" },
  { organization_id: ids.organization, actor_id: reviewerActor.actor_id, role: "ACCOUNTANT", membership_status: "ACTIVE", capabilities: ["PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_REVIEW"], membership_evidence_ref: "membership:tax-reviewer" },
  { organization_id: ids.organization, actor_id: accountantActor.actor_id, role: "ACCOUNTANT", membership_status: "ACTIVE", capabilities: ["PAID_EXPENSE_CORRECTION_APPROVAL", "PAID_EXPENSE_ELEVATED_APPROVAL"], membership_evidence_ref: "membership:accountant" },
]);

function confirmedApproval() {
  return { required_level: "USER_CONFIRM" as const, status: "APPROVED" as const, candidate_hash: ids.contentHashA, decided_at: ids.timestamp, decided_by: user };
}

export function confirmedPair(overrides: {
  readonly expense_event_id?: ReturnType<typeof financialEventId>;
  readonly payment_event_id?: ReturnType<typeof financialEventId>;
  readonly economic_group_id?: ReturnType<typeof economicGroupId>;
  readonly relationship_id?: ReturnType<typeof eventRelationshipId>;
  readonly amount?: string;
  readonly source_suffix?: string;
} = {}): PaidExpensePair {
  const amount = money(overrides.amount ?? "3500.00", "THB");
  const expenseCandidate = createFinancialEvent({
    ...expenseEvent(),
    event_id: overrides.expense_event_id ?? ids.expenseEvent,
    economic_group_id: overrides.economic_group_id ?? ids.economicGroup,
    event_version: 2,
    status: "CONFIRMED",
    amount,
    source_refs: [{ ...expenseEvent().source_refs[0]!, source_record_id: `receipt-${overrides.source_suffix ?? "1"}` }],
    approval: confirmedApproval(),
  });
  const paymentCandidate = createFinancialEvent({
    ...paymentEvent(),
    event_id: overrides.payment_event_id ?? ids.paymentEvent,
    economic_group_id: overrides.economic_group_id ?? ids.economicGroup,
    event_version: 2,
    status: "CONFIRMED",
    amount,
    source_refs: [{ ...paymentEvent().source_refs[0]!, source_record_id: `bank-${overrides.source_suffix ?? "1"}` }],
    approval: confirmedApproval(),
  });
  const expense = createFinancialEvent({ ...expenseCandidate, event_fingerprint: eventFingerprint(financialEventFingerprint(expenseCandidate).value) });
  const payment = createFinancialEvent({ ...paymentCandidate, event_fingerprint: eventFingerprint(financialEventFingerprint(paymentCandidate).value) });
  const relationship = createEventRelationship(fulfillsRelationship({
    relationship_id: overrides.relationship_id ?? ids.relationship,
    from_event_id: payment.event_id,
    to_event_id: expense.event_id,
  }));
  return Object.freeze({ expense, payment, fulfills_relationship: relationship });
}

export const expenseAccount: Account = createAccount({
  account_id: m2Ids.expenseAccount,
  organization_id: ids.organization,
  code: "6110",
  name: "Mapped marketing expense",
  account_type: "EXPENSE",
  normal_balance: "DEBIT",
  parent_account_id: null,
  posting_mode: "POSTABLE",
  control: "CUSTOM",
  status: "ACTIVE",
  reporting_tag: "EXPENSE.OPERATING.MARKETING",
  system_key: null,
  coa_version_id: uuid("22c58877-f02d-4f6d-b38e-aa2191053c27") as Account["coa_version_id"],
  created_at: ids.timestamp,
  created_by: user,
});

export const cashAccount: Account = createAccount({
  account_id: m2Ids.cashAccount,
  organization_id: ids.organization,
  code: "1121",
  name: "Mapped operating bank",
  account_type: "ASSET",
  normal_balance: "DEBIT",
  parent_account_id: null,
  posting_mode: "POSTABLE",
  control: "CUSTOM",
  status: "ACTIVE",
  reporting_tag: "ASSET.CASH.BANK",
  system_key: null,
  coa_version_id: uuid("23c58877-f02d-4f6d-b38e-aa2191053c27") as Account["coa_version_id"],
  created_at: ids.timestamp,
  created_by: user,
});

export const categoryMapping: CategoryAccountMapping = Object.freeze({
  mapping_id: m2Ids.categoryMapping,
  mapping_version: "category-map/1",
  organization_id: ids.organization,
  expense_category: "MARKETING",
  effective_from: isoDate("2026-01-01"),
  effective_to: null,
  account: expenseAccount,
  eligibility_at_effective_date: "ELIGIBLE",
  account_eligibility_evidence_ref: "eligibility:expense:2026-09-10",
  coa_version_ref: "coa:fixture:1",
});

export const paymentMapping: PaymentSourceAccountMapping = Object.freeze({
  mapping_id: m2Ids.paymentMapping,
  mapping_version: "payment-map/1",
  organization_id: ids.organization,
  payment_source_id: ids.paymentSource,
  payment_source_type: "BANK_ACCOUNT",
  effective_from: isoDate("2026-01-01"),
  effective_to: null,
  account: cashAccount,
  eligibility_at_effective_date: "ELIGIBLE",
  account_eligibility_evidence_ref: "eligibility:cash:2026-09-10",
  coa_version_ref: "coa:fixture:1",
});

export function authorization(
  operation: AuthorizationDecision["requested_operation"] = "POST_PAID_EXPENSE",
  actor: ActorRef = user,
  originator: ActorRef = user,
  pair: PaidExpensePair = confirmedPair(),
): AuthorizationDecision {
  return decidePaidExpenseAuthorization({
    organization_id: ids.organization,
    source_request_id: requestId("24c58877-f02d-4f6d-b38e-aa2191053c27"),
    actor,
    originator,
    requested_operation: operation,
    affected_event_refs: [
      { event_id: pair.expense.event_id, event_version: pair.expense.event_version, event_type: "ExpenseRecognized" },
      { event_id: pair.payment.event_id, event_version: pair.payment.event_version, event_type: "PaymentMade" },
    ],
    evaluated_at: ids.timestamp,
    authorization_decision_id: m2Ids.authorization,
    candidate_actor_ids_ref: "candidate-set:fixture",
    independent_eligible_actor_ids_ref: "eligible-set:fixture",
  }, grants);
}

export function periodAuthorization(pair: PaidExpensePair, value: AccountingPeriod = period(), requested_operation: PeriodAuthorizationDecision["requested_operation"] = "ORIGINAL_POST"): PeriodAuthorizationDecision {
  return authorizePaidExpensePeriod({
    organization_id: ids.organization,
    requester: user,
    source_request_id: requestId("25c58877-f02d-4f6d-b38e-aa2191053c27"),
    requested_operation,
    economic_group_id: pair.expense.economic_group_id,
    event_refs: [{ event_id: pair.expense.event_id, event_version: pair.expense.event_version, event_type: "ExpenseRecognized" }, { event_id: pair.payment.event_id, event_version: pair.payment.event_version, event_type: "PaymentMade" }],
    proposed_accounting_date: pair.expense.effective_date,
    proposed_posting_date: pair.expense.effective_date,
    accounting_profile: accountingProfile,
    accounting_profile_snapshot_ref: "accounting-profile:fixture:1",
    accounting_period: value,
    decided_at: ids.timestamp,
  });
}

export function taxDecision(pair: PaidExpensePair, outcome: TaxImpactEligibilityDecision["outcome"] = "NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED", decisionId = m2Ids.taxDecision): TaxImpactEligibilityDecision {
  const draft: TaxImpactEligibilityDecision = {
    contract_version: "wendy.paid-expense.tax-impact-eligibility/1.0.0",
    tax_impact_eligibility_decision_id: decisionId,
    decision_version: 1,
    policy_version: "WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.1",
    organization_id: ids.organization,
    economic_group_id: pair.expense.economic_group_id,
    financial_event_refs: [
      { event_id: pair.expense.event_id, event_version: pair.expense.event_version, event_type: "ExpenseRecognized" },
      { event_id: pair.payment.event_id, event_version: pair.payment.event_version, event_type: "PaymentMade" },
    ],
    fulfills_relationship_id: pair.fulfills_relationship.relationship_id,
    accounting_rule: { rule_id: "PAID_EXPENSE", immutable_rule_version: "v1" },
    outcome,
    accounting_reviewer: { actor: reviewerActor, reviewer_authorization_evidence_ref: "authorization:tax-reviewer", accounting_reviewer_capability_ref: "capability:tax-review" },
    decision_basis: { reason_code: "ACCOUNTING_REVIEWED", rationale: "Fixture Accounting decision", evidence_reference: "evidence:tax-eligibility", evidence_refs: [{ evidence_id: ids.evidence, evidence_type: "DOCUMENT", content_hash: HASH_C }] },
    decided_at: ids.timestamp,
    decision_provenance_hash: HASH_C,
    supersedes_tax_impact_eligibility_decision_id: null,
  };
  return Object.freeze({ ...draft, decision_provenance_hash: taxImpactEligibilityDecisionHash(draft) });
}

export function postingCommand(overrides: Partial<OriginalPostingCommand> = {}): OriginalPostingCommand {
  const pair = overrides.pair ?? confirmedPair();
  const selectedPeriod = overrides.accounting_period ?? period();
  return Object.freeze({
    operation: "POST_PAID_EXPENSE",
    organization_id: ids.organization,
    request_id: requestId("26c58877-f02d-4f6d-b38e-aa2191053c27"),
    trace_id: traceId("27c58877-f02d-4f6d-b38e-aa2191053c27"),
    idempotency_key: idempotencyKey("m2-post-001"),
    requester: user,
    pair,
    accounting_profile: accountingProfile,
    accounting_period: selectedPeriod,
    period_authorization: periodAuthorization(pair, selectedPeriod),
    authorization_decision_id: m2Ids.authorization,
    tax_impact_eligibility_decision_id: m2Ids.taxDecision,
    category_mappings: [categoryMapping],
    payment_source_mappings: [paymentMapping],
    validation_result_ref: m2Ids.validation,
    confirmation_audit_ref: "confirmation:fixture:1",
    requested_at: ids.timestamp,
    ...overrides,
  });
}

/** Server-only fixture authority setup. Commands contain only the opaque IDs. */
export function registerTrustedOriginal(authority: InMemoryTrustedDecisionAuthority, command: OriginalPostingCommand, taxOverride?: TaxImpactEligibilityDecision): void {
  if (authority.loadAuthorization(command.authorization_decision_id) === undefined) {
    const decision = decidePaidExpenseAuthorization({
      organization_id: command.organization_id,
      source_request_id: command.request_id,
      actor: user,
      originator: command.requester,
      requested_operation: "POST_PAID_EXPENSE",
      affected_event_refs: [
        { event_id: command.pair.expense.event_id, event_version: command.pair.expense.event_version, event_type: "ExpenseRecognized" },
        { event_id: command.pair.payment.event_id, event_version: command.pair.payment.event_version, event_type: "PaymentMade" },
      ],
      evaluated_at: command.requested_at,
      authorization_decision_id: command.authorization_decision_id,
      candidate_actor_ids_ref: "candidate-set:fixture",
      independent_eligible_actor_ids_ref: "eligible-set:fixture",
    }, grants);
    const unsigned = {
      record_contract_version: "wendy.paid-expense.trusted-authorization/1.0.0" as const,
      authorization: decision,
      affected_effect: { economic_group_id: command.pair.expense.economic_group_id, fulfills_relationship_id: command.pair.fulfills_relationship.relationship_id, event_refs: [
        { event_id: command.pair.expense.event_id, event_version: command.pair.expense.event_version, event_type: "ExpenseRecognized" as const },
        { event_id: command.pair.payment.event_id, event_version: command.pair.payment.event_version, event_type: "PaymentMade" as const },
      ] as const, source_request_id: command.request_id, required_approval_level: command.pair.expense.approval.required_level },
      originator: command.requester,
      deciding_authority: { actor: user, capability_evidence_ref: "membership:user", authority_provenance_ref: "authority:fixture:authorization" },
      immutable_evidence_provenance_ref: "evidence:fixture:authorization",
      recorded_at: command.requested_at,
      supersedes_authorization_decision_id: null,
    };
    authority.registerAuthorization(Object.freeze({ ...unsigned, integrity_provenance_hash: trustedAuthorizationRecordHash(unsigned) }) as TrustedAuthorizationDecisionRecord);
  }
  if (authority.loadTaxImpactEligibility(command.tax_impact_eligibility_decision_id) === undefined) {
    const decision = taxOverride ?? taxDecision(command.pair, "NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED", command.tax_impact_eligibility_decision_id);
    const unsigned = {
      record_contract_version: "wendy.paid-expense.trusted-tax-impact-eligibility/1.0.0" as const,
      decision,
      reviewer_authority: { actor: reviewerActor, capability_evidence_ref: "membership:tax-reviewer", authority_provenance_ref: "authority:fixture:tax" },
      immutable_evidence_provenance_ref: "evidence:fixture:tax",
      recorded_at: command.requested_at,
    };
    authority.registerTaxImpactEligibility(Object.freeze({ ...unsigned, integrity_provenance_hash: trustedTaxImpactEligibilityRecordHash(unsigned) }) as TrustedTaxImpactEligibilityDecisionRecord);
  }
}

export function registerTrustedCorrection(authority: InMemoryTrustedDecisionAuthority, command: CorrectionPostingCommand, original: PostedJournal): void {
  registerTrustedOriginal(authority, command.replacement);
  if (authority.loadAuthorization(command.authorization_decision_id) !== undefined) return;
  const decision = decidePaidExpenseAuthorization({
    organization_id: command.organization_id,
    source_request_id: command.request_id,
    actor: accountantActor,
    originator: command.requester,
    requested_operation: "PAID_EXPENSE_CORRECTION",
    affected_event_refs: original.immutable_draft.event_refs,
    evaluated_at: command.requested_at,
    authorization_decision_id: command.authorization_decision_id,
    candidate_actor_ids_ref: "candidate-set:accountant",
    independent_eligible_actor_ids_ref: "eligible-set:accountant",
  }, grants);
  const unsigned = {
    record_contract_version: "wendy.paid-expense.trusted-authorization/1.0.0" as const,
    authorization: decision,
    affected_effect: { economic_group_id: original.immutable_draft.economic_group_id, fulfills_relationship_id: original.immutable_draft.fulfills_relationship_ref, event_refs: original.immutable_draft.event_refs, source_request_id: command.request_id, required_approval_level: "USER_CONFIRM" as const },
    originator: command.requester,
    deciding_authority: { actor: accountantActor, capability_evidence_ref: "membership:accountant", authority_provenance_ref: "authority:fixture:correction" },
    immutable_evidence_provenance_ref: "evidence:fixture:correction",
    recorded_at: command.requested_at,
    supersedes_authorization_decision_id: null,
  };
  authority.registerAuthorization(Object.freeze({ ...unsigned, integrity_provenance_hash: trustedAuthorizationRecordHash(unsigned) }) as TrustedAuthorizationDecisionRecord);
}

export function replacementPair(): PaidExpensePair {
  return confirmedPair({
    expense_event_id: financialEventId("28c58877-f02d-4f6d-b38e-aa2191053c27"),
    payment_event_id: financialEventId("29c58877-f02d-4f6d-b38e-aa2191053c27"),
    economic_group_id: economicGroupId("30c58877-f02d-4f6d-b38e-aa2191053c27"),
    relationship_id: eventRelationshipId("31c58877-f02d-4f6d-b38e-aa2191053c27"),
    source_suffix: "replacement-1",
  });
}

export const otherEventFingerprint = eventFingerprint("d".repeat(64));
