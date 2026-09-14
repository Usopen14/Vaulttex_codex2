import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  InMemorySerializableLedgerStore,
  InMemoryTrustedDecisionAuthority,
  LedgerPostingService,
  M2ContractError,
  SqliteLedgerStore,
  SqliteTrustedDecisionAuthority,
  assertJournalDraftBalanced,
  decidePaidExpenseAuthorization,
  resolvePaymentSourceAccount,
  taxImpactEligibilityDecisionHash,
  trustedAuthorizationRecordHash,
  trustedTaxImpactEligibilityRecordHash,
  type OriginalPostingCommand,
  type CorrectionPostingCommand,
  type TrustedAuthorizationDecisionRecord,
  type TrustedTaxImpactEligibilityDecisionRecord,
} from "../src/m2/index.ts";
import {
  accountantActor,
  categoryMapping,
  confirmedPair,
  grants,
  m2Ids,
  paymentMapping,
  period,
  periodAuthorization,
  postingCommand,
  registerTrustedCorrection,
  registerTrustedOriginal,
  replacementPair,
  serviceActor,
  taxDecision,
} from "./m2-fixtures.ts";
import { ids, user } from "./m1-fixtures.ts";
import { createEventRelationship, economicGroupId, eventRelationshipId, financialEventId, idempotencyKey, money, requestId, traceId, uuid } from "../src/index.ts";

function memoryRuntime() {
  const store = new InMemorySerializableLedgerStore([period()]);
  const authority = new InMemoryTrustedDecisionAuthority(grants);
  const ledger = new LedgerPostingService(store, serviceActor, grants, authority);
  return { store, authority, ledger };
}

function generatedUuid(discriminator: string, number: number) {
  return uuid(`${discriminator}0c58877-f02d-4f6d-b38e-aa2191054${String(number).padStart(3, "0")}`);
}

function postWithTrustedOriginal(runtime: ReturnType<typeof memoryRuntime>, command: OriginalPostingCommand, taxOverride?: ReturnType<typeof taxDecision>) {
  registerTrustedOriginal(runtime.authority, command, taxOverride);
  return runtime.ledger.post(command);
}

function directTrustedAuthorizationRecord(command: OriginalPostingCommand, overrides: Partial<TrustedAuthorizationDecisionRecord> = {}): TrustedAuthorizationDecisionRecord {
  const unsigned = {
    record_contract_version: "wendy.paid-expense.trusted-authorization/1.0.0" as const,
    authorization: {
      contract_version: "wendy.paid-expense.authorization-decision/1.0.0" as const,
      authorization_decision_id: command.authorization_decision_id,
      organization_id: command.organization_id,
      requested_operation: "POST_PAID_EXPENSE" as const,
      decision: "ALLOWED" as const,
      reason_codes: ["SERVER_CAPABILITY_VERIFIED"],
      required_next_action: null,
      evaluated_at: command.requested_at,
      policy_version_refs: ["WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-01"],
      authorization_evidence_ref: "membership:user",
      independent_approver_resolution: { originator_actor_id: command.requester.actor_id, candidate_actor_ids_ref: "candidate", independent_eligible_actor_ids_ref: "eligible", actor_identity_comparison: "SAME" as const, resolution_at: command.requested_at },
      approval_control_audit: { control_mechanism: "NOT_APPLICABLE" as const, self_approved: false, owner_override_reason: null, source_request_id: command.request_id, affected_event_refs: [
        { event_id: command.pair.expense.event_id, event_version: command.pair.expense.event_version, event_type: "ExpenseRecognized" as const },
        { event_id: command.pair.payment.event_id, event_version: command.pair.payment.event_version, event_type: "PaymentMade" as const },
      ], policy_version_ref: "WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md" },
    },
    affected_effect: { economic_group_id: command.pair.expense.economic_group_id, fulfills_relationship_id: command.pair.fulfills_relationship.relationship_id, event_refs: [
      { event_id: command.pair.expense.event_id, event_version: command.pair.expense.event_version, event_type: "ExpenseRecognized" as const },
      { event_id: command.pair.payment.event_id, event_version: command.pair.payment.event_version, event_type: "PaymentMade" as const },
    ] as const, source_request_id: command.request_id, required_approval_level: "USER_CONFIRM" as const },
    originator: command.requester,
    deciding_authority: { actor: user, capability_evidence_ref: "membership:user", authority_provenance_ref: "authority:test" },
    immutable_evidence_provenance_ref: "evidence:test:authorization",
    recorded_at: command.requested_at,
    supersedes_authorization_decision_id: null,
    ...overrides,
  };
  return Object.freeze({ ...unsigned, integrity_provenance_hash: trustedAuthorizationRecordHash(unsigned) }) as TrustedAuthorizationDecisionRecord;
}

function directTrustedTaxRecord(command: OriginalPostingCommand, outcome: ReturnType<typeof taxDecision>["outcome"]): TrustedTaxImpactEligibilityDecisionRecord {
  const decision = taxDecision(command.pair, outcome, command.tax_impact_eligibility_decision_id);
  const unsigned = {
    record_contract_version: "wendy.paid-expense.trusted-tax-impact-eligibility/1.0.0" as const,
    decision,
    reviewer_authority: { actor: grants[2] === undefined ? accountantActor : { actor_type: "USER" as const, actor_id: grants[2].actor_id, display_name: "Accounting reviewer" }, capability_evidence_ref: "membership:tax-reviewer", authority_provenance_ref: "authority:test:tax" },
    immutable_evidence_provenance_ref: "evidence:test:tax",
    recorded_at: command.requested_at,
  };
  return Object.freeze({ ...unsigned, integrity_provenance_hash: trustedTaxImpactEligibilityRecordHash(unsigned) }) as TrustedTaxImpactEligibilityDecisionRecord;
}

