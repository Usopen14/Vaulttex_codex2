import assert from "node:assert/strict";
import test from "node:test";

import {
  DomainValidationError,
  assertRelatedEventsShareOrganization,
  createFinancialEventIdentity,
  createFinancialEventRelation,
  economicGroupId,
  financialEventId,
  financialEventRelationId,
  organizationId,
  traceId,
} from "../src/index.ts";

const organizationA = organizationId("org-a");
const organizationB = organizationId("org-b");
const group = economicGroupId("economic-group-1");
const trace = traceId("trace-first-event");

function proposedExpenseEvent(eventId = financialEventId("event-expense")) {
  return createFinancialEventIdentity({
    eventId,
    organizationId: organizationA,
    eventType: "ExpenseRecognized",
    eventDomain: "ACCOUNTING_RECOGNITION",
    eventVersion: 1,
    economicGroupId: group,
    sourceRefs: ["source-line-text-1"],
    traceId: trace,
    status: "PROPOSED",
    accountingEffect: "REQUIRED",
    taxEffect: "CANDIDATE",
    cashEffect: "NONE",
  });
}

test("Financial Event identity preserves event semantics, source provenance, and effect candidates", () => {
  const event = proposedExpenseEvent();
  assert.equal(event.eventType, "ExpenseRecognized");
  assert.equal(event.sourceRefs[0], "source-line-text-1");
  assert.throws(
    () => createFinancialEventIdentity({ ...event, sourceRefs: [] }),
    (error: unknown) => error instanceof DomainValidationError && error.code === "SOURCE_MISSING",
  );
});

test("Financial Event relationship primitive rejects self-reference and cross-organization links", () => {
  const expense = proposedExpenseEvent();
  const payment = createFinancialEventIdentity({
    ...expense,
    eventId: financialEventId("event-payment"),
    eventType: "PaymentMade",
    eventDomain: "PAYMENT",
    accountingEffect: "REQUIRED",
    cashEffect: "REQUIRED",
  });
  const relation = createFinancialEventRelation({
    relationId: financialEventRelationId("relation-1"),
    organizationId: organizationA,
    fromEventId: expense.eventId,
    toEventId: payment.eventId,
    relationType: "RECOGNITION_SETTLED_BY_PAYMENT",
    traceId: trace,
  });

  assertRelatedEventsShareOrganization(relation, expense, payment);
  assert.throws(
    () => createFinancialEventRelation({ ...relation, toEventId: relation.fromEventId }),
    DomainValidationError,
  );
  assert.throws(
    () => assertRelatedEventsShareOrganization(relation, expense, { ...payment, organizationId: organizationB }),
    DomainValidationError,
  );
});
