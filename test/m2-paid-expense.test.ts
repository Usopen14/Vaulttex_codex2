import assert from "node:assert/strict";
import test from "node:test";

import {
  actorRef,
  createEventRelationship,
  contentHash,
  economicGroupId,
  eventRelationshipId,
  financialEventId,
  idempotencyKey,
  money,
  requestId,
  sourceArtifactId,
  sourceId,
  traceId,
  type AccountingPeriod,
} from "../src/index.ts";
import {
  InMemorySerializableLedgerStore,
  InMemoryTrustedDecisionAuthority,
  LedgerPostingService,
  M2ContractError,
  SqliteLedgerStore,
  assertJournalDraftBalanced,
  assertFingerprintPreimageCompatible,
  decidePaidExpenseAuthorization,
  financialEventFingerprint,
  resolveCategoryAccount,
  resolvePaymentSourceAccount,
  taxImpactEligibilityDecisionHash,
  validatePaidExpensePair,
  validateTaxImpactEligibility,
  type CategoryAccountMapping,
  type CorrectionPostingCommand,
  type OriginalPostingCommand,
  type TaxImpactEligibilityDecision,
} from "../src/m2/index.ts";
import {
  accountingProfile,
  accountantActor,
  authorization,
  cashAccount,
  categoryMapping,
  confirmedPair,
  expenseAccount,
  grants,
  m2Ids,
  paymentMapping,
  period,
  periodAuthorization,
  postingCommand,
  replacementPair,
  reviewerActor,
  serviceActor,
  taxDecision,
  registerTrustedCorrection,
  registerTrustedOriginal,
} from "./m2-fixtures.ts";
import { ids, user } from "./m1-fixtures.ts";

function service(periodValue: AccountingPeriod = period()): { readonly store: InMemorySerializableLedgerStore; readonly authority: InMemoryTrustedDecisionAuthority; readonly ledger: { readonly post: (command: OriginalPostingCommand) => Promise<Awaited<ReturnType<LedgerPostingService["post"]>>>; readonly postCorrection: (command: CorrectionPostingCommand) => Promise<Awaited<ReturnType<LedgerPostingService["postCorrection"]>>> } } {
  const store = new InMemorySerializableLedgerStore([periodValue]);
  const authority = new InMemoryTrustedDecisionAuthority(grants);
  const implementation = new LedgerPostingService(store, serviceActor, grants, authority);
  return {
    store,
    authority,
    ledger: {
      post: async (command) => { registerTrustedOriginal(authority, command); return implementation.post(command); },
      postCorrection: async (command) => {
        const original = store.snapshot().journals.find((journal) => journal.journal_entry_id === command.original_journal_entry_id);
        if (original !== undefined) registerTrustedCorrection(authority, command, original);
        return implementation.postCorrection(command);
      },
    },
  };
}

test("BAL-01, MAP-01, MAP-03, TX-01, IMM-01: a valid pair posts one immutable balanced Journal manifest", async () => {
  const { store, ledger } = service();
  const result = await ledger.post(postingCommand());
  assert.equal(result.outcome, "POSTED");
  assert.notEqual(result.journal_entry_id, null);
  const snapshot = store.snapshot();
  assert.equal(snapshot.journals.length, 1);
  assert.equal(snapshot.effects, 1);
  assert.equal(snapshot.idempotency.length, 1);
  assert.equal(snapshot.audits.length, 1);
  const journal = snapshot.journals[0]!;
  assert.equal(journal.immutable_draft.total_debit.value, "3500.00");
  assert.equal(journal.immutable_draft.total_credit.value, "3500.00");
  assert.equal(journal.immutable_draft.lines[0].debit?.value, "3500.00");
  assert.equal(journal.immutable_draft.lines[1].credit?.value, "3500.00");
  assert.equal(journal.immutable_draft.mapping_provenance.category_mapping.resolution, "EXACTLY_ONE");
  assert.equal(journal.tax_impact_consumption?.tax_impact_eligibility_decision_id, m2Ids.taxDecision);
  assert.equal(Object.isFrozen(journal), true);
  assert.equal(Object.isFrozen(journal.immutable_draft.lines), true);
});

