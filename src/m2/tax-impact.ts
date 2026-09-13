import { requireNonEmpty, requirePositiveInteger } from "../domain/common/errors.ts";
import type { ContentHash } from "../domain/common/ids.ts";

import { sha256Canonical } from "./canonical.ts";
import { PAID_EXPENSE_RULE_ID, PAID_EXPENSE_RULE_VERSION, TAX_IMPACT_ELIGIBILITY_VERSION, type CapabilityGrant, type PaidExpensePair, type TaxImpactEligibilityDecision } from "./contracts.ts";

export const TAX_IMPACT_ELIGIBILITY_REVIEW_CAPABILITY = "PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_REVIEW" as const;

function decisionPayload(decision: TaxImpactEligibilityDecision): Record<string, unknown> {
  return {
    contract_version: decision.contract_version,
    tax_impact_eligibility_decision_id: decision.tax_impact_eligibility_decision_id,
    decision_version: decision.decision_version,
    policy_version: decision.policy_version,
    organization_id: decision.organization_id,
    economic_group_id: decision.economic_group_id,
    financial_event_refs: decision.financial_event_refs,
    fulfills_relationship_id: decision.fulfills_relationship_id,
    accounting_rule: decision.accounting_rule,
    outcome: decision.outcome,
    accounting_reviewer: decision.accounting_reviewer,
    decision_basis: decision.decision_basis,
    decided_at: decision.decided_at,
    supersedes_tax_impact_eligibility_decision_id: decision.supersedes_tax_impact_eligibility_decision_id,
  };
}

export function taxImpactEligibilityDecisionHash(decision: TaxImpactEligibilityDecision): ContentHash {
  return sha256Canonical(decisionPayload(decision) as never).hash;
}

export interface TaxImpactValidation {
  readonly allowed: boolean;
  readonly reason_codes: readonly string[];
}

/** Consumes an explicit Accounting decision; it neither calculates nor infers tax. */
export function validateTaxImpactEligibility(
  decision: TaxImpactEligibilityDecision | null | undefined,
  pair: PaidExpensePair,
  capability_grants: readonly CapabilityGrant[],
): TaxImpactValidation {
  if (decision === null || decision === undefined) return Object.freeze({ allowed: false, reason_codes: Object.freeze(["TAX_IMPACT_DECISION_MISSING"]) });
  if (decision.contract_version !== TAX_IMPACT_ELIGIBILITY_VERSION || decision.policy_version !== "WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.1" || decision.accounting_rule.rule_id !== PAID_EXPENSE_RULE_ID || decision.accounting_rule.immutable_rule_version !== PAID_EXPENSE_RULE_VERSION) {
    return Object.freeze({ allowed: false, reason_codes: Object.freeze(["TAX_IMPACT_DECISION_RULE_OR_VERSION_MISMATCH"]) });
  }
  try {
    requirePositiveInteger(decision.decision_version, "decision_version");
    requireNonEmpty(decision.decision_basis.reason_code, "decision_basis.reason_code");
    requireNonEmpty(decision.decision_basis.rationale, "decision_basis.rationale");
    requireNonEmpty(decision.decision_basis.evidence_reference, "decision_basis.evidence_reference");
    if (decision.decision_basis.evidence_refs.length === 0) throw new Error("evidence missing");
  } catch {
    return Object.freeze({ allowed: false, reason_codes: Object.freeze(["TAX_IMPACT_DECISION_EVIDENCE_INVALID"]) });
  }
  const expected = [
    { event_id: pair.expense.event_id, event_version: pair.expense.event_version, event_type: "ExpenseRecognized" },
    { event_id: pair.payment.event_id, event_version: pair.payment.event_version, event_type: "PaymentMade" },
  ];
  const observed = [...decision.financial_event_refs].sort((left, right) => left.event_type.localeCompare(right.event_type));
  const expectedSorted = [...expected].sort((left, right) => left.event_type.localeCompare(right.event_type));
  const exactEvents = observed.length === 2 && observed.every((event, index) => event.event_id === expectedSorted[index]?.event_id && event.event_version === expectedSorted[index]?.event_version && event.event_type === expectedSorted[index]?.event_type);
  if (!exactEvents || decision.organization_id !== pair.expense.organization_id || decision.economic_group_id !== pair.expense.economic_group_id || decision.fulfills_relationship_id !== pair.fulfills_relationship.relationship_id) {
    return Object.freeze({ allowed: false, reason_codes: Object.freeze(["TAX_IMPACT_DECISION_BINDING_MISMATCH"]) });
  }
  if (decision.accounting_reviewer.actor.actor_type !== "USER") return Object.freeze({ allowed: false, reason_codes: Object.freeze(["TAX_IMPACT_REVIEWER_NOT_HUMAN"]) });
  const reviewer = capability_grants.find((grant) => grant.organization_id === pair.expense.organization_id && grant.actor_id === decision.accounting_reviewer.actor.actor_id && grant.membership_status === "ACTIVE" && grant.capabilities.includes(TAX_IMPACT_ELIGIBILITY_REVIEW_CAPABILITY));
  if (reviewer === undefined || decision.accounting_reviewer.reviewer_authorization_evidence_ref.trim().length === 0 || decision.accounting_reviewer.accounting_reviewer_capability_ref.trim().length === 0) {
    return Object.freeze({ allowed: false, reason_codes: Object.freeze(["TAX_IMPACT_REVIEWER_UNAUTHORIZED"]) });
  }
  if (taxImpactEligibilityDecisionHash(decision) !== decision.decision_provenance_hash) {
    return Object.freeze({ allowed: false, reason_codes: Object.freeze(["TAX_IMPACT_PROVENANCE_HASH_MISMATCH"]) });
  }
  if (decision.outcome !== "NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED") {
    return Object.freeze({ allowed: false, reason_codes: Object.freeze([`TAX_IMPACT_${decision.outcome}`]) });
  }
  return Object.freeze({ allowed: true, reason_codes: Object.freeze(["TAX_IMPACT_ELIGIBILITY_CONFIRMED"]) });
}
