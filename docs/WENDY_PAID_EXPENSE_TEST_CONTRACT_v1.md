# PAID_EXPENSE M2 Test Contract v1

**Status:** `FROZEN_NON_PRODUCTION — M2 READY / AUTHORIZED — REQUIRED BEFORE IMPLEMENTATION ACCEPTANCE`
**Test-contract version:** `wendy.paid-expense.acceptance-tests/1.0.0`
**Parent Engineering contract:** [`WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_v1.md`](WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_v1.md)
**Immutable Accounting input:** `PAID_EXPENSE v1`

This document freezes release-blocking acceptance tests before M2 implementation. Test implementation is deliberately out of scope now. All tests use organization-scoped fixtures and exact decimal Money; no production account IDs, live Ledger, Tax Engine, or external service is permitted.

## 1. Required contract and invariant suite

| ID | Test | Required assertion |
|---|---|---|
| BAL-01 | Balanced direct draft | Exactly-one resolved Expense debit and Cash/Bank credit of the same exact THB amount yields `total_debit == total_credit`. |
| BAL-02 | Unbalanced draft | Any unequal total, missing side, zero line, or line containing both debit and credit is rejected; no post occurs. |
| MAP-01 | Category mapping exactly one | One eligible effective-dated organization Expense mapping is retained in provenance and may build the debit line. |
| MAP-02 | Category mapping fail closed | Zero, multiple, inactive-for-context, ineligible, or cross-organization mappings return `REVIEW_REQUIRED`; no fallback account/Journal. |
| MAP-03 | Payment mapping exactly one | One eligible effective-dated organization Cash/Bank mapping is retained in provenance and may build the credit line. |
| MAP-04 | Payment mapping fail closed | Zero, multiple, ineligible, cross-organization, display-text-only, bank-name-only, or mutable-metadata-only resolution returns `REVIEW_REQUIRED`; no post. |
| ORG-01 | Organization isolation | An event, mapping, account, approval, Period, or result from another organization cannot be used or disclosed as a posting result. |
| EVT-01 | Canonical pair | The pair must be confirmed `ExpenseRecognized` + confirmed `PaymentMade`, one shared group, equal Money, and exactly one `PaymentMade --FULFILLS--> ExpenseRecognized` relationship. |
| EVT-02 | Unsupported semantics | AP, accrual, prepayment, refund, split payment, foreign currency, or other excluded family is rejected/reviewed as applicable and cannot coerce into PAID_EXPENSE v1. |
| TAX-01 | Tax-impact boundary | When authoritative tax accounting impact is required but unavailable, simple Dr Expense / Cr Cash-Bank does not post and routes `REVIEW_REQUIRED`; no Tax calculation is performed. |
| TAX-02 | Confirmed interim eligibility | Only an exact, organization-scoped, evidence-backed `NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED` T-01 decision made by an authorized Accounting reviewer for the event versions/group/rule may pass the tax-impact gate; it still cannot bypass other controls. |
| TAX-03 | Tax-impact decision fail closed | Missing, unauthorized, stale/mismatched, `SEPARATE_ACCOUNTING_IMPACT_REQUIRED`, or `UNRESOLVED` T-01 decisions return `REVIEW_REQUIRED`; a posted Journal retains immutable consumption provenance. |
| AUTH-01 | Unauthorized actor | Unauthenticated, cross-organization, inactive, or server-unauthorized actors cannot submit, approve, request correction, or cause posting. |
| AUTH-02 | USER_CONFIRM boundary | Originator may confirm the exact candidate hash, but that confirmation cannot satisfy elevated accounting approval, Period override, correction approval, or Ledger-write authority. |
| AUTH-03 | Independent elevated approver | Originator cannot approve their own elevated exception/correction when an independent eligible approver exists. Canonical actor id, not display name, is compared. |
| AUTH-04 | Owner Override | Override succeeds only with enabled organization policy, authorized Owner, no independent eligible approver, explicit action, reason, and complete audit metadata; it is not a fourth approval level. |
| AUTH-05 | Owner Override limits | Override cannot bypass organization authorization, invalid amounts/events, tax dependency, missing maps, balance, idempotency conflict, immutable history, Ledger invariant, or LOCKED period. |
| AUTH-06 | Ledger writer authority | Direct human role attempts to write a posted Journal fail; only the Ledger Posting Service identity can perform the atomic write after allowed decisions. |
| PER-01 | OPEN period | `POSTING_ALLOWED` with matching snapshot/version permits the transaction only after all other controls pass. |
| PER-02 | CLOSED period | Original post returns `PERIOD_DENIED` or approved review route, has no Journal, and does not move the date. |
| PER-03 | LOCKED period | Original/reversal/replacement posting is denied; Owner Override cannot unlock it. |
| PER-04 | Period race | A period version/status change after authorization but before commit forces recheck and prevents an invalid post. |
| FP-01 | Event fingerprint determinism | Equivalent canonical source/event inputs produce identical v1 event fingerprints despite source-list order or lexical Money trailing zeros. Excluded presentation/AI fields do not change the value. |
| FP-02 | Effect fingerprint determinism | The named Expense/Payment roles, shared group, `FULFILLS` direction, and PAID_EXPENSE/v1 produce one stable effect fingerprint. Changing an internal relationship id alone does not produce a new effect. |
| FP-03 | Fingerprint conflict/collision | Different canonical preimages cannot silently be treated as the same effect; hash/preimage collision blocks posting and records diagnostics. |
| IDEMP-01 | Same key / same payload | A mutation replay returns the stored canonical result and produces no second mutation. |
| IDEMP-02 | Same key / changed payload | It returns `IDEMPOTENCY_CONFLICT`; no Journal, review decision, or post is duplicated. |
| IDEMP-03 | Duplicate delivery | Re-delivering the same immutable event pair via a different request key returns `DUPLICATE` and one existing Journal reference where authorized. |
| IDEMP-04 | Source collision | Same authoritative source identity with incompatible facts is `REVIEW_REQUIRED`, never a guessed duplicate/post. |
| CON-01 | Concurrent duplicate requests | Simultaneous same-key/same-payload attempts lead to one owner and one canonical result. |
| CON-02 | Concurrent same effect / different keys | Simultaneous attempts for the same effect lead to exactly one committed original Journal effect. |
| CON-03 | Correction race | A correction cannot reverse an in-progress/partial original and only one full reversal link can commit for an original Journal. |
| TX-01 | Atomic success manifest | A successful post atomically records idempotency result, effect identity, final auth/Period refs, Journal/lines, links, rule/mapping provenance, audit, and posting result. |
| TX-02 | Mandatory-write failure rollback | Inject failure at each required write/check; verify no partial posted Journal, line, relationship, effect reservation, success idempotency result, or success audit remains. |
| RETRY-01 | Deterministic failure | `REJECTED`, `REVIEW_REQUIRED`, `PERIOD_DENIED`, and conflict outcomes are not blindly retried as a post. |
| RETRY-02 | Unknown outcome | Lost response/post-commit uncertainty is reconciled by the same idempotency record; retry with the same key yields at most one effect. |
| COR-01 | Exact reversal | Every reversal line references an original line and inverts its exact amount/side; it does not use current mapping/account/rule resolution. |
| COR-02 | Corrected replacement traceability | Compound correction writes original, reversal, replacement, case, event relationships, audit, two Period decisions, and original/replacement rule/mapping provenance traceably. |
| COR-03 | Correction atomicity | Failure to create the replacement causes the reversal/correction transaction to roll back; arbitrary delta adjustment and mutable edit are unavailable. |
| IMM-01 | Immutable posted history | Attempted update/delete of posted Journal, line, map/rule provenance, or audit facts is rejected; correction uses the chain only. |