test("database adapter enforces the frozen idempotency/effect identities inside a SQLite transaction", async () => {
  const store = new SqliteLedgerStore(":memory:");
  try {
    await store.replacePeriod(period());
    const authority = new InMemoryTrustedDecisionAuthority(grants);
    const ledger = new LedgerPostingService(store, serviceActor, grants, authority);
    const command = postingCommand();
    registerTrustedOriginal(authority, command);
    const first = await ledger.post(command);
    const duplicateCommand = postingCommand({ idempotency_key: idempotencyKey("m2-sqlite-duplicate") });
    registerTrustedOriginal(authority, duplicateCommand);
    const replay = await ledger.post(duplicateCommand);
    assert.equal(first.outcome, "POSTED");
    assert.equal(replay.outcome, "DUPLICATE");
    assert.equal(store.snapshot().journals.length, 1);
  } finally {
    store.close();
  }
});

test("SQLite enforces JSON-backed Journal balance/reference checks and rolls back prior mandatory writes", async () => {
  const store = new SqliteLedgerStore(":memory:");
  try {
    await store.replacePeriod(period());
    const authority = new InMemoryTrustedDecisionAuthority(grants);
    const ledger = new LedgerPostingService(store, serviceActor, grants, authority);
    const command = postingCommand();
    registerTrustedOriginal(authority, command);
    assert.equal((await ledger.post(command)).outcome, "POSTED");
    const snapshot = store.snapshot();
    const original = snapshot.journals[0]!;
    const invalid = {
      ...original,
      journal_entry_id: m2Ids.categoryMapping,
      immutable_draft: { ...original.immutable_draft, total_credit: money("1.00", "THB") },
    };
    const pending = { ...snapshot.idempotency[0]!, idempotency_key: idempotencyKey("m2-sqlite-rolled-back") };
    await assert.rejects(() => store.serializable((transaction) => {
      transaction.putIdempotency(pending);
      transaction.putJournal(invalid);
    }), /CHECK constraint failed/);
    assert.equal(store.snapshot().journals.length, 1);
    assert.equal(store.snapshot().idempotency.length, 1);
  } finally {
    store.close();
  }
});

