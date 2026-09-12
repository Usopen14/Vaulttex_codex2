# PAID_EXPENSE Posting Rule Contract v0.1 — M2 Entry Review Draft

**Product:** Vault
**Engine:** Wendy
**Rule ID:** `PAID_EXPENSE`
**Draft rule version:** `0.1.0-draft`
**Status:** `DRAFT/PENDING` — Product Owner M2-entry decisions approved; Accounting and Engineering decisions remain pending
**Review owners:** Product Owner and Accounting
**Product Owner approver:** Product Owner
**Accounting approver:** `PENDING/TBD`
**Product Owner decision date:** 2026-09-11
**Product Owner SOD clarification date:** 2026-09-13
**Product Owner Policy decision-register approval date:** 2026-09-13
**Accounting decision date:** `PENDING/TBD`
**M2 authorization gate:** `NOT READY`

## 1. Purpose, authority, and review rule

M1 is formally closed and accepted. This document prepares only the formal M2 entry review for the future `PAID_EXPENSE` posting rule. It does not alter M1 behavior and does not implement accounting, period, or Ledger code.

`ExpenseRecognized` and `PaymentMade` remain two distinct Financial Events. In the supported first slice their canonical relationship is:

```text
PaymentMade --FULFILLS--> ExpenseRecognized
```

No unresolved item below becomes policy merely by appearing in this draft. Until the required approvals are recorded, the rule MUST NOT construct a journal, select an account, obtain posting permission, or write to the Ledger.

**Product Owner approval evidence:** Product Owner PAID_EXPENSE M2-entry decision supplied in this Codex task on 2026-09-11. This approves only the Product Owner decisions in §2; it does not approve Accounting decisions, Engineering contracts, an immutable rule version, or M2 implementation.

**Product Owner Policy evidence:** Product Owner decision supplied in this Codex task on 2026-09-13. It approves P-01 through P-06: capability/SOD, independent approver, review boundary, period escalation, and Period authorization policy. It does not approve Accounting semantics or an Engineering Freeze.

Decision labels:

- `DECIDED_M1`: already constrained by approved M1 contracts or Product Owner decisions.
- `REQUIRES_FORMAL_DECISION`: must be approved for this rule before M2 is authorized.
- `OUT_OF_SCOPE`: intentionally not part of the PAID_EXPENSE M2 entry review.

## 2. Product Owner decisions

| Topic | Current draft position | State | Formal decision required |
|---|---|---|---|
| Supported event combination | Exactly one confirmed, validated immediate paid-expense pair: `ExpenseRecognized` plus `PaymentMade --FULFILLS--> ExpenseRecognized`; same organization, `economic_group_id`, THB decimal value, first-slice dates, and an approved Cash/Bank source. Split/partial payments, tips, fees, refunds, reimbursements, prepayments, accruals, card clearing/settlement, mixed currency, and unsupported tax treatment are excluded. | `DECIDED_M1` + `APPROVED_FOR_M2_ENTRY` | No new combination may be included without a versioned Product Owner decision. |
| Required inputs | The linked events, relationship, source/evidence references, approval state, event/schema/rule-context versions, organization identity, AccountingProfile, selected COA version, and a separate Period Engine authorization reference are required to evaluate or post. | `APPROVED_FOR_M2_ENTRY` | Engineering must freeze the exact M2 request DTO and the required profile/COA version selectors. |
| Approval / review behavior | `USER_CONFIRM` confirms intended source/business facts only. It does not approve accounting treatment, tax treatment, a period override, or Ledger posting. A service cannot satisfy that human confirmation. | `APPROVED_FOR_M2_ENTRY` | Accounting/Engineering must define authorized posting/review capabilities and any approval-control mode. |
| Fallback behavior | Any material ambiguity in amount, organization, event semantics, account resolution, posting date/period, approval authority, or balancing prevents posting. Unknown/inactive/ambiguous mappings MUST fail closed or require review. No silent Suspense, Miscellaneous Expense, guessed account, or guessed accounting treatment is allowed. | `APPROVED_FOR_M2_ENTRY` | Engineering must freeze the error/review transport contract; Accounting must approve mapping remediation. |
| User-visible outcome | The canonical domain outcomes are `POSTED`, `REVIEW_REQUIRED`, `REJECTED`, `DUPLICATE`, and `PERIOD_DENIED`. UI wording may vary, but the outcomes remain distinguishable. | `APPROVED_FOR_M2_ENTRY` | Engineering must freeze the result DTO, permitted existing-result reference for duplicates, and presentation/API mapping. |

