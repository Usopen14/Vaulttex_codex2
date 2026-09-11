import assert from "node:assert/strict";
import test from "node:test";
import {
  WendyDomainError,
  assertIdempotencyInputMatches,
  assertOnlyKnownFields,
  candidateId,
  createEngineContract,
  createEngineRequest,
  createFinancialEvent,
  createValidationResult,
  requestId,
  requireMutationIdempotency,
  schemaVersion,
  traceId,
  transitionFinancialEvent,
  validationResultId,
} from "../src/index.ts";
import { expenseEvent, fulfillsRelationship, ids, paymentEvent, user } from "./m1-fixtures.ts";

function assertDomainError(callback: () => unknown, code: WendyDomainError["error_code"]): void {
  assert.throws(callback, (error: unknown) => error instanceof WendyDomainError && error.error_code === code);
}

test("EngineContract implements v0.2 §24.1 envelope primitives without extending ActorRef", () => {
  const contract = createEngineContract({ contract_name: "ConfirmPaidExpense", contract_version: schemaVersion("0.1.0") });
  assert.equal(contract.contract_name, "ConfirmPaidExpense");
  const request = createEngineRequest({
    contract_version: schemaVersion("0.1.0"),
    request_id: requestId("cdc58877-f02d-4f6d-b38e-aa2191053c27"),
    trace_id: traceId("ddc58877-f02d-4f6d-b38e-aa2191053c27"),
    idempotency_key: ids.idempotency,
    organization_id: ids.organization,
    actor: { actor_type: "INTEGRATION", actor_id: "connector-42" },
    requested_at: ids.timestamp,
    payload: { candidate_id: "opaque" },
  });
  assert.equal(requireMutationIdempotency(request, "ConfirmPaidExpense"), ids.idempotency);
  const { idempotency_key: _idempotencyKey, ...requestWithoutIdempotency } = request;
  assertDomainError(() => requireMutationIdempotency(requestWithoutIdempotency, "ConfirmPaidExpense"), "INVALID_SCHEMA");
  assertIdempotencyInputMatches(ids.idempotency, ids.idempotency, ids.contentHashA, ids.contentHashA);
  assertDomainError(() => assertIdempotencyInputMatches(ids.idempotency, ids.idempotency, ids.contentHashA, ids.contentHashB), "IDEMPOTENCY_CONFLICT");
  assertDomainError(() => assertOnlyKnownFields({ known: true, unexpected: true }, ["known"]), "INVALID_SCHEMA");
});

test("FinancialEvent contract persists canonical event_domain, economic_group_id, provenance, and observation-only tax", () => {
  const expense = createFinancialEvent(expenseEvent({
    payload: {
      ...expenseEvent().payload,
      tax_observations: {
        vat_mentioned: true,
        wht_mentioned: null,
        stated_tax_amount: null,
        evidence_refs: [],
        authority: "OBSERVATION_ONLY",
      },
    },
  }));
  const payment = createFinancialEvent(paymentEvent());
  assert.equal(expense.event_domain, "BUSINESS");
  assert.equal(payment.event_domain, "PAYMENT");
  assert.equal(expense.economic_group_id, payment.economic_group_id);
  assertDomainError(() => createFinancialEvent(expenseEvent({ source_refs: [] })), "INVALID_SCHEMA");
  assertDomainError(() => createFinancialEvent(expenseEvent({ related_event_refs: [fulfillsRelationship({ to_event_id: ids.paymentEvent })] })), "RULE_VIOLATION");
  assertDomainError(() => createFinancialEvent(expenseEvent({ approval: { ...expenseEvent().approval, required_level: "AUTO_POST" } })), "RULE_VIOLATION");
  assertDomainError(() => createFinancialEvent(expenseEvent({ payload: { ...expenseEvent().payload, tax_observations: { vat_mentioned: null, wht_mentioned: null, stated_tax_amount: null, evidence_refs: [], authority: "AUTHORITATIVE" as never } } })), "RULE_VIOLATION");
});

test("FinancialEvent lifecycle is deterministic and human confirmation binds audit data", () => {
  const original = createFinancialEvent(expenseEvent());
  const confirmed = transitionFinancialEvent(original, {
    event_id: original.event_id,
    from_status: "VALIDATED",
    to_status: "CONFIRMED",
    expected_event_version: 1,
    transitioned_at: ids.timestamp,
    transitioned_by: user,
  });
  assert.equal(original.status, "VALIDATED");
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.event_version, 2);
  assert.equal(confirmed.approval.status, "APPROVED");
  assert.equal(confirmed.approval.decided_by?.actor_type, "USER");
  assert.deepEqual(createFinancialEvent(confirmed), confirmed);
  assertDomainError(() => transitionFinancialEvent(original, { event_id: original.event_id, from_status: "VALIDATED", to_status: "CONFIRMED", expected_event_version: 2, transitioned_at: ids.timestamp, transitioned_by: user }), "IDEMPOTENCY_CONFLICT");
});

test("ValidationResult is a versioned response DTO and does not assert posting or tax truth", () => {
  const result = createValidationResult({
    validation_result_id: validationResultId("edc58877-f02d-4f6d-b38e-aa2191053c27"),
    organization_id: ids.organization,
    candidate_id: candidateId("fdc58877-f02d-4f6d-b38e-aa2191053c27"),
    candidate_hash: ids.contentHashA,
    schema_version: schemaVersion("wendy.financial-event.paid-expense/0.1.0"),
    ruleset_version: ids.ruleVersion,
    disposition: "PASS",
    checks: [{ rule_id: "EVT-CORE-001", outcome: "PASS", detail_code: null }],
    duplicate_of_economic_group_id: null,
    validated_at: ids.timestamp,
    validator_service_version: "validation-service/0.1.0",
  });
  assert.equal(result.disposition, "PASS");
});