test("BAL-02, MAP-02, MAP-04, ORG-01: malformed, unresolved, ineligible, and cross-org mapping paths fail closed", async () => {
  const pair = confirmedPair();
  assert.equal(resolveCategoryAccount({ organization_id: ids.organization, expense_category: "MARKETING", effective_accounting_date: pair.expense.effective_date, mappings: [] }).resolution, "ZERO_ELIGIBLE");
  assert.equal(resolveCategoryAccount({ organization_id: ids.organization, expense_category: "MARKETING", effective_accounting_date: pair.expense.effective_date, mappings: [categoryMapping, { ...categoryMapping, mapping_id: m2Ids.paymentMapping }] }).resolution, "MULTIPLE_ELIGIBLE");
  assert.equal(resolveCategoryAccount({ organization_id: ids.organization, expense_category: "MARKETING", effective_accounting_date: pair.expense.effective_date, mappings: [{ ...categoryMapping, eligibility_at_effective_date: "INELIGIBLE" }] }).resolution, "INELIGIBLE");
  const crossOrg = { ...categoryMapping, organization_id: ids.otherOrganization, account: { ...expenseAccount, organization_id: ids.otherOrganization } } as CategoryAccountMapping;
  assert.equal(resolveCategoryAccount({ organization_id: ids.organization, expense_category: "MARKETING", effective_accounting_date: pair.expense.effective_date, mappings: [crossOrg] }).resolution, "CROSS_ORGANIZATION");
  assert.equal(resolvePaymentSourceAccount({ organization_id: ids.organization, payment_source_id: ids.paymentSource, payment_source_type: "BANK_ACCOUNT", effective_accounting_date: pair.expense.effective_date, mappings: [] }).resolution, "ZERO_ELIGIBLE");
  assert.equal(resolvePaymentSourceAccount({ organization_id: ids.organization, payment_source_id: ids.paymentSource, payment_source_type: "BANK_ACCOUNT", effective_accounting_date: pair.expense.effective_date, mappings: [paymentMapping, { ...paymentMapping, mapping_id: m2Ids.categoryMapping }] }).resolution, "MULTIPLE_ELIGIBLE");
  assert.equal(resolvePaymentSourceAccount({ organization_id: ids.organization, payment_source_id: ids.paymentSource, payment_source_type: "BANK_ACCOUNT", effective_accounting_date: pair.expense.effective_date, mappings: [{ ...paymentMapping, organization_id: ids.otherOrganization, account: { ...cashAccount, organization_id: ids.otherOrganization } }] }).resolution, "CROSS_ORGANIZATION");
  assert.equal(resolvePaymentSourceAccount({ organization_id: ids.organization, payment_source_id: ids.paymentSource, payment_source_type: "BANK_ACCOUNT", effective_accounting_date: pair.expense.effective_date, mappings: [{ ...paymentMapping, account: { ...cashAccount, reporting_tag: "ASSET.RECEIVABLE.TRADE" } }] }).resolution, "INELIGIBLE");

  const { store, ledger } = service();
  const review = await ledger.post(postingCommand({ category_mappings: [] }));
  assert.equal(review.outcome, "REVIEW_REQUIRED");
  assert.equal(store.snapshot().journals.length, 0);
  const badAmount = confirmedPair({ amount: "3500" });
  const mismatched = { ...badAmount, payment: { ...badAmount.payment, amount: money("3499", "THB") } };
  const rejected = await ledger.post(postingCommand({ pair: mismatched }));
  assert.equal(rejected.outcome, "REJECTED");
  assert.equal(store.snapshot().journals.length, 0);
  const untypedFraction = { ...badAmount, payment: { ...badAmount.payment, amount: { value: "3500.001", currency: "THB" } as typeof badAmount.payment.amount } };
  assert.equal((await ledger.post(postingCommand({ pair: untypedFraction, idempotency_key: idempotencyKey("m2-invalid-money") }))).outcome, "REJECTED");
  const crossEventPair = { ...pair, payment: { ...pair.payment, organization_id: ids.otherOrganization } };
  assert.equal((await ledger.post(postingCommand({ pair: crossEventPair, idempotency_key: idempotencyKey("m2-cross-organization") }))).outcome, "REJECTED");
  assert.throws(() => assertJournalDraftBalanced([
    { line_id: m2Ids.categoryMapping, line_number: 1, account_id: expenseAccount.account_id, debit: money("1.00", "THB"), credit: money("1.00", "THB"), line_provenance_ref: "invalid" },
    { line_id: m2Ids.paymentMapping, line_number: 2, account_id: cashAccount.account_id, debit: null, credit: money("1.00", "THB"), line_provenance_ref: "invalid" },
  ]));
});

