import {
  actorId,
  actorRef,
  contentHash,
  economicGroupId,
  evidenceId,
  eventFingerprint,
  eventRelationshipId,
  financialEventId,
  idempotencyKey,
  isoDate,
  money,
  organizationId,
  paymentSourceId,
  rfc3339Timestamp,
  ruleVersion,
  sourceArtifactId,
  sourceId,
  type ExpenseRecognizedEvent,
  type PaymentMadeEvent,
  type EventRelationship,
} from "../src/index.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

export const ids = Object.freeze({
  organization: organizationId("8dc58877-f02d-4f6d-b38e-aa2191053c27"),
  otherOrganization: organizationId("9dc58877-f02d-4f6d-b38e-aa2191053c27"),
  actor: actorId("1dc58877-f02d-4f6d-b38e-aa2191053c27"),
  expenseEvent: financialEventId("67d3396b-44d7-488b-9cff-755ad5893fc2"),
  paymentEvent: financialEventId("b05be9aa-c4fb-4276-8442-e437fc977c26"),
  economicGroup: economicGroupId("7f286f4e-40c0-4c50-8c34-2e15ed720ccd"),
  relationship: eventRelationshipId("2dc58877-f02d-4f6d-b38e-aa2191053c27"),
  source: sourceId("3dc58877-f02d-4f6d-b38e-aa2191053c27"),
  sourceArtifact: sourceArtifactId("4dc58877-f02d-4f6d-b38e-aa2191053c27"),
  evidence: evidenceId("5dc58877-f02d-4f6d-b38e-aa2191053c27"),
  paymentSource: paymentSourceId("6dc58877-f02d-4f6d-b38e-aa2191053c27"),
  contentHashA: contentHash(HASH_A),
  contentHashB: contentHash(HASH_B),
  fingerprint: eventFingerprint(HASH_A),
  idempotency: idempotencyKey("paid-expense-confirmation-001"),
  ruleVersion: ruleVersion("validation-rules/0.1.0"),
  date: isoDate("2026-09-10"),
  timestamp: rfc3339Timestamp("2026-09-10T10:00:00+07:00"),
});

export const user = actorRef({ actor_type: "USER", actor_id: ids.actor, display_name: "M1 test user" });

export function expenseEvent(overrides: Partial<ExpenseRecognizedEvent> = {}): ExpenseRecognizedEvent {
  return {
    event_id: ids.expenseEvent,
    organization_id: ids.organization,
    economic_group_id: ids.economicGroup,
    event_domain: "BUSINESS",
    event_type: "ExpenseRecognized",
    schema_version: "wendy.financial-event.paid-expense/0.1.0" as ExpenseRecognizedEvent["schema_version"],
    event_version: 1,
    status: "VALIDATED",
    occurred_at: ids.timestamp,
    effective_date: ids.date,
    accounting_date: ids.date,
    amount: money("3500.00", "THB"),
    payload: {
      expense_category: "MARKETING",
      description: "Meta Ads",
      recognition_basis: "IMMEDIATE_PAID_EXPENSE",
      supplier: { display_name: "Meta", counterparty_id: null, identification_status: "PROVIDED" },
    },
    source_refs: [{ source_id: ids.source, source_artifact_id: ids.sourceArtifact, source_record_id: "receipt-1", content_hash: ids.contentHashA }],
    evidence_refs: [{ evidence_id: ids.evidence, evidence_type: "USER_CONFIRMATION", content_hash: ids.contentHashA }],
    related_event_refs: [],
    idempotency_key: ids.idempotency,
    event_fingerprint: ids.fingerprint,
    rule_context_version: ids.ruleVersion,
    approval: { required_level: "USER_CONFIRM", status: "PENDING", candidate_hash: ids.contentHashA, decided_at: null, decided_by: null },
    created_at: ids.timestamp,
    created_by: user,
    ...overrides,
  };
}

export function paymentEvent(overrides: Partial<PaymentMadeEvent> = {}): PaymentMadeEvent {
  return {
    event_id: ids.paymentEvent,
    organization_id: ids.organization,
    economic_group_id: ids.economicGroup,
    event_domain: "PAYMENT",
    event_type: "PaymentMade",
    schema_version: "wendy.financial-event.paid-expense/0.1.0" as PaymentMadeEvent["schema_version"],
    event_version: 1,
    status: "VALIDATED",
    occurred_at: ids.timestamp,
    effective_date: ids.date,
    accounting_date: ids.date,
    payment_date: ids.date,
    amount: money("3500.00", "THB"),
    payload: {
      payment_method: "BANK_TRANSFER",
      payment_source_ref: { payment_source_id: ids.paymentSource, source_type: "BANK_ACCOUNT", display_label: "Operating bank" },
      payee: { display_name: "Meta", counterparty_id: null, identification_status: "PROVIDED" },
      payment_status: "COMPLETED",
    },
    source_refs: [{ source_id: ids.source, source_artifact_id: ids.sourceArtifact, source_record_id: "bank-1", content_hash: ids.contentHashA }],
    evidence_refs: [{ evidence_id: ids.evidence, evidence_type: "USER_CONFIRMATION", content_hash: ids.contentHashA }],
    related_event_refs: [],
    idempotency_key: ids.idempotency,
    event_fingerprint: ids.fingerprint,
    rule_context_version: ids.ruleVersion,
    approval: { required_level: "USER_CONFIRM", status: "PENDING", candidate_hash: ids.contentHashA, decided_at: null, decided_by: null },
    created_at: ids.timestamp,
    created_by: user,
    ...overrides,
  };
}

export function fulfillsRelationship(overrides: Partial<EventRelationship> = {}): EventRelationship {
  return {
    relationship_id: ids.relationship,
    organization_id: ids.organization,
    from_event_id: ids.paymentEvent,
    relationship_type: "FULFILLS",
    to_event_id: ids.expenseEvent,
    created_at: ids.timestamp,
    created_by: user,
    ...overrides,
  };
}
