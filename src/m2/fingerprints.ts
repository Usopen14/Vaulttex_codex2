import { eventFingerprint, type ContentHash } from "../domain/common/ids.ts";
import { WendyDomainError } from "../domain/common/errors.ts";
import { money } from "../domain/common/money.ts";
import { assertPaidExpensePair, createEventRelationship, createFinancialEvent } from "../domain/events/financial-event.ts";

import { canonicalJson, sha256Canonical } from "./canonical.ts";
import { M2ContractError } from "./errors.ts";
import {
  FINANCIAL_EVENT_FINGERPRINT_VERSION,
  PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION,
  PAID_EXPENSE_RULE_ID,
  PAID_EXPENSE_RULE_VERSION,
  type Fingerprint,
  type PaidExpensePair,
} from "./contracts.ts";

function normalizedDecimal(value: string): string {
  const [whole, fractional = ""] = value.split(".");
  const trimmed = fractional.replace(/0+$/, "");
  return trimmed.length === 0 ? whole! : `${whole}.${trimmed}`;
}

function sourceTuple(event: PaidExpensePair["expense"] | PaidExpensePair["payment"]): readonly Record<string, string | null>[] {
  return event.source_refs
    .map((source) => ({
      source_id: source.source_id,
      source_artifact_id: source.source_artifact_id,
      source_record_id: source.source_record_id,
      content_hash: source.content_hash,
    }))
    .sort((left, right) => {
      const fields: (keyof typeof left)[] = ["source_id", "source_artifact_id", "source_record_id", "content_hash"];
      for (const field of fields) {
        const leftValue = left[field] ?? "";
        const rightValue = right[field] ?? "";
        if (leftValue < rightValue) return -1;
        if (leftValue > rightValue) return 1;
      }
      return 0;
    });
}

/** Implements wendy.financial-event-fingerprint/1.0.0 without changing M1's stored event field. */
export function financialEventFingerprint(event: PaidExpensePair["expense"] | PaidExpensePair["payment"]): Fingerprint {
  const event_specific = event.event_type === "ExpenseRecognized"
    ? {
      expense_category: event.payload.expense_category,
      recognition_basis: event.payload.recognition_basis,
    }
    : {
      payment_date: event.payment_date,
      payment_method: event.payload.payment_method,
      payment_source_id: event.payload.payment_source_ref.payment_source_id,
      payment_source_type: event.payload.payment_source_ref.source_type,
      payment_status: event.payload.payment_status,
    };
  const encoded = sha256Canonical({
    fingerprint_contract: FINANCIAL_EVENT_FINGERPRINT_VERSION,
    organization_id: event.organization_id,
    event_type: event.event_type,
    event_id: event.event_id,
    event_version: event.event_version,
    economic_group_id: event.economic_group_id,
    amount: { currency: event.amount.currency, value: normalizedDecimal(event.amount.value) },
    effective_date: event.effective_date,
    source_refs: sourceTuple(event),
    event_specific,
  });
  return Object.freeze({
    contract_version: FINANCIAL_EVENT_FINGERPRINT_VERSION,
    value: encoded.hash,
    canonical_preimage: encoded.canonical_preimage,
  });
}

export interface ValidatedPaidExpensePair {
  readonly pair: PaidExpensePair;
  readonly expense_event_fingerprint: Fingerprint;
  readonly payment_event_fingerprint: Fingerprint;
  readonly effect_fingerprint: Fingerprint;
}