test("EVT-01, EVT-02, FP-01, FP-02, FP-03: canonical pair and fingerprints preserve exact roles, ordering, and collision safety", () => {
  const pair = confirmedPair();
  const result = validatePaidExpensePair(pair);
  const lexicalVariant = { ...pair.expense, amount: money("3500", "THB"), payload: { ...pair.expense.payload, description: "Changed UI description" } };
  assert.equal(financialEventFingerprint(pair.expense).value, financialEventFingerprint(lexicalVariant).value);
  const secondSource = { source_id: sourceId("51c58877-f02d-4f6d-b38e-aa2191053c27"), source_artifact_id: sourceArtifactId("52c58877-f02d-4f6d-b38e-aa2191053c27"), source_record_id: null, content_hash: contentHash("e".repeat(64)) };
  const sortedSourceVariant = { ...pair.expense, source_refs: [pair.expense.source_refs[0]!, secondSource] };
  const reversedSourceVariant = { ...pair.expense, source_refs: [secondSource, pair.expense.source_refs[0]!] };
  assert.equal(financialEventFingerprint(sortedSourceVariant).value, financialEventFingerprint(reversedSourceVariant).value);
  const relationshipVariant = createEventRelationship({ ...pair.fulfills_relationship, relationship_id: eventRelationshipId("32c58877-f02d-4f6d-b38e-aa2191053c27") });
  assert.equal(result.effect_fingerprint.value, validatePaidExpensePair({ ...pair, fulfills_relationship: relationshipVariant }).effect_fingerprint.value);
  assert.throws(() => assertFingerprintPreimageCompatible({ value: result.effect_fingerprint.value, canonical_preimage: "{\"prior\":true}" }, { value: result.effect_fingerprint.value, canonical_preimage: "{\"incoming\":true}" }), (error: unknown) => error instanceof M2ContractError && error.code === "FINGERPRINT_COLLISION");
  assert.throws(() => validatePaidExpensePair({ ...pair, fulfills_relationship: createEventRelationship({ ...pair.fulfills_relationship, from_event_id: pair.expense.event_id, to_event_id: pair.payment.event_id }) }));
  assert.throws(() => validatePaidExpensePair({ ...pair, payment: { ...pair.payment, status: "VALIDATED" } }));
  assert.throws(() => validatePaidExpensePair({ ...pair, expense: { ...pair.expense, event_fingerprint: pair.payment.event_fingerprint } }));
});

test("TAX-01, TAX-02, TAX-03: T-01 is explicit, evidence-backed, exact-bound, and fail-closed", () => {
  const pair = confirmedPair();
  const valid = taxDecision(pair);
  assert.equal(validateTaxImpactEligibility(valid, pair, grants).allowed, true);
  assert.equal(validateTaxImpactEligibility(null, pair, grants).allowed, false);
  assert.equal(validateTaxImpactEligibility(taxDecision(pair, "UNRESOLVED"), pair, grants).allowed, false);
  assert.equal(validateTaxImpactEligibility(taxDecision(pair, "SEPARATE_ACCOUNTING_IMPACT_REQUIRED"), pair, grants).allowed, false);
  const unauthorized: TaxImpactEligibilityDecision = { ...valid, accounting_reviewer: { ...valid.accounting_reviewer, actor: user } };
  assert.equal(validateTaxImpactEligibility({ ...unauthorized, decision_provenance_hash: taxImpactEligibilityDecisionHash(unauthorized) }, pair, grants).allowed, false);
  const mismatched = { ...valid, economic_group_id: economicGroupId("33c58877-f02d-4f6d-b38e-aa2191053c27") };
  assert.equal(validateTaxImpactEligibility({ ...mismatched, decision_provenance_hash: taxImpactEligibilityDecisionHash(mismatched) }, pair, grants).allowed, false);
  const stalePolicy = { ...valid, policy_version: "WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.0" as never };
  assert.equal(validateTaxImpactEligibility({ ...stalePolicy, decision_provenance_hash: taxImpactEligibilityDecisionHash(stalePolicy) }, pair, grants).allowed, false);
});