test("AUTH-01/AUTH-02/AUTH-05/TAX-03: Ledger consumes opaque trusted references only and forged decision inputs fail closed", async () => {
  const runtime = memoryRuntime();
  const command = postingCommand({ authorization_decision_id: uuid("61c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("62c58877-f02d-4f6d-b38e-aa2191053c27") });
  const missing = await runtime.ledger.post(command);
  assert.equal(missing.outcome, "REJECTED");
  assert.equal(runtime.store.snapshot().journals.length, 0);

  registerTrustedOriginal(runtime.authority, command);
  const payloadSubstitution = await runtime.ledger.post({ ...command, idempotency_key: idempotencyKey("m2-forged-payload"), authorization: directTrustedAuthorizationRecord(command) } as unknown as OriginalPostingCommand);
  assert.equal(payloadSubstitution.outcome, "REJECTED");
  const posted = await runtime.ledger.post({ ...command, idempotency_key: idempotencyKey("m2-trusted-post") });
  assert.equal(posted.outcome, "POSTED");
  assert.equal(runtime.store.snapshot().consumed_decisions.length, 1);

  const mismatchRuntime = memoryRuntime();
  const valid = postingCommand({ authorization_decision_id: uuid("63c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("64c58877-f02d-4f6d-b38e-aa2191053c27") });
  registerTrustedOriginal(mismatchRuntime.authority, valid);
  const changedPair = confirmedPair({ economic_group_id: economicGroupId("60c58877-f02d-4f6d-b38e-aa2191053c27") });
  const mismatched = await mismatchRuntime.ledger.post({ ...valid, pair: changedPair, idempotency_key: idempotencyKey("m2-forged-binding") });
  assert.equal(mismatched.outcome, "REJECTED");
  assert.equal(mismatchRuntime.store.snapshot().journals.length, 0);

  const invalidAuthority = directTrustedAuthorizationRecord(valid, { deciding_authority: { actor: user, capability_evidence_ref: "forged-capability-reference", authority_provenance_ref: "forged" } });
  assert.throws(() => mismatchRuntime.authority.registerAuthorization(invalidAuthority), /capability/i);
  const forgedReviewer = directTrustedTaxRecord(valid, "NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED");
  const unauthorizedReviewer = { ...forgedReviewer, reviewer_authority: { ...forgedReviewer.reviewer_authority, actor: user }, integrity_provenance_hash: "0".repeat(64) as typeof forgedReviewer.integrity_provenance_hash };
  assert.throws(() => mismatchRuntime.authority.registerTaxImpactEligibility(unauthorizedReviewer), /trusted T-01/i);
});

test("AUTH/TAX trusted-record binding rejects wrong operation/version/group/rule, supersession, and altered provenance", async () => {
  const runtime = memoryRuntime();
  const command = postingCommand({ authorization_decision_id: uuid("65c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("66c58877-f02d-4f6d-b38e-aa2191053c27") });
  const wrongOperation = directTrustedAuthorizationRecord(command, { authorization: { ...directTrustedAuthorizationRecord(command).authorization, requested_operation: "VALIDATE_PAID_EXPENSE" } });
  runtime.authority.registerAuthorization(wrongOperation);
  runtime.authority.registerTaxImpactEligibility(directTrustedTaxRecord(command, "NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED"));
  assert.equal((await runtime.ledger.post(command)).outcome, "REJECTED");

  const taxRuntime = memoryRuntime();
  const taxCommand = postingCommand({ authorization_decision_id: uuid("67c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("68c58877-f02d-4f6d-b38e-aa2191053c27") });
  const wrongRuleDecision = { ...taxDecision(taxCommand.pair, "NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED", taxCommand.tax_impact_eligibility_decision_id), accounting_rule: { rule_id: "PAID_EXPENSE" as const, immutable_rule_version: "v0" as never } };
  const correctedHash = taxImpactEligibilityDecisionHash(wrongRuleDecision);
  registerTrustedOriginal(taxRuntime.authority, taxCommand, { ...wrongRuleDecision, decision_provenance_hash: correctedHash });
  assert.equal((await taxRuntime.ledger.post(taxCommand)).outcome, "REVIEW_REQUIRED");

  const staleRuntime = memoryRuntime();
  const stale = postingCommand({ authorization_decision_id: uuid("69c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("70c58877-f02d-4f6d-b38e-aa2191053c27") });
  registerTrustedOriginal(staleRuntime.authority, stale);
  const old = staleRuntime.authority.loadTaxImpactEligibility(stale.tax_impact_eligibility_decision_id)!.record;
  const replacementDecision = { ...old.decision, tax_impact_eligibility_decision_id: uuid("71c58877-f02d-4f6d-b38e-aa2191053c27"), supersedes_tax_impact_eligibility_decision_id: old.decision.tax_impact_eligibility_decision_id };
  const replacementWithHash = { ...replacementDecision, decision_provenance_hash: taxImpactEligibilityDecisionHash(replacementDecision) };
  const unsignedReplacement = { ...old, decision: replacementWithHash, recorded_at: old.recorded_at };
  staleRuntime.authority.registerTaxImpactEligibility({ ...unsignedReplacement, integrity_provenance_hash: trustedTaxImpactEligibilityRecordHash(unsignedReplacement) });
  assert.equal((await staleRuntime.ledger.post(stale)).outcome, "REVIEW_REQUIRED");
  assert.equal(staleRuntime.store.snapshot().journals.length, 0);
});

test("BAL-02, MAP-04, ORG-01, EVT-02: malformed journal shapes, non-authoritative display fields, cross-org disclosure, and excluded facts fail closed", async () => {
  const line = { line_id: m2Ids.categoryMapping, line_number: 1, account_id: categoryMapping.account.account_id, debit: money("1.00", "THB"), credit: null, line_provenance_ref: "test" };
  assert.throws(() => assertJournalDraftBalanced([{ ...line, debit: null }, { ...line, line_number: 2, account_id: paymentMapping.account.account_id, debit: null, credit: money("1.00", "THB") }]));
  assert.throws(() => assertJournalDraftBalanced([{ ...line, debit: { value: "0.00", currency: "THB" } as typeof line.debit }, { ...line, line_number: 2, account_id: paymentMapping.account.account_id, debit: null, credit: money("1.00", "THB") }]));
  assert.throws(() => assertJournalDraftBalanced([{ ...line, credit: money("1.00", "THB") }, { ...line, line_number: 2, account_id: paymentMapping.account.account_id, debit: null, credit: money("1.00", "THB") }]));
  assert.throws(() => assertJournalDraftBalanced([line, { ...line, line_number: 2, account_id: paymentMapping.account.account_id, debit: null, credit: money("2.00", "THB") }]));

  for (const mutableOnly of [
    { ...paymentMapping, payment_source_id: "not-authoritative", display_label: "Mapped operating bank" },
    { ...paymentMapping, payment_source_id: "not-authoritative", bank_name: "Fixture Bank" },
    { ...paymentMapping, payment_source_id: "not-authoritative", connector_metadata: { current_label: "fixture" } },
  ]) {
    assert.equal(resolvePaymentSourceAccount({ organization_id: ids.organization, payment_source_id: ids.paymentSource, payment_source_type: "BANK_ACCOUNT", effective_accounting_date: confirmedPair().expense.effective_date, mappings: [mutableOnly as typeof paymentMapping] }).resolution, "ZERO_ELIGIBLE");
  }
  const runtime = memoryRuntime();
  const command = postingCommand({ authorization_decision_id: uuid("72c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("73c58877-f02d-4f6d-b38e-aa2191053c27") });
  registerTrustedOriginal(runtime.authority, command);
  const crossOrg = await runtime.ledger.post({ ...command, pair: { ...command.pair, payment: { ...command.pair.payment, organization_id: ids.otherOrganization } }, idempotency_key: idempotencyKey("m2-cross-org-disclosure") });
  assert.equal(crossOrg.outcome, "REJECTED");
  assert.equal(crossOrg.journal_entry_id, null);
  assert.equal(crossOrg.existing_result_ref, null);
  const unsupported = { ...command, pair: { ...command.pair, expense: { ...command.pair.expense, payload: { ...command.pair.expense.payload, recognition_basis: "ACCRUAL_ONLY" as never } } } };
  assert.equal((await runtime.ledger.post(unsupported)).outcome, "REJECTED");
});

test("TAX-01: each non-eligible authoritative T-01 outcome routes review without a simple Journal", async () => {
  for (const outcome of ["SEPARATE_ACCOUNTING_IMPACT_REQUIRED", "UNRESOLVED"] as const) {
    const runtime = memoryRuntime();
    const command = postingCommand({ authorization_decision_id: uuid(outcome === "UNRESOLVED" ? "74c58877-f02d-4f6d-b38e-aa2191053c27" : "75c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid(outcome === "UNRESOLVED" ? "76c58877-f02d-4f6d-b38e-aa2191053c27" : "77c58877-f02d-4f6d-b38e-aa2191053c27") });
    await postWithTrustedOriginal(runtime, command, taxDecision(command.pair, outcome, command.tax_impact_eligibility_decision_id));
    const result = await runtime.ledger.post({ ...command, idempotency_key: idempotencyKey(`m2-tax-${outcome}`) });
    assert.equal(result.outcome, "REVIEW_REQUIRED");
    assert.equal(runtime.store.snapshot().journals.length, 0);
  }
});

test("EVT-02 and PER-03: excluded AP/accrual/prepayment/refund/split/FX claims and LOCKED periods cannot coerce a post", async () => {
  for (const excludedFamily of ["AP_SETTLEMENT", "ACCRUAL_ONLY", "PREPAID_EXPENSE", "REFUND", "SPLIT_PAYMENT", "FOREIGN_CURRENCY"] as const) {
    const runtime = memoryRuntime();
    const command = postingCommand({ authorization_decision_id: uuid(excludedFamily === "AP_SETTLEMENT" ? "98c58877-f02d-4f6d-b38e-aa2191053c27" : excludedFamily === "ACCRUAL_ONLY" ? "a0c58877-f02d-4f6d-b38e-aa2191053c27" : excludedFamily === "PREPAID_EXPENSE" ? "a1c58877-f02d-4f6d-b38e-aa2191053c27" : excludedFamily === "REFUND" ? "a2c58877-f02d-4f6d-b38e-aa2191053c27" : excludedFamily === "SPLIT_PAYMENT" ? "a3c58877-f02d-4f6d-b38e-aa2191053c27" : "a4c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid(excludedFamily === "AP_SETTLEMENT" ? "a5c58877-f02d-4f6d-b38e-aa2191053c27" : excludedFamily === "ACCRUAL_ONLY" ? "a6c58877-f02d-4f6d-b38e-aa2191053c27" : excludedFamily === "PREPAID_EXPENSE" ? "a7c58877-f02d-4f6d-b38e-aa2191053c27" : excludedFamily === "REFUND" ? "a8c58877-f02d-4f6d-b38e-aa2191053c27" : excludedFamily === "SPLIT_PAYMENT" ? "a9c58877-f02d-4f6d-b38e-aa2191053c27" : "aac58877-f02d-4f6d-b38e-aa2191053c27") });
    registerTrustedOriginal(runtime.authority, command);
    const unsupported = {
      ...command,
      idempotency_key: idempotencyKey(`m2-excluded-${excludedFamily.toLowerCase()}`),
      pair: { ...command.pair, expense: { ...command.pair.expense, payload: { ...command.pair.expense.payload, recognition_basis: excludedFamily as never } } },
    };
    assert.equal((await runtime.ledger.post(unsupported)).outcome, "REJECTED");
    assert.equal(runtime.store.snapshot().journals.length, 0);
  }
  const lockedStore = new InMemorySerializableLedgerStore([period("LOCKED")]);
  const lockedAuthority = new InMemoryTrustedDecisionAuthority(grants);
  const lockedLedger = new LedgerPostingService(lockedStore, serviceActor, grants, lockedAuthority);
  const lockedCommand = postingCommand({ authorization_decision_id: uuid("abc58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("acc58877-f02d-4f6d-b38e-aa2191053c27"), accounting_period: period("LOCKED"), period_authorization: periodAuthorization(confirmedPair(), period("LOCKED")) });
  registerTrustedOriginal(lockedAuthority, lockedCommand);
  assert.equal((await lockedLedger.post(lockedCommand)).outcome, "PERIOD_DENIED");
  assert.equal(lockedStore.snapshot().journals.length, 0);
});

test("CON-03 and RETRY-01: a correction sees an uncommitted original as IN_PROGRESS, while terminal no-effect outcomes do not post on retry", async () => {
  const runtime = memoryRuntime();
  const rejected = postingCommand({ authorization_decision_id: uuid("adc58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("aec58877-f02d-4f6d-b38e-aa2191053c27"), category_mappings: [] });
  registerTrustedOriginal(runtime.authority, rejected);
  assert.equal((await runtime.ledger.post(rejected)).outcome, "REVIEW_REQUIRED");
  assert.equal((await runtime.ledger.post({ ...rejected, category_mappings: [categoryMapping] })).outcome, "REVIEW_REQUIRED");
  assert.equal(runtime.store.snapshot().journals.length, 0);
  const missingCorrection: CorrectionPostingCommand = {
    operation: "POST_PAID_EXPENSE_CORRECTION", organization_id: ids.organization, request_id: requestId("afc58877-f02d-4f6d-b38e-aa2191053c27"), trace_id: traceId("b0c58877-f02d-4f6d-b38e-aa2191053c27"), idempotency_key: idempotencyKey("m2-correction-in-progress"), requester: user,
    original_journal_entry_id: uuid("b1c58877-f02d-4f6d-b38e-aa2191053c27"), reason: "Pending original", source_evidence_refs: confirmedPair().expense.evidence_refs, authorization_decision_id: uuid("b2c58877-f02d-4f6d-b38e-aa2191053c27"), reversal_accounting_period: period(), reversal_period_authorization: periodAuthorization(confirmedPair(), period(), "REVERSAL"), replacement: postingCommand({ authorization_decision_id: uuid("b3c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("b4c58877-f02d-4f6d-b38e-aa2191053c27"), period_authorization: periodAuthorization(confirmedPair(), period(), "CORRECTED_REPLACEMENT") }), correction_relationships: [createEventRelationship({ relationship_id: eventRelationshipId("b5c58877-f02d-4f6d-b38e-aa2191053c27"), organization_id: ids.organization, from_event_id: confirmedPair().expense.event_id, relationship_type: "SUPERSEDES", to_event_id: confirmedPair().payment.event_id, created_at: ids.timestamp, created_by: user })], requested_at: ids.timestamp,
  };
  registerTrustedOriginal(runtime.authority, missingCorrection.replacement);
  const correctionDecision = decidePaidExpenseAuthorization({
    organization_id: missingCorrection.organization_id, source_request_id: missingCorrection.request_id, actor: accountantActor, originator: missingCorrection.requester,
    requested_operation: "PAID_EXPENSE_CORRECTION", affected_event_refs: missingCorrection.replacement.pair.fulfills_relationship === undefined ? [] : [
      { event_id: missingCorrection.replacement.pair.expense.event_id, event_version: missingCorrection.replacement.pair.expense.event_version, event_type: "ExpenseRecognized" as const },
      { event_id: missingCorrection.replacement.pair.payment.event_id, event_version: missingCorrection.replacement.pair.payment.event_version, event_type: "PaymentMade" as const },
    ], evaluated_at: missingCorrection.requested_at, authorization_decision_id: missingCorrection.authorization_decision_id, candidate_actor_ids_ref: "candidate", independent_eligible_actor_ids_ref: "eligible",
  }, grants);
  const unsignedCorrection = {
    record_contract_version: "wendy.paid-expense.trusted-authorization/1.0.0" as const, authorization: correctionDecision,
    affected_effect: { economic_group_id: missingCorrection.replacement.pair.expense.economic_group_id, fulfills_relationship_id: missingCorrection.replacement.pair.fulfills_relationship.relationship_id, event_refs: [
      { event_id: missingCorrection.replacement.pair.expense.event_id, event_version: missingCorrection.replacement.pair.expense.event_version, event_type: "ExpenseRecognized" as const },
      { event_id: missingCorrection.replacement.pair.payment.event_id, event_version: missingCorrection.replacement.pair.payment.event_version, event_type: "PaymentMade" as const },
    ] as const, source_request_id: missingCorrection.request_id, required_approval_level: "USER_CONFIRM" as const }, originator: missingCorrection.requester,
    deciding_authority: { actor: accountantActor, capability_evidence_ref: "membership:accountant", authority_provenance_ref: "authority:test:missing-original" }, immutable_evidence_provenance_ref: "evidence:test:missing-original", recorded_at: missingCorrection.requested_at, supersedes_authorization_decision_id: null,
  };
  runtime.authority.registerAuthorization({ ...unsignedCorrection, integrity_provenance_hash: trustedAuthorizationRecordHash(unsignedCorrection) });
  assert.equal((await runtime.ledger.postCorrection(missingCorrection)).outcome, "IN_PROGRESS");
  assert.equal(runtime.store.snapshot().journals.length, 0);
});

test("PER-03: an otherwise authorized correction cannot post reversal or replacement into a LOCKED period", async () => {
  const runtime = memoryRuntime();
  const originalCommand = postingCommand({ authorization_decision_id: uuid("bdc58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("bec58877-f02d-4f6d-b38e-aa2191053c27") });
  registerTrustedOriginal(runtime.authority, originalCommand);
  const originalResult = await runtime.ledger.post(originalCommand);
  assert.equal(originalResult.outcome, "POSTED");
  const locked = period("LOCKED", 2);
  await runtime.store.replacePeriod(locked);
  const replacement = replacementPair();
  const replacementCommand = postingCommand({ pair: replacement, idempotency_key: idempotencyKey("m2-locked-replacement"), authorization_decision_id: uuid("bfc58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("c1c58877-f02d-4f6d-b38e-aa2191053c27"), accounting_period: locked, period_authorization: periodAuthorization(replacement, locked, "CORRECTED_REPLACEMENT") });
  const correction: CorrectionPostingCommand = {
    operation: "POST_PAID_EXPENSE_CORRECTION", organization_id: ids.organization, request_id: requestId("c2c58877-f02d-4f6d-b38e-aa2191053c27"), trace_id: traceId("c3c58877-f02d-4f6d-b38e-aa2191053c27"), idempotency_key: idempotencyKey("m2-locked-correction"), requester: user,
    original_journal_entry_id: originalResult.journal_entry_id!, reason: "No period override", source_evidence_refs: originalCommand.pair.expense.evidence_refs, authorization_decision_id: uuid("c4c58877-f02d-4f6d-b38e-aa2191053c27"), reversal_accounting_period: locked, reversal_period_authorization: periodAuthorization(originalCommand.pair, locked, "REVERSAL"), replacement: replacementCommand,
    correction_relationships: [createEventRelationship({ relationship_id: eventRelationshipId("c5c58877-f02d-4f6d-b38e-aa2191053c27"), organization_id: ids.organization, from_event_id: replacement.expense.event_id, relationship_type: "SUPERSEDES", to_event_id: originalCommand.pair.expense.event_id, created_at: ids.timestamp, created_by: user })], requested_at: ids.timestamp,
  };
  registerTrustedCorrection(runtime.authority, correction, runtime.store.snapshot().journals[0]!);
  assert.equal((await runtime.ledger.postCorrection(correction)).outcome, "PERIOD_DENIED");
  assert.equal(runtime.store.snapshot().journals.length, 1);
});

function withTempDatabase(work: (filename: string) => Promise<void> | void): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "wendy-m2-revision-"));
  const filename = join(directory, "m2.sqlite");
  return Promise.resolve(work(filename)).finally(() => rmSync(directory, { recursive: true, force: true }));
}

test("TX-01/TX-02/IMM-01: SQLite persists complete consumed-decision manifest and rejects direct mutable history", async () => {
  await withTempDatabase(async (filename) => {
    const store = new SqliteLedgerStore(filename);
    const authority = new InMemoryTrustedDecisionAuthority(grants);
    const ledger = new LedgerPostingService(store, serviceActor, grants, authority);
    const command = postingCommand({ authorization_decision_id: uuid("78c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("79c58877-f02d-4f6d-b38e-aa2191053c27") });
    await store.replacePeriod(period());
    registerTrustedOriginal(authority, command);
    assert.equal((await ledger.post(command)).outcome, "POSTED");
    const manifest = store.snapshot();
    assert.equal(manifest.consumed_decisions.length, 1);
    const provenance = manifest.consumed_decisions[0]!;
    assert.equal(provenance.authorization.authorization_decision_id, command.authorization_decision_id);
    assert.equal(provenance.tax_impact.tax_impact_eligibility_decision_id, command.tax_impact_eligibility_decision_id);
    assert.notEqual(provenance.authorization.integrity_provenance_hash, "");
    assert.notEqual(provenance.tax_impact.integrity_provenance_hash, "");
    const journalId = manifest.journals[0]!.journal_entry_id;
    store.close();
    const direct = new DatabaseSync(filename);
    assert.throws(() => direct.prepare("UPDATE wendy_m2_journal SET record_json = record_json WHERE journal_entry_id = ?").run(journalId), /immutable/);
    assert.throws(() => direct.prepare("DELETE FROM wendy_m2_journal WHERE journal_entry_id = ?").run(journalId), /immutable/);
    assert.throws(() => direct.prepare("UPDATE wendy_m2_consumed_decision_provenance SET record_json = record_json WHERE journal_entry_id = ?").run(journalId), /immutable/);
    assert.throws(() => direct.prepare("DELETE FROM wendy_m2_audit").run(), /immutable/);
    direct.close();
  });
});

test("trusted SQLite decision authority persists immutable, independently reloadable Authorization and T-01 records", async () => {
  await withTempDatabase((filename) => {
    const store = new SqliteLedgerStore(filename);
    const command = postingCommand({ authorization_decision_id: uuid("bbc58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("bcc58877-f02d-4f6d-b38e-aa2191053c27") });
    const authority = new SqliteTrustedDecisionAuthority(filename, grants);
    authority.registerAuthorization(directTrustedAuthorizationRecord(command));
    authority.registerTaxImpactEligibility(directTrustedTaxRecord(command, "NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED"));
    authority.close();
    const reloaded = new SqliteTrustedDecisionAuthority(filename, grants);
    assert.equal(reloaded.loadAuthorization(command.authorization_decision_id)?.status, "ACTIVE");
    assert.equal(reloaded.loadTaxImpactEligibility(command.tax_impact_eligibility_decision_id)?.status, "ACTIVE");
    reloaded.close();
    const direct = new DatabaseSync(filename);
    assert.throws(() => direct.prepare("UPDATE wendy_m2_trusted_authorization SET record_json = record_json WHERE authorization_decision_id = ?").run(command.authorization_decision_id), /immutable/);
    assert.throws(() => direct.prepare("DELETE FROM wendy_m2_trusted_tax_impact WHERE tax_impact_eligibility_decision_id = ?").run(command.tax_impact_eligibility_decision_id), /immutable/);
    direct.close();
    store.close();
  });
});

test("TX-02: SQLite injected failure at every original mandatory write rolls back all effect facts", async () => {
  await withTempDatabase(async (filename) => {
    for (let write = 1; write <= 10; write += 1) {
      const store = new SqliteLedgerStore(filename);
      const authority = new InMemoryTrustedDecisionAuthority(grants);
      const ledger = new LedgerPostingService(store, serviceActor, grants, authority);
      await store.replacePeriod(period());
      const identifiers = [
        ["80c58877-f02d-4f6d-b38e-aa2191053001", "81c58877-f02d-4f6d-b38e-aa2191053001"],
        ["80c58877-f02d-4f6d-b38e-aa2191053002", "81c58877-f02d-4f6d-b38e-aa2191053002"],
        ["80c58877-f02d-4f6d-b38e-aa2191053003", "81c58877-f02d-4f6d-b38e-aa2191053003"],
        ["80c58877-f02d-4f6d-b38e-aa2191053004", "81c58877-f02d-4f6d-b38e-aa2191053004"],
        ["80c58877-f02d-4f6d-b38e-aa2191053005", "81c58877-f02d-4f6d-b38e-aa2191053005"],
        ["80c58877-f02d-4f6d-b38e-aa2191053006", "81c58877-f02d-4f6d-b38e-aa2191053006"],
        ["80c58877-f02d-4f6d-b38e-aa2191053007", "81c58877-f02d-4f6d-b38e-aa2191053007"],
        ["80c58877-f02d-4f6d-b38e-aa2191053008", "81c58877-f02d-4f6d-b38e-aa2191053008"],
        ["80c58877-f02d-4f6d-b38e-aa2191053009", "81c58877-f02d-4f6d-b38e-aa2191053009"],
        ["80c58877-f02d-4f6d-b38e-aa2191053010", "81c58877-f02d-4f6d-b38e-aa2191053010"],
      ][write - 1]!;
      const authorizationId = identifiers[0]!;
      const taxId = identifiers[1]!;
      const command = postingCommand({ idempotency_key: idempotencyKey(`m2-sqlite-failure-${write}`), authorization_decision_id: uuid(authorizationId), tax_impact_eligibility_decision_id: uuid(taxId) });
      registerTrustedOriginal(authority, command);
      store.failAtMandatoryWrite(write);
      await assert.rejects(() => ledger.post(command), (error: unknown) => error instanceof M2ContractError && error.code === "INFRASTRUCTURE_FAILURE");
      assert.equal(store.snapshot().journals.length, 0);
      assert.equal(store.snapshot().consumed_decisions.length, 0);
      store.close();
    }
  });
});

test("TX-02/COR-03: SQLite injected failure at every correction mandatory write rolls back reversal and replacement together", async () => {
  await withTempDatabase(async (filename) => {
    for (let write = 1; write <= 16; write += 1) {
      const store = new SqliteLedgerStore(`${filename}.${write}`);
      const authority = new InMemoryTrustedDecisionAuthority(grants);
      const ledger = new LedgerPostingService(store, serviceActor, grants, authority);
      await store.replacePeriod(period());
      const originalPair = confirmedPair({ expense_event_id: financialEventId(String(generatedUuid("7", write))), payment_event_id: financialEventId(String(generatedUuid("8", write))), economic_group_id: economicGroupId(String(generatedUuid("9", write))), relationship_id: eventRelationshipId(String(generatedUuid("a", write))), source_suffix: `correction-${write}` });
      const originalCommand = postingCommand({ pair: originalPair, idempotency_key: idempotencyKey(`m2-correction-original-${write}`), authorization_decision_id: generatedUuid("c", write), tax_impact_eligibility_decision_id: generatedUuid("d", write) });
      registerTrustedOriginal(authority, originalCommand);
      const originalResult = await ledger.post(originalCommand);
      assert.equal(originalResult.outcome, "POSTED");
      const original = store.snapshot().journals[0]!;
      const replacement = confirmedPair({ expense_event_id: financialEventId(String(generatedUuid("b", write))), payment_event_id: financialEventId(String(generatedUuid("e", write))), economic_group_id: economicGroupId(String(generatedUuid("f", write))), relationship_id: eventRelationshipId(String(generatedUuid("0", write))), source_suffix: `replacement-${write}` });
      const replacementCommand = postingCommand({ pair: replacement, request_id: requestId(`e0c58877-f02d-4f6d-b38e-aa2191054${String(write).padStart(3, "0")}`), trace_id: traceId(`f0c58877-f02d-4f6d-b38e-aa2191054${String(write).padStart(3, "0")}`), idempotency_key: idempotencyKey(`m2-correction-replacement-${write}`), authorization_decision_id: generatedUuid("1", write), tax_impact_eligibility_decision_id: generatedUuid("2", write), period_authorization: periodAuthorization(replacement, period(), "CORRECTED_REPLACEMENT") });
      const correction: CorrectionPostingCommand = {
        operation: "POST_PAID_EXPENSE_CORRECTION", organization_id: ids.organization, request_id: requestId(`30c58877-f02d-4f6d-b38e-aa2191054${String(write).padStart(3, "0")}`), trace_id: traceId(`40c58877-f02d-4f6d-b38e-aa2191054${String(write).padStart(3, "0")}`), idempotency_key: idempotencyKey(`m2-correction-failure-${write}`), requester: user,
        original_journal_entry_id: original.journal_entry_id, reason: "Injected failure", source_evidence_refs: originalCommand.pair.expense.evidence_refs, authorization_decision_id: generatedUuid("5", write), reversal_accounting_period: period(), reversal_period_authorization: periodAuthorization(originalCommand.pair, period(), "REVERSAL"), replacement: replacementCommand,
        correction_relationships: [createEventRelationship({ relationship_id: generatedUuid("6", write) as ReturnType<typeof eventRelationshipId>, organization_id: ids.organization, from_event_id: replacement.expense.event_id, relationship_type: "SUPERSEDES", to_event_id: originalCommand.pair.expense.event_id, created_at: ids.timestamp, created_by: user })], requested_at: ids.timestamp,
      };
      registerTrustedCorrection(authority, correction, original);
      store.failAtMandatoryWrite(write);
      await assert.rejects(() => ledger.postCorrection(correction), (error: unknown) => error instanceof M2ContractError && error.code === "INFRASTRUCTURE_FAILURE");
      const snapshot = store.snapshot();
      assert.equal(snapshot.journals.length, 1);
      assert.equal(snapshot.corrections.length, 0);
      assert.equal(snapshot.consumed_decisions.length, 1);
      store.close();
    }
  });
});

test("schema v2 clean initialization, v1 migration, and newer-schema refusal are explicit and safe", () => {
  const directory = mkdtempSync(join(tmpdir(), "wendy-m2-schema-"));
  try {
    const clean = new SqliteLedgerStore(join(directory, "clean.sqlite"));
    assert.equal(clean.schemaVersion(), 2);
    clean.close();
    const legacyPath = join(directory, "legacy.sqlite");
    const legacy = new DatabaseSync(legacyPath);
    legacy.exec("CREATE TABLE wendy_m2_schema_metadata (schema_key TEXT PRIMARY KEY, schema_version INTEGER NOT NULL); INSERT INTO wendy_m2_schema_metadata VALUES ('wendy_m2', 1); CREATE TABLE wendy_m2_idempotency (organization_id TEXT, operation TEXT, idempotency_key TEXT, record_json TEXT, PRIMARY KEY (organization_id, operation, idempotency_key));");
    legacy.close();
    const migrated = new SqliteLedgerStore(legacyPath);
    assert.equal(migrated.schemaVersion(), 2);
    migrated.close();
    const newerPath = join(directory, "newer.sqlite");
    const newer = new DatabaseSync(newerPath);
    newer.exec("CREATE TABLE wendy_m2_schema_metadata (schema_key TEXT PRIMARY KEY, schema_version INTEGER NOT NULL); INSERT INTO wendy_m2_schema_metadata VALUES ('wendy_m2', 99);");
    newer.close();
    assert.throws(() => new SqliteLedgerStore(newerPath), /newer/);
    const check = new DatabaseSync(newerPath);
    assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'wendy_m2_journal'").get(), undefined);
    check.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("CON-01/CON-02/CON-03: independently opened SQLite connections preserve one effect and one correction chain", async () => {
  await withTempDatabase(async (filename) => {
    const firstStore = new SqliteLedgerStore(filename);
    const secondStore = new SqliteLedgerStore(filename);
    await firstStore.replacePeriod(period());
    const authority = new InMemoryTrustedDecisionAuthority(grants);
    const first = new LedgerPostingService(firstStore, serviceActor, grants, authority);
    const second = new LedgerPostingService(secondStore, serviceActor, grants, authority);
    const command = postingCommand({ authorization_decision_id: uuid("82c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("83c58877-f02d-4f6d-b38e-aa2191053c27") });
    registerTrustedOriginal(authority, command);
    const [a, b] = await Promise.all([first.post(command), second.post(command)]);
    assert.deepEqual(new Set([a.outcome, b.outcome]), new Set(["POSTED"]));
    assert.equal(firstStore.snapshot().journals.length, 1);
    const alternative = postingCommand({ idempotency_key: idempotencyKey("m2-independent-effect"), authorization_decision_id: uuid("84c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("85c58877-f02d-4f6d-b38e-aa2191053c27") });
    registerTrustedOriginal(authority, alternative);
    assert.equal((await second.post(alternative)).outcome, "DUPLICATE");
    assert.equal(secondStore.snapshot().journals.length, 1);
    const original = firstStore.snapshot().journals[0]!;
    const replacement = replacementPair();
    const replacementCommand = postingCommand({
      pair: replacement,
      request_id: requestId("88c58877-f02d-4f6d-b38e-aa2191053c27"),
      trace_id: traceId("89c58877-f02d-4f6d-b38e-aa2191053c27"),
      idempotency_key: idempotencyKey("m2-independent-replacement"),
      authorization_decision_id: uuid("90c58877-f02d-4f6d-b38e-aa2191053c27"),
      tax_impact_eligibility_decision_id: uuid("91c58877-f02d-4f6d-b38e-aa2191053c27"),
      period_authorization: periodAuthorization(replacement, period(), "CORRECTED_REPLACEMENT"),
    });
    const relationship = createEventRelationship({ relationship_id: eventRelationshipId("92c58877-f02d-4f6d-b38e-aa2191053c27"), organization_id: ids.organization, from_event_id: replacement.expense.event_id, relationship_type: "SUPERSEDES", to_event_id: command.pair.expense.event_id, created_at: ids.timestamp, created_by: user });
    const correction: CorrectionPostingCommand = {
      operation: "POST_PAID_EXPENSE_CORRECTION", organization_id: ids.organization,
      request_id: requestId("93c58877-f02d-4f6d-b38e-aa2191053c27"), trace_id: traceId("94c58877-f02d-4f6d-b38e-aa2191053c27"), idempotency_key: idempotencyKey("m2-independent-correction"), requester: user,
      original_journal_entry_id: original.journal_entry_id, reason: "Correct source", source_evidence_refs: command.pair.expense.evidence_refs,
      authorization_decision_id: uuid("95c58877-f02d-4f6d-b38e-aa2191053c27"), reversal_accounting_period: period(), reversal_period_authorization: periodAuthorization(command.pair, period(), "REVERSAL"), replacement: replacementCommand, correction_relationships: [relationship], requested_at: ids.timestamp,
    };
    registerTrustedCorrection(authority, correction, original);
    const competing: CorrectionPostingCommand = { ...correction, request_id: requestId("96c58877-f02d-4f6d-b38e-aa2191053c27"), idempotency_key: idempotencyKey("m2-independent-correction-competitor"), authorization_decision_id: uuid("97c58877-f02d-4f6d-b38e-aa2191053c27") };
    registerTrustedCorrection(authority, competing, original);
    const [correctionResult, contender] = await Promise.all([first.postCorrection(correction), second.postCorrection(competing)]);
    assert.deepEqual(new Set([correctionResult.outcome, contender.outcome]), new Set(["POSTED", "REJECTED"]));
    assert.equal(firstStore.snapshot().journals.length, 3);
    assert.equal(firstStore.snapshot().consumed_decisions.length, 3);
    firstStore.close();
    secondStore.close();
  });
});

test("CON lock contention uses a bounded SQLite wait and has no process-local correctness dependency", async () => {
  await withTempDatabase(async (filename) => {
    const store = new SqliteLedgerStore(filename);
    await store.replacePeriod(period());
    const authority = new InMemoryTrustedDecisionAuthority(grants);
    const ledger = new LedgerPostingService(store, serviceActor, grants, authority);
    const command = postingCommand({ authorization_decision_id: uuid("86c58877-f02d-4f6d-b38e-aa2191053c27"), tax_impact_eligibility_decision_id: uuid("87c58877-f02d-4f6d-b38e-aa2191053c27") });
    registerTrustedOriginal(authority, command);
    const worker = spawn(process.execPath, ["--experimental-strip-types", join(process.cwd(), "test/m2-sqlite-lock-worker.ts"), filename, "180"], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) => {
      worker.stdout.on("data", (chunk: Buffer) => { if (chunk.toString().includes("LOCKED")) resolve(); });
      worker.once("error", reject);
      worker.once("exit", (code) => { if (code !== 0) reject(new Error(`lock worker exited ${code}`)); });
    });
    const started = Date.now();
    assert.equal((await ledger.post(command)).outcome, "POSTED");
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 100 && elapsed < 5_000, `SQLite bounded wait was ${elapsed}ms`);
    await new Promise<void>((resolve) => worker.once("exit", () => resolve()));
    store.close();
  });
});