### 2.1 Approved exception routing and outcome meaning

| Outcome | Product Owner-approved meaning | Posting effect |
|---|---|---|
| `POSTED` | The expense/payment was successfully posted exactly once. | One canonical accounting/Ledger effect. |
| `REVIEW_REQUIRED` | Financial meaning is plausible but incomplete or ambiguous: category cannot be resolved deterministically; payment source is known but its account mapping is unresolved; required evidence/confirmation is missing; an accounting/tax dependency needs human review; or period policy requests escalation rather than hard rejection. | No post. |
| `REJECTED` | The request is hard-invalid, unauthorized, unsupported, or violates a hard invariant: invalid schema/amount, unauthorized organization/actor, unsupported posting currency, impossible/prohibited state transition, or source/event hard-invariant violation. | No post. |
| `DUPLICATE` | The request/event was already processed. It is an idempotent replay, not a request for a second post. Return/reference the existing canonical result where permitted. | No new accounting or Ledger effect. |
| `PERIOD_DENIED` | Posting was not allowed for the requested accounting period. It is distinct from `REJECTED`; later Period/approval policy may allow a controlled adjustment/reopen route. | No post before Period Engine authorizes. |

Product Owner review is complete for the M2-entry scope, routing semantics, fail-closed rule, and canonical outcomes. An unposted event MUST NOT be presented as a Ledger posting.

### 2.2 Approved self-approval and period constraints

- `USER_CONFIRM` may be performed by the originating user because it confirms source/business facts only; it is not accounting, tax, period-override, correction/reversal, or Ledger-posting approval.
- For elevated `ACCOUNTANT_OR_ADMIN_APPROVAL`, originator self-approval is prohibited by default when an eligible independent Owner/Admin/Accountant approver exists.
- `OWNER_OVERRIDE` is an exceptional control mechanism/audit metadata under `ACCOUNTANT_OR_ADMIN_APPROVAL`, never a fourth `approval_level`. It requires explicit organization-policy enablement, authorized Owner role, no independent eligible approver, explicit action/reason, and full audit evidence.
- Owner Override never bypasses authorization failure, invalid/unbalanced journals, unsupported currency, missing required mappings, Ledger invariants, idempotency conflict, immutable posted history, LOCKED period, or any non-overridable control.
- OPEN may post only after all required controls pass. CLOSED normal posting is denied without automatic date shifting. LOCKED posting is denied; Owner Override never unlocks it and M2 has no automatic reopen.
- The Ledger Posting Service remains the only system authority that may create a posted Ledger record.
- Authorized `OWNER`, `ADMIN`, `ACCOUNTANT`, and permitted `MEMBER`/`USER` may submit; originating authorized users may `USER_CONFIRM`; elevated approval is restricted to authorized Owner/Admin/Accountant subject to capability and SOD checks.
- The future Period authorization boundary uses `POSTING_ALLOWED`, `PERIOD_DENIED`, or `REVIEW_REQUIRED`; only `POSTING_ALLOWED` is posting eligibility. Period Engine never posts Ledger.

P-01 through P-06 are Product Owner-approved for the M2 policy boundary. Exact DTO/schema, capability storage, service enforcement, and all Ledger mechanics remain Engineering Freeze work. Accounting decisions remain pending.

## 3. Accounting decisions requiring explicit approval

Accounting owns final GL mapping, debit/credit semantics, balancing, and correction behavior. None of these rows authorizes an implementation until Accounting approval is recorded.