test("AUTH-01 through AUTH-06: server capabilities, USER_CONFIRM boundary, SOD, Owner Override, and Ledger writer are distinct", async () => {
  const confirm = decidePaidExpenseAuthorization({
    organization_id: ids.organization, source_request_id: requestId("34c58877-f02d-4f6d-b38e-aa2191053c27"), actor: user, originator: user, requested_operation: "USER_CONFIRM_PAID_EXPENSE", affected_event_refs: [], evaluated_at: ids.timestamp, candidate_actor_ids_ref: "candidate", independent_eligible_actor_ids_ref: "eligible", user_confirmation: { candidate_hash: ids.contentHashA, confirmation_audit_ref: "confirmation:1" },
  }, grants);
  assert.equal(confirm.decision, "ALLOWED");
  const selfApproval = decidePaidExpenseAuthorization({
    organization_id: ids.organization, source_request_id: requestId("35c58877-f02d-4f6d-b38e-aa2191053c27"), actor: user, originator: user, requested_operation: "DECIDE_ELEVATED_APPROVAL", affected_event_refs: [], evaluated_at: ids.timestamp, candidate_actor_ids_ref: "candidate", independent_eligible_actor_ids_ref: "eligible",
  }, grants);
  assert.equal(selfApproval.decision, "DENIED");
  const ownerGrants = [{ organization_id: ids.organization, actor_id: user.actor_id, role: "OWNER" as const, membership_status: "ACTIVE" as const, capabilities: ["PAID_EXPENSE_ELEVATED_APPROVAL"], membership_evidence_ref: "owner" }];
  const ownerOverride = decidePaidExpenseAuthorization({
    organization_id: ids.organization, source_request_id: requestId("36c58877-f02d-4f6d-b38e-aa2191053c27"), actor: user, originator: user, requested_operation: "DECIDE_ELEVATED_APPROVAL", affected_event_refs: [], evaluated_at: ids.timestamp, candidate_actor_ids_ref: "candidate", independent_eligible_actor_ids_ref: "none", owner_override: { enabled_by_organization_policy: true, explicitly_requested: true, justification: "No independent approver exists" },
  }, ownerGrants);
  assert.equal(ownerOverride.decision, "ALLOWED");
  assert.equal(ownerOverride.approval_control_audit.control_mechanism, "OWNER_OVERRIDE");
  const directHuman = new LedgerPostingService(new InMemorySerializableLedgerStore([period()]), user, grants, new InMemoryTrustedDecisionAuthority(grants));
  await assert.rejects(() => directHuman.post(postingCommand()), (error: unknown) => error instanceof M2ContractError && error.code === "INVALID_LEDGER_WRITER");
  const noSubmitGrants = grants.filter((grant) => grant.actor_id !== user.actor_id);
  const noSubmit = new LedgerPostingService(new InMemorySerializableLedgerStore([period()]), serviceActor, noSubmitGrants, new InMemoryTrustedDecisionAuthority(noSubmitGrants));
  const rejected = await noSubmit.post(postingCommand());
  assert.equal(rejected.outcome, "REJECTED");
  const unbound = authorization();
  assert.equal(unbound.decision, "ALLOWED");
});

test("PER-01 through PER-04: only OPEN/M2-date-matched Period authorization can commit and stale Period state denies", async () => {
  for (const status of ["CLOSED", "LOCKED"] as const) {
    const selected = period(status);
    const { store, ledger } = service(selected);
    const command = postingCommand({ accounting_period: selected, period_authorization: periodAuthorization(confirmedPair(), selected) });
    const result = await ledger.post(command);
    assert.equal(result.outcome, "PERIOD_DENIED");
    assert.equal(store.snapshot().journals.length, 0);
  }
  const open = period();
  const pair = confirmedPair();
  const { store, ledger } = service(open);
  const command = postingCommand({ pair, accounting_period: open, period_authorization: periodAuthorization(pair, open) });
  await store.replacePeriod({ ...open, status: "CLOSED", period_version: 2 });
  const stale = await ledger.post(command);
  assert.equal(stale.outcome, "PERIOD_DENIED");
  assert.equal(store.snapshot().journals.length, 0);
});

