# PAID_EXPENSE Posting Rule Contract v0.1 — Draft for Review

**Product:** Vault
**Engine:** Wendy
**Rule ID:** `PAID_EXPENSE`
**Draft rule version:** `0.1.0-draft`
**Status:** `PENDING/TBD` — not approved, not executable, and not normative for posting
**Review owners:** Product Owner and Accounting
**Owner:** `PENDING/TBD`
**Approver:** `PENDING/TBD`
**Decision date:** `PENDING/TBD`

## 1. Purpose and boundary

This is a review draft for the future M2 Accounting Engine. It does not implement a posting rule and it does not authorize a journal, debit/credit construction, account selection, period authorization, or Ledger posting.

Its only M1 role is to make the future approval target explicit. Until the review metadata above is completed with real approval evidence, M2 cannot consume this draft as an approved rule.

## 2. Proposed contract frame (not executable)

| §24.1 attribute | Draft proposal | Review state |
|---|---|---|
| Input | One confirmed, validated paid-expense pair: `ExpenseRecognized` plus `PaymentMade --FULFILLS--> ExpenseRecognized`; frozen organization accounting profile, COA version, and approved rule context. | `PENDING/TBD` |
| Validation | Confirmed statuses, same organization/economic group/money/dates, exactly one relationship, active compatible account mappings, and explicit M2 Period Engine authorization. | `PENDING/TBD` |
| Authority | Accounting Engine owns final account mapping and balanced construction; Period Engine owns authorization; Ledger Posting Service owns atomic posting. | `PENDING/TBD` |
| Output | A future M2 Accounting Engine-owned accounting result. This M1 draft deliberately defines no `JournalDraft` schema, lines, debit/credit values, or posting call. | `PENDING/TBD` |
| Errors | Use the Wendy error envelope; unresolved mapping and missing authority must be rejected or reviewed, never silently routed to suspense. | `PENDING/TBD` |
| Versioning | Immutable `rule_id`, `rule_version`, COA version, organization policy version, and upstream event schema/rule-context versions must be persisted by the M2 implementation. | `PENDING/TBD` |
| Idempotency | M2 must supply an immutable operation/idempotency contract before execution; it must not reuse the M1 event idempotency key without an approved scope rule. | `PENDING/TBD` |
| Traceability | Future output must retain both event IDs, relationship ID, sources/evidence, rule versions, actor, request/trace IDs, and authorization reference. | `PENDING/TBD` |

## 3. Preconditions proposed for accounting review

1. The two events are distinct, confirmed, validated, and linked by exactly one `FULFILLS` relation in the canonical direction.
2. Both events share organization, `economic_group_id`, THB amount, and the immediate-paid-expense date constraint from the first-event schema.
3. The organization has the locked minimum COA seed. The future mapping must resolve a final active postable expense account and an active postable cash/bank account; it must not infer a fictional bank account.
4. Tax observations remain `OBSERVATION_ONLY`; no VAT, WHT, or CIT effect is implied by this rule draft.
5. The later M2 service obtains a separate explicit Period Engine authorization. Confirmation of the events is not posting authorization.

## 4. Decisions intentionally left blank

- The category-to-account mapping table and any fallback behavior.
- The specific payment-source-to-account mapping policy.
- Any debit/credit construction, balancing convention, journal identifiers, or Ledger API behavior.
- Treatment of split payments, fees, discounts, reimbursements, prepayments, accruals, refunds, foreign currency, and tax effects.
- Authorization thresholds, separation of duties, and approval-control modes.
- Exact M2 fingerprint/idempotency canonicalization.

## 5. Review examples and candidate acceptance tests

| Example | Expected review outcome (not implemented) |
|---|---|
| Confirmed matching `MARKETING` expense + completed bank payment + active approved mappings + period authorization | Eligible for an M2 rule evaluation only after formal rule approval. |
| Payment source has no one-to-one active postable mapping | Reject or route to review; no silent suspense account. |
| Tax observation mentions VAT or WHT | Preserve as observation only; no tax treatment or tax-account effect. |
| Pair has differing amount, organization, date, or lacks the one `FULFILLS` link | Reject before any M2 accounting construction. |

Future acceptance tests must be approved alongside the final rule and must demonstrate each §24.1 attribute, frozen version provenance, idempotency behavior, explicit period authorization, and no unauthorized tax treatment.