## 2. Required test layers

| Layer | Minimum coverage |
|---|---|
| Unit | Canonical decimal normalization, canonical JSON/preimage construction, input validation, mapping/effect invariants, SOD and Owner Override predicates, balance arithmetic, exact reversal transformation. |
| Contract | Every DTO in the schema companion; EngineRequest/error envelope; Period decision outcomes; mapping resolution responses; PostingResult outcomes; no unknown fields/enum drift. |
| Integration | Transaction manifest/rollback, unique constraints, authorized Ledger service boundary, account/mapping effective-date context, immutable history. |
| Concurrency | Concurrent request/effect/correction/Period-status races under the chosen database isolation and unique constraints. |
| Invariant/property | Debit-credit conservation, no cross-org link, no second effect per fingerprint, no second reversal per original, exact reversal symmetry, deterministic fingerprints independent of field/map ordering. |

## 3. Acceptance gate

M2 implementation cannot be accepted unless all applicable tests pass, the tax-impact eligibility dependency in the parent contract is approved and resolved fail-closed, type checks pass, no known ledger invariant is waived, and a reviewed diff shows no scope expansion beyond PAID_EXPENSE v1. A green test suite alone never authorizes M2 implementation or Ledger posting.

## 4. Formal Engineering acceptance record

**Acceptance status:** `ACCEPTED`

| Evidence field | Recorded value |
|---|---|
| Engineering owner | `Dr. Masato` |
| Role | `Engineering Owner, CEO` |
| Decision | `ACCEPT` |
| Decision date | `13 Sep 2026` |
| Evidence reference | `M2 1.0.0` |
| Accepted contract version | `wendy.paid-expense.engineering-contract/1.0.0` |
| Accepted DTO bundle version | `wendy.paid-expense.dto/1.0.0` |
| Accepted test-contract version | `wendy.paid-expense.acceptance-tests/1.0.0` |
| Accounting source reviewed | `PAID_EXPENSE / immutable rule v1` |
| T-01 acknowledgement | Reviewed as an external M2 readiness dependency. This acceptance does not approve T-01 and does not replace the required Product + Accounting approval for T-01. |

Formal acceptance must explicitly cover all release-blocking tests, including T-01 behavior, fingerprint/idempotency/exactly-once effect, authorization/SOD, Period handling, serializable atomicity, concurrency, retry/rollback, and exact correction/reversal. Codex must not be recorded as the owner or approver.