test("IDEMP-01 through IDEMP-04, CON-01 and CON-02: replay, conflict, duplicate effects, source collisions, and races create one effect", async () => {
  const { store, ledger } = service();
  const command = postingCommand();
  const [first, replay] = await Promise.all([ledger.post(command), ledger.post(command)]);
  assert.equal(first.outcome, "POSTED");
  assert.equal(replay.outcome, "POSTED");
  assert.equal(store.snapshot().journals.length, 1);
  const conflict = await ledger.post({ ...command, confirmation_audit_ref: "confirmation:changed" });
  assert.equal(conflict.outcome, "REJECTED");
  assert.deepEqual(conflict.reason_codes, ["IDEMPOTENCY_CONFLICT"]);
  const duplicate = await ledger.post({ ...command, idempotency_key: idempotencyKey("m2-post-002") });
  assert.equal(duplicate.outcome, "DUPLICATE");
  assert.equal(store.snapshot().journals.length, 1);
  const collidingPair = confirmedPair({ expense_event_id: financialEventId("37c58877-f02d-4f6d-b38e-aa2191053c27"), payment_event_id: financialEventId("38c58877-f02d-4f6d-b38e-aa2191053c27"), economic_group_id: economicGroupId("39c58877-f02d-4f6d-b38e-aa2191053c27"), relationship_id: eventRelationshipId("40c58877-f02d-4f6d-b38e-aa2191053c27") });
  const collision = await ledger.post(postingCommand({ pair: collidingPair, idempotency_key: idempotencyKey("m2-post-source-collision"), authorization_decision_id: m2Ids.paymentMapping, tax_impact_eligibility_decision_id: m2Ids.categoryMapping }));
  assert.equal(collision.outcome, "REVIEW_REQUIRED");
  assert.equal(store.snapshot().journals.length, 1);
});

test("CON-01/02 and RETRY-02: concurrent changed-key/effect attempts and lost-response retry preserve one canonical effect", async () => {
  const sameKey = service();
  const command = postingCommand({ idempotency_key: idempotencyKey("m2-race-same-key") });
  const [posted, conflict] = await Promise.all([
    sameKey.ledger.post(command),
    sameKey.ledger.post({ ...command, confirmation_audit_ref: "confirmation:concurrent-change" }),
  ]);
  assert.equal(posted.outcome, "POSTED");
  assert.equal(conflict.outcome, "REJECTED");
  assert.equal(sameKey.store.snapshot().journals.length, 1);

  const sameEffect = service();
  const pair = confirmedPair();
  const [first, duplicate] = await Promise.all([
    sameEffect.ledger.post(postingCommand({ pair, idempotency_key: idempotencyKey("m2-race-effect-a") })),
    sameEffect.ledger.post(postingCommand({ pair, idempotency_key: idempotencyKey("m2-race-effect-b") })),
  ]);
  assert.deepEqual(new Set([first.outcome, duplicate.outcome]), new Set(["POSTED", "DUPLICATE"]));
  assert.equal(sameEffect.store.snapshot().journals.length, 1);

  const lostResponse = service();
  const retry = postingCommand({ idempotency_key: idempotencyKey("m2-lost-response") });
  await lostResponse.ledger.post(retry);
  assert.equal((await lostResponse.ledger.post(retry)).outcome, "POSTED");
  assert.equal(lostResponse.store.snapshot().journals.length, 1);
});

test("FP-03: a stored fingerprint/preimage conflict records a diagnostic and blocks a Journal", async () => {
  const { store, ledger } = service();
  const pair = confirmedPair();
  const fingerprint = financialEventFingerprint(pair.expense);
  await store.serializable((transaction) => transaction.putEventFingerprint({ organization_id: ids.organization, fingerprint: fingerprint.value, canonical_preimage: "{\"conflict\":true}" }));
  const result = await ledger.post(postingCommand({ pair, idempotency_key: idempotencyKey("m2-fingerprint-collision") }));
  assert.equal(result.outcome, "REJECTED");
  assert.equal(store.snapshot().journals.length, 0);
  assert.equal(store.snapshot().fingerprint_diagnostics.length, 1);
});