| Topic | Constraint already known | State | Exact formal decision required |
|---|---|---|---|
| Debit / credit semantics | A PAID_EXPENSE rule must produce a balanced accounting result only through the future Accounting Engine. M1 intentionally defines no lines, sides, or amounts. | `REQUIRES_FORMAL_DECISION` | Approve the debit/credit treatment for the supported combination and the permitted construction rules. |
| Category-to-account resolution | `expense_category` is not an `account_id`. The minimum COA provides system semantics, but does not itself create a final organization mapping. | `REQUIRES_FORMAL_DECISION` | Approve a versioned, organization-scoped mapping basis for each supported category, active/postable eligibility, ambiguity handling, and mapping-change history. Do not hard-code organization-specific account IDs in the rule. |
| Payment-source-to-account resolution | `payment_source_ref` is not a GL account ID. Bank accounts may be organization CUSTOM accounts under the seed header; no fictional bank account exists in the seed. | `REQUIRES_FORMAL_DECISION` | Approve a versioned one-to-one organization payment-source mapping, active/postable eligibility, cash-on-hand handling, ambiguity handling, and historical reproducibility. |
| Posting-date semantics | The first event schema has explicit `effective_date`, `accounting_date`, and `payment_date`; immediate paid expense currently requires them to match. Event confirmation is not period authorization. | `REQUIRES_FORMAL_DECISION` | Approve which accounting date is proposed for posting, organization-timezone treatment, late-event handling, and the relationship to an authorized accounting period. |
| Balancing and correction behavior | A confirmed FinancialEvent is immutable; event corrections are linked reversal/adjustment/supersession facts. M1 has no journal or ledger mutation behavior. | `REQUIRES_FORMAL_DECISION` | Approve balancing validation, a journal-level correction/reversal approach, permitted correction triggers, historical reconstruction, and whether a failed post has any accounting effect. |
| Tax treatment | Tax observations are `OBSERVATION_ONLY`; the first slice does not create authoritative VAT/WHT/CIT treatment or tax-account effects. | `OUT_OF_SCOPE` | Keep out of this rule unless a separately approved Tax Engine capability changes the scope. |

### 3.1 Accounting approval agenda

Accounting must explicitly approve or reject each question below; this draft supplies no answer.

1. **Debit/credit treatment:** What are the permitted debit and credit semantics for the sole supported event pair, and what account eligibility must be checked before construction?
2. **Category resolution:** What versioned organization-scoped mapping resolves each supported `expense_category`, how is a mapping made effective-dated, and how does remediation preserve the Product Owner routing boundary: plausible unresolved category → `REVIEW_REQUIRED`; hard-invalid request → `REJECTED`?
3. **Payment-source resolution:** What versioned mapping resolves a `payment_source_ref` to exactly one active postable Cash/Bank account, including Cash on Hand and organization CUSTOM bank accounts?
4. **Posting date:** Which explicit event date is proposed to the Period Engine, how is the organization timezone applied, and what happens for late events or a period denial/escalation?
5. **Balancing and correction:** What balanced-result invariant applies, and how are journal-level correction/reversal records linked to immutable event correction relationships without rewriting history?

## 4. Engineering contracts

Engineering must implement only the contract that Product Owner and Accounting approve. These are required contract decisions, not implementation proposals.

| Topic | Constraint already known | State | Exact formal decision required |
|---|---|---|---|
| Idempotency scope | M1 event/confirmation idempotency does not automatically define Ledger-posting idempotency. Same key with changed input must conflict within its approved operation scope. | `REQUIRES_FORMAL_DECISION` | Define operation identity, organization scope, key lifetime, input/result hashes, retry response, and conflict/error behavior for posting. |
| Event fingerprint canonicalization | M1 has an `event_fingerprint` field but deliberately defers its exact canonicalization algorithm. | `REQUIRES_FORMAL_DECISION` | Freeze versioned canonical inputs, field order/normalization, hash algorithm/encoding, collision response, and relation to duplicate detection. |
| Authorization / separation of duties | Domain roles are organization-scoped labels, not authorization. `USER_CONFIRM` is not a posting authorization. | `REQUIRES_FORMAL_DECISION` | Define server-enforced capabilities, role/actor requirements, amount or risk thresholds if any, separation-of-duties rules, service identity constraints, and audit evidence. |
| Period Engine authorization | The Period Engine alone grants/denies posting permission. An AccountingPeriod status is not itself authorization. | `REQUIRES_FORMAL_DECISION` | Define the request/response contract, target date/period inputs, authorization reference, expiry/version behavior, and denial handling. |
| Atomic/idempotent Ledger posting | The future Ledger Posting Service owns an atomic post and provenance boundary; M1 contains no Ledger write. | `REQUIRES_FORMAL_DECISION` | Define transaction boundary, journal/result identity, exactly-once retry semantics, storage/provenance/audit writes, failure rollback, concurrency behavior, and response contract. |

### 4.1 M2 approval freeze register

The following is the complete pre-implementation freeze register for the approved PAID_EXPENSE vertical slice. Product Owner policy inputs for rows 8–9 are approved, but no Engineering contract is frozen and no row authorizes code until its listed owner completes the required work.

Supporting approval packs:

