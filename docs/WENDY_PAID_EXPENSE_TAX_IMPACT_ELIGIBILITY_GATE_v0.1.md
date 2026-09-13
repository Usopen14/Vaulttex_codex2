# PAID_EXPENSE Tax Accounting-Impact Eligibility Gate v0.1

**Product:** Vault
**Engine:** Wendy
**Status:** `PRODUCT_OWNER_APPROVED — ACCOUNTING_APPROVED — T-01 COMPLETE`
**Contract version:** `wendy.paid-expense.tax-impact-eligibility/1.0.0`
**Scope:** interim, Accounting-controlled eligibility evidence for the `PAID_EXPENSE / v1` simple accounting path only
**Accounting source:** [`WENDY_PAID_EXPENSE_ACCOUNTING_RULE_v1.md`](WENDY_PAID_EXPENSE_ACCOUNTING_RULE_v1.md), A-01 tax accounting-impact boundary
**Engineering source:** [`WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_v1.md`](WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_v1.md) §7 and §13

## 1. Purpose and authority boundary

This approval-ready interim gate answers one deliberately narrow accounting question: whether an exact `PAID_EXPENSE / v1` Financial Event pair may continue on the simple approved path:

```text
Dr approved Expense account
Cr approved Cash/Bank account
```

It does not determine VAT, WHT, CIT, recoverability, filing, tax position, tax period, or any other full tax semantics. It is not a Tax Engine, does not make the Ledger a tax authority, and does not change the immutable Accounting Rule. A future M7 Tax Engine may replace or manually produce a corresponding authoritative input only through a later approved, versioned contract.

This document records the Product Owner approval in §6 and the authoritative Accounting approval in §7. T-01 completion does not permit implementation or posting by itself.

## 2. Eligibility outcomes

Only these canonical outcomes are valid:

| Outcome | M2 PAID_EXPENSE v1 result |
|---|---|
| `NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED` | The simple PAID_EXPENSE v1 path may proceed to all remaining validation, authorization, Period, balance, idempotency, and Ledger controls. It does not itself authorize posting. |
| `SEPARATE_ACCOUNTING_IMPACT_REQUIRED` | The simple PAID_EXPENSE v1 path must not post. Return/route `REVIEW_REQUIRED` to a future tax-capable or other approved path. |
| `UNRESOLVED` | Return `REVIEW_REQUIRED`; no post. |

`NO_TAX_EFFECT` is not a valid outcome or synonym. The confirmed outcome states only the narrow accounting-impact eligibility for this rule; it makes no assertion of complete tax treatment.

## 3. Decision binding and required record

The following immutable decision record is required before the `NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED` outcome may be consumed by a simple PAID_EXPENSE post:

```yaml
TaxImpactEligibilityDecision:
  contract_version: wendy.paid-expense.tax-impact-eligibility/1.0.0
  tax_impact_eligibility_decision_id: lowercase RFC-4122 UUID
  decision_version: positive integer
  policy_version: WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.1
  organization_id: lowercase RFC-4122 UUID
  economic_group_id: lowercase RFC-4122 UUID
  financial_event_refs:
    - event_id: lowercase RFC-4122 UUID
      event_version: positive integer
      event_type: ExpenseRecognized | PaymentMade
  fulfills_relationship_id: lowercase RFC-4122 UUID
  accounting_rule:
    rule_id: PAID_EXPENSE
    immutable_rule_version: v1
  outcome: >
    NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED |
    SEPARATE_ACCOUNTING_IMPACT_REQUIRED |
    UNRESOLVED
  accounting_reviewer:
    actor: M1 ActorRef, actor_type = USER
    reviewer_authorization_evidence_ref: immutable reference
    accounting_reviewer_capability_ref: immutable reference
  decision_basis:
    reason_code: stable non-empty code string
    rationale: non-empty string
    evidence_reference: immutable reference
    evidence_refs: non-empty list of M1 EvidenceRef
  decided_at: RFC-3339 timestamp with explicit offset
  decision_provenance_hash: lowercase SHA-256 hex
  supersedes_tax_impact_eligibility_decision_id: UUID | null
```

The record is organization-scoped and must bind exactly one canonical `ExpenseRecognized`/`PaymentMade` pair, their exact event versions, the directed `PaymentMade --FULFILLS--> ExpenseRecognized` relationship, their shared `economic_group_id`, and `PAID_EXPENSE / v1`. A field mismatch, missing evidence, non-human reviewer, unauthorized reviewer, changed event version, changed rule version, or cross-organization reference makes the decision unusable and returns `REVIEW_REQUIRED`.