test("TX-02 and RETRY-01/02: every injected mandatory-write failure rolls back and same-key retry remains safe", async () => {
  for (let write = 1; write <= 9; write += 1) {
    const { store, ledger } = service();
    const command = postingCommand({ idempotency_key: idempotencyKey(`m2-failure-${write}`) });
    store.failAtMandatoryWrite(write);
    await assert.rejects(() => ledger.post(command), (error: unknown) => error instanceof M2ContractError && error.code === "INFRASTRUCTURE_FAILURE");
    const failed = store.snapshot();
    assert.equal(failed.journals.length, 0);
    assert.equal(failed.effects, 0);
    assert.equal(failed.audits.length, 0);
    const retried = await ledger.post(command);
    assert.equal(retried.outcome, "POSTED");
    assert.equal(store.snapshot().journals.length, 1);
  }
});

test("COR-01 through COR-03 and CON-03: correction commits exact reversal plus replacement atomically, with one reversal winner", async () => {
  const originalPair = confirmedPair();
  const selectedPeriod = period();
  const { store, ledger } = service(selectedPeriod);
  const originalCommand = postingCommand({ pair: originalPair, accounting_period: selectedPeriod, period_authorization: periodAuthorization(originalPair, selectedPeriod) });
  const original = await ledger.post(originalCommand);
  assert.equal(original.outcome, "POSTED");
  const replacement = replacementPair();
  const replacementCommand = postingCommand({
    pair: replacement,
    request_id: requestId("41c58877-f02d-4f6d-b38e-aa2191053c27"),
    trace_id: traceId("42c58877-f02d-4f6d-b38e-aa2191053c27"),
    idempotency_key: idempotencyKey("m2-replacement-001"),
    authorization_decision_id: m2Ids.categoryMapping,
    period_authorization: periodAuthorization(replacement, selectedPeriod, "CORRECTED_REPLACEMENT"),
    tax_impact_eligibility_decision_id: m2Ids.paymentMapping,
  });
  const correctionApproval = decidePaidExpenseAuthorization({
    organization_id: ids.organization, source_request_id: requestId("43c58877-f02d-4f6d-b38e-aa2191053c27"), actor: accountantActor, originator: user, requested_operation: "PAID_EXPENSE_CORRECTION", affected_event_refs: [{ event_id: originalPair.expense.event_id, event_version: 2, event_type: "ExpenseRecognized" }, { event_id: originalPair.payment.event_id, event_version: 2, event_type: "PaymentMade" }], evaluated_at: ids.timestamp, candidate_actor_ids_ref: "accountant", independent_eligible_actor_ids_ref: "accountant",
  }, grants);
  const correctionRelationship = createEventRelationship({
    relationship_id: eventRelationshipId("44c58877-f02d-4f6d-b38e-aa2191053c27"), organization_id: ids.organization, from_event_id: replacement.expense.event_id, relationship_type: "SUPERSEDES", to_event_id: originalPair.expense.event_id, created_at: ids.timestamp, created_by: user,
  });
  const correction: CorrectionPostingCommand = {
    operation: "POST_PAID_EXPENSE_CORRECTION", organization_id: ids.organization, request_id: requestId("45c58877-f02d-4f6d-b38e-aa2191053c27"), trace_id: traceId("46c58877-f02d-4f6d-b38e-aa2191053c27"), idempotency_key: idempotencyKey("m2-correction-001"), requester: user, original_journal_entry_id: original.journal_entry_id!, reason: "Corrected source evidence", source_evidence_refs: originalPair.expense.evidence_refs, authorization_decision_id: correctionApproval.authorization_decision_id, reversal_accounting_period: selectedPeriod, reversal_period_authorization: periodAuthorization(originalPair, selectedPeriod, "REVERSAL"), replacement: replacementCommand, correction_relationships: [correctionRelationship], requested_at: ids.timestamp,
  };
  const [result, contender] = await Promise.all([
    ledger.postCorrection(correction),
    ledger.postCorrection({ ...correction, request_id: requestId("56c58877-f02d-4f6d-b38e-aa2191053c27"), idempotency_key: idempotencyKey("m2-correction-contender") }),
  ]);
  assert.equal(result.outcome, "POSTED");
  assert.equal(contender.outcome, "REJECTED");
  const snapshot = store.snapshot();
  assert.equal(snapshot.journals.length, 3);
  assert.equal(snapshot.corrections.length, 1);
  const [originalJournal, reversalJournal] = snapshot.journals;
  assert.equal(reversalJournal!.journal_kind, "REVERSAL");
  assert.equal(reversalJournal!.immutable_draft.lines[0].credit?.value, originalJournal!.immutable_draft.lines[0].debit?.value);
  assert.equal(reversalJournal!.immutable_draft.lines[1].debit?.value, originalJournal!.immutable_draft.lines[1].credit?.value);
  const again = await ledger.postCorrection(correction);
  assert.equal(again.outcome, "POSTED");
  assert.equal(store.snapshot().journals.length, 3);
});