- `WENDY_PAID_EXPENSE_ACCOUNTING_APPROVAL_PACK_v0.1.md` — Accounting decisions 1–5.
- `WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md` — authorization, segregation, Period, and escalation policy inputs.
- `WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_FREEZE_DRAFT_v0.1.md` — Engineering decisions 6–10 after Accounting/Policy inputs are approved.
- `WENDY_M2_DECISION_REGISTER_v0.1.md` — decision-ready proposals, alternatives, approvers, and Engineering dependencies; it does not approve or freeze any decision.

| # | Decision to freeze | Approval owner | State |
|---|---|---|---|
| 1 | Debit / credit semantics | Accounting | `PENDING/TBD` |
| 2 | Category-to-account resolution | Accounting | `PENDING/TBD` |
| 3 | Payment-source-to-account resolution | Accounting | `PENDING/TBD` |
| 4 | Posting-date semantics | Accounting | `PENDING/TBD` |
| 5 | Correction / reversal behavior | Accounting | `PENDING/TBD` |
| 6 | Posting idempotency scope | Engineering | `PENDING/TBD` |
| 7 | Event fingerprint canonicalization | Engineering | `PENDING/TBD` |
| 8 | Authorization / segregation-of-duties policy | Engineering, using approved Product policy and pending Accounting semantics | `PRODUCT_POLICY_APPROVED; ENGINEERING_FREEZE_PENDING` |
| 9 | Period Engine posting-authorization contract | Engineering, using approved Product policy and pending A-04 accounting-date semantics | `PRODUCT_POLICY_APPROVED; ENGINEERING_FREEZE_PENDING` |
| 10 | Atomic/idempotent Ledger-posting contract | Engineering | `PENDING/TBD` |

Unknown or unresolved mappings are `REVIEW_REQUIRED` or otherwise fail closed according to the Product Owner-approved routing semantics; they never select Suspense, Miscellaneous Expense, or a guessed account/tax treatment.

## 5. Required review evidence and acceptance criteria

Before the status can change from `DRAFT/PENDING`, the reviewers must record an approval or rejection for every `REQUIRES_FORMAL_DECISION` row above. A complete approval package must include:

1. Recorded Product Owner approval evidence for the M2-entry scope, routing semantics, fail-closed behavior, canonical outcomes, and P-01 through P-06 policy boundary.
2. Accounting decision for debit/credit semantics, versioned category and payment-source mappings, posting-date meaning, balancing, and correction behavior.
3. Engineering contract decision for idempotency, fingerprint canonicalization, authorization/SOD, Period Engine authorization, and atomic Ledger behavior.
4. Named Accounting approver, decision date, approved immutable rule version, and immutable approval evidence reference.
5. Approved contract tests that prove: unsupported combinations stop; unresolved mappings fail closed or route to approved review; no silent suspense route; no tax determination; no post without authorization; retry cannot duplicate a Ledger effect; and correction preserves prior history.

## 6. Exact unresolved decisions blocking `M2 READY / AUTHORIZED`

M2 MUST NOT be marked `READY / AUTHORIZED` until all items below have an approved decision and evidence.

1. **Accounting rule semantics:** debit/credit treatment; category-to-account mapping policy; payment-source-to-account mapping policy; posting-date semantics; balancing and journal correction/reversal policy.
2. **Engineering execution contract:** posting idempotency scope; exact fingerprint canonicalization; server enforcement of the approved authorization/SOD policy; Period Engine DTO/semantics consistent with P-06; atomic/idempotent Ledger posting and rollback/provenance guarantees.
3. **Accounting approval evidence:** named Accounting approver, approval date, immutable evidence reference, and an approved immutable rule version that incorporates the Product Owner-approved M2-entry semantics.
4. **Approved acceptance tests:** the agreed contract/invariant suite for the Accounting and Engineering decisions, including the Product Owner-approved fail-closed and routing behavior.

## 7. Explicit exclusions

- No M2 code, `JournalDraft`, debit/credit construction, account mapping data, Period Engine integration, or Ledger posting implementation is contained in this draft.
- No hard-coded organization-specific account IDs or fictional bank accounts.
- No silent suspense fallback.
- No authoritative VAT, WHT, CIT, TaxPosition, TaxFilingSnapshot, filing, amendment, acknowledgement, or Tax Filing workflow. Tax Filing workflow remains deferred to M7.
- No LINE or AI integration, reconciliation, or Financial State behavior.