The reviewer’s role/capability assignment is intentionally **not inferred** from a mutable role label. T-01 requires the explicit server-authorized capability `PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_REVIEW`; the Product and Accounting approvals for its organization-scoped reviewer/evidence policy are recorded in §§6–7. The server must verify active organization membership, the approved reviewer capability, organization scope, and decision evidence. The final decision must retain reviewer identity, authorization evidence, evidence basis, timestamp, reason code, evidence reference, decision version, policy version, and contract version.

## 4. Immutability and posting provenance

A decision record is append-only. At the latest, it becomes immutable when a posted Journal consumes it; this contract strengthens that control by prohibiting edits once created. A correction creates a new immutable decision version that references the decision it supersedes. A posted Journal consumes a decision through a separate immutable provenance record, so consuming it never mutates the decision:

```yaml
TaxImpactEligibilityConsumption:
  tax_impact_eligibility_decision_id: UUID
  decision_version: positive integer
  decision_provenance_hash: SHA-256 hex
  organization_id: UUID
  economic_group_id: UUID
  event_refs: exact event id/version pair
  accounting_rule: { rule_id: PAID_EXPENSE, immutable_rule_version: v1 }
  journal_entry_id: UUID
  consumed_at: RFC-3339 timestamp
  posting_transaction_ref: immutable reference
```

The Ledger transaction must retain this consumption record with its Journal provenance. Reversal retains the exact original decision-consumption provenance; a corrected replacement requires a new decision that matches its replacement events and rule/mapping context. No time-based expiry or automatic reclassification is authorized by this interim contract.

## 5. Non-inference and fail-closed rules

No outcome may be inferred solely from merchant/category name, AI output or confidence, user text, absence of a tax document, payment method, account mapping, display metadata, or a missing value. Those facts may be evidence presented to the authorized Accounting reviewer; they are never an automatic outcome.

The posting validator applies this deterministic gate:

```text
decision absent, mismatched, unauthorized, or invalid  → REVIEW_REQUIRED; no post
outcome = UNRESOLVED                                   → REVIEW_REQUIRED; no post
outcome = SEPARATE_ACCOUNTING_IMPACT_REQUIRED          → REVIEW_REQUIRED; no simple post
outcome = NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED      → continue to remaining controls only
```

The final line is not an approval override. Organization authorization, event invariants, mapping resolution, balance, idempotency, Period authorization, Ledger invariants, and every other non-overridable control remain mandatory.

## 6. Product Owner approval record

| Evidence field | Recorded value |
|---|---|
| Decision | `APPROVE` |
| Product Owner | `Dr. Masato` |
| Role | `Product Owner, CEO` |
| Decision date | `13 Sep 2026` |
| Evidence reference | `T-01-M2-v0.1` |
| Policy version | `WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.1` |

The Product Owner approves the three canonical outcomes, their fail-closed routing, the exact pair/rule binding, the explicit `PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_REVIEW` capability requirement, and the stated interim-authority boundary. The complementary Accounting approval is recorded in §7; together the two evidence records complete T-01.

## 7. Accounting approval record

| Evidence field | Recorded value |
|---|---|
| Decision | `APPROVE` |
| Accounting approver | `Dr. Masato` |
| Role | `CEO` |
| Authorized capability | `PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_REVIEW` |
| Decision date | `13 Sep 2026` |
| Reason / modification | `Approved as written` |
| Evidence reference | `T-01-ACC-M2-v1.0` |

The Accounting approval covers the T-01 canonical outcome vocabulary, fail-closed behavior, Accounting reviewer capability policy, evidence standard, immutability, provenance, and the exact `wendy.paid-expense.tax-impact-eligibility/1.0.0` contract wording.

## 8. Acceptance criteria and gate effect

Both Product Owner and Accounting approval evidence are recorded. T-01 is `COMPLETE`: a valid `NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED` decision may continue only through the remaining M2 controls; every other outcome or missing/unauthorized/mismatched/invalid decision remains `REVIEW_REQUIRED` with no post.

T-01 completion does not itself authorize M2 production code, Tax Engine work, or Ledger posting. The separate Product Owner authorization is recorded in `WENDY_M2_IMPLEMENTATION_AUTHORIZATION_v1.md`; it does not turn T-01 into Tax Engine authority or bypass any other M2 control.