test("TX-02/COR-03: every correction mandatory-write failure rolls back the whole chain", async () => {
  for (let write = 1; write <= 14; write += 1) {
    const originalPair = confirmedPair();
    const selectedPeriod = period();
    const { store, ledger } = service(selectedPeriod);
    const original = await ledger.post(postingCommand({ pair: originalPair, accounting_period: selectedPeriod, period_authorization: periodAuthorization(originalPair, selectedPeriod) }));
    const replacement = replacementPair();
    const replacementCommand = postingCommand({ pair: replacement, idempotency_key: idempotencyKey("m2-replacement-failure"), authorization_decision_id: m2Ids.categoryMapping, period_authorization: periodAuthorization(replacement, selectedPeriod, "CORRECTED_REPLACEMENT"), tax_impact_eligibility_decision_id: m2Ids.paymentMapping });
    const approval = decidePaidExpenseAuthorization({ organization_id: ids.organization, source_request_id: requestId("47c58877-f02d-4f6d-b38e-aa2191053c27"), actor: accountantActor, originator: user, requested_operation: "PAID_EXPENSE_CORRECTION", affected_event_refs: [], evaluated_at: ids.timestamp, candidate_actor_ids_ref: "accountant", independent_eligible_actor_ids_ref: "accountant" }, grants);
    const correction: CorrectionPostingCommand = { operation: "POST_PAID_EXPENSE_CORRECTION", organization_id: ids.organization, request_id: requestId("48c58877-f02d-4f6d-b38e-aa2191053c27"), trace_id: traceId("49c58877-f02d-4f6d-b38e-aa2191053c27"), idempotency_key: idempotencyKey("m2-correction-failure"), requester: user, original_journal_entry_id: original.journal_entry_id!, reason: "Correction", source_evidence_refs: originalPair.expense.evidence_refs, authorization_decision_id: approval.authorization_decision_id, reversal_accounting_period: selectedPeriod, reversal_period_authorization: periodAuthorization(originalPair, selectedPeriod, "REVERSAL"), replacement: replacementCommand, correction_relationships: [createEventRelationship({ relationship_id: eventRelationshipId("50c58877-f02d-4f6d-b38e-aa2191053c27"), organization_id: ids.organization, from_event_id: replacement.expense.event_id, relationship_type: "SUPERSEDES", to_event_id: originalPair.expense.event_id, created_at: ids.timestamp, created_by: user })], requested_at: ids.timestamp };
    store.failAtMandatoryWrite(write);
    await assert.rejects(() => ledger.postCorrection(correction));
    assert.equal(store.snapshot().journals.length, 1);
    assert.equal(store.snapshot().corrections.length, 0);
  }
});