/** Validates the immutable pair and computes the two M2 fingerprint contracts. */
export function validatePaidExpensePair(pair: PaidExpensePair): ValidatedPaidExpensePair {
  // M2 consumes M1 events as immutable external inputs, so re-apply the M1
  // envelope validation at the trust boundary rather than trusting casts.
  createFinancialEvent(pair.expense);
  createFinancialEvent(pair.payment);
  createEventRelationship(pair.fulfills_relationship);
  // M1 types are erased at the transport boundary. Reconstruct Money here so
  // an untyped payload cannot reach the Journal with non-canonical decimals.
  money(pair.expense.amount.value, pair.expense.amount.currency);
  money(pair.payment.amount.value, pair.payment.amount.currency);
  assertPaidExpensePair(pair.expense, pair.payment, [pair.fulfills_relationship]);
  if (pair.expense.status !== "CONFIRMED" || pair.payment.status !== "CONFIRMED") {
    throw new WendyDomainError("REVIEW_REQUIRED", "PAID_EXPENSE v1 requires confirmed ExpenseRecognized and PaymentMade events", { rule_id: "M2-EVT-001" });
  }
  if (pair.expense.approval.status !== "APPROVED" || pair.payment.approval.status !== "APPROVED") {
    throw new WendyDomainError("REVIEW_REQUIRED", "confirmed PAID_EXPENSE events require approved USER_CONFIRM evidence", { rule_id: "M2-EVT-002" });
  }
  const expense_event_fingerprint = financialEventFingerprint(pair.expense);
  const payment_event_fingerprint = financialEventFingerprint(pair.payment);
  if (String(pair.expense.event_fingerprint) !== String(expense_event_fingerprint.value) || String(pair.payment.event_fingerprint) !== String(payment_event_fingerprint.value)) {
    throw new M2ContractError("M2_CONTRACT_VIOLATION", "M2 Financial Event fingerprint must equal the stored M1 event_fingerprint", "EVENT_FINGERPRINT_MISMATCH");
  }
  const encoded = sha256Canonical({
    fingerprint_contract: PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION,
    organization_id: pair.expense.organization_id,
    effect_kind: "PAID_EXPENSE_ORIGINAL",
    accounting_rule: { rule_id: PAID_EXPENSE_RULE_ID, immutable_rule_version: PAID_EXPENSE_RULE_VERSION },
    economic_group_id: pair.expense.economic_group_id,
    expense_event: {
      event_id: pair.expense.event_id,
      event_version: pair.expense.event_version,
      event_fingerprint: expense_event_fingerprint.value,
    },
    payment_event: {
      event_id: pair.payment.event_id,
      event_version: pair.payment.event_version,
      event_fingerprint: payment_event_fingerprint.value,
    },
    relationship: {
      relationship_type: "FULFILLS",
      from: "payment_event",
      to: "expense_event",
    },
  });
  const effect_fingerprint: Fingerprint = Object.freeze({
    contract_version: PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION,
    value: encoded.hash,
    canonical_preimage: encoded.canonical_preimage,
  });
  return Object.freeze({ pair, expense_event_fingerprint, payment_event_fingerprint, effect_fingerprint });
}

export function canonicalRequestInputHash(input: {
  readonly organization_id: string;
  readonly operation: string;
  readonly actor_id: string;
  readonly event_refs: readonly { readonly event_id: string; readonly event_version: number; readonly event_type: string }[];
  readonly relationship_id: string;
  readonly economic_group_id: string;
  readonly approval_decision_id: string;
  readonly period_authorization_id: string;
  readonly tax_decision_id: string;
  readonly accounting_rule_version: string;
  readonly confirmation_audit_ref: string;
  readonly validation_result_ref: string;
}): ContentHash {
  return sha256Canonical({
    organization_id: input.organization_id,
    operation: input.operation,
    actor_id: input.actor_id,
    event_refs: [...input.event_refs].sort((left, right) => left.event_type.localeCompare(right.event_type)),
    relationship_id: input.relationship_id,
    economic_group_id: input.economic_group_id,
    approval_decision_id: input.approval_decision_id,
    period_authorization_id: input.period_authorization_id,
    tax_decision_id: input.tax_decision_id,
    accounting_rule_version: input.accounting_rule_version,
    confirmation_audit_ref: input.confirmation_audit_ref,
    validation_result_ref: input.validation_result_ref,
  }).hash;
}

/** Test/adapter hook for storage collision detection. */
export function assertFingerprintPreimageCompatible(
  existing: Pick<Fingerprint, "value" | "canonical_preimage">,
  incoming: Pick<Fingerprint, "value" | "canonical_preimage">,
): void {
  if (existing.value === incoming.value && existing.canonical_preimage !== incoming.canonical_preimage) {
    throw new M2ContractError("FINGERPRINT_COLLISION", "matching fingerprint hash has a different canonical preimage", "FINGERPRINT_COLLISION");
  }
}

export function asStoredM2EventFingerprint(value: ContentHash) {
  return eventFingerprint(value);
}
