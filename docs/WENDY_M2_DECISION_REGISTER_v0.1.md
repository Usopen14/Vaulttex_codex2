# Wendy M2 Decision Register v0.1 — PAID_EXPENSE Entry Gate

**Product:** Vault
**Engine:** Wendy
**Status:** `DECISION_READY — M2 NOT READY / NOT AUTHORIZED`
**Scope:** Approved THB Cash/Bank paid-expense vertical slice only
**Product Owner / Policy approval date:** 2026-09-13 for P-01 through P-06
**Accounting approval date:** 13 Sep 2026 for A-01 through A-05
**Accounting Rule:** `PAID_EXPENSE v1` — source SHA-256 `6ba878997420328f91bc0de32d72529c99ca93f5b5da6413fbb43f5473dd9967`

## 1. How to use this register

This is a decision register, not M2 code or a frozen Engineering contract. A-01 through A-05 are finalized by the immutable Accounting Rule `PAID_EXPENSE v1`; P-01 through P-06 record the Product Owner-approved M2 policy boundary. Their future DTO, storage, and service details still require Engineering Freeze.

The register preserves these existing constraints:

- `ExpenseRecognized`, `PaymentMade`, and Journal representation are distinct concepts.
- `PaymentMade --FULFILLS--> ExpenseRecognized` is the sole first-slice pair relationship.
- Exact decimal THB Money, source/evidence provenance, and M1 event invariants remain mandatory.
- Unknown mapping fails closed or is `REVIEW_REQUIRED`; no silent Suspense, Miscellaneous Expense, guessed account, or guessed tax treatment.
- `USER_CONFIRM` confirms source/business facts only. It is not accounting, tax, Period-override, correction/reversal, or Ledger-posting approval.
- `OWNER_OVERRIDE` is a control mechanism under `ACCOUNTANT_OR_ADMIN_APPROVAL`, not a fourth `approval_level`.
- Ledger Posting Service alone may create posted Ledger records.

## 2. Single M2 decision register

| Decision ID | Decision area | Baseline (recommendation for Accounting, approved policy for P rows) | Viable alternatives / material tradeoff | Required approver | Status | Dependent Engineering contract |
|---|---|---|---|---|---|---|
| A-01 | Debit / credit semantics | Same-settlement PAID_EXPENSE only: debit the approved organization Expense account and credit the approved organization Cash/Bank account for the same exact amount. Events remain distinct; the Journal is their combined accounting representation, not a replacement event. The simple rule excludes unavailable authoritative tax impact. | Separate recognition/payment journals introduces payable, clearing, or settlement semantics; this expands beyond the direct paid-expense slice. A combined journal without independent event lineage loses traceability. | Accounting | `APPROVE` | Accounting-rule DTO; JournalDraft construction; balance invariant; atomic posting manifest. |
| A-02 | Category-to-account mapping | `semantic expense category → effective-dated, versioned organization-scoped mapping → exactly one debit-side-eligible organization Expense account`; retain mapping version; zero/multiple/inactive mappings return `REVIEW_REQUIRED`; no Miscellaneous/Suspense/guessed fallback. | Fixed system-category mapping reduces setup but cannot represent organization charts. Per-event manual account choice is flexible but weakens determinism and auditability. | Accounting | `APPROVE` | Mapping lookup; validation disposition; rule/version provenance; historical reconstruction. |
| A-03 | Payment-source-to-account mapping | `approved payment-source identity → effective-dated, versioned organization-scoped mapping → exactly one credit-side-eligible organization Cash/Bank asset account`; same organization; retain mapping version; display text is not authoritative; zero/multiple/ineligible source is `REVIEW_REQUIRED`. | Putting a GL account ID directly in PaymentMade couples event capture to accounting master data. Inferring a bank account from text or source label risks wrong cash posting. | Accounting | `APPROVE` | Payment-source validation; account eligibility; mapping version provenance; historical reconstruction. |
| A-04 | Posting-date semantics | `accounting_date` derives from approved expense-recognition/effective date under organization AccountingProfile timezone. Payment/source/received/created dates do not redefine it. OPEN normal controls; CLOSED `PERIOD_DENIED`/review; LOCKED denial; no date shift. | Use payment date or source date as posting date; each changes accounting cut-off meaning. Automatically shift to the next OPEN date hides the original accounting fact and is prohibited. | Accounting, with Period authority input | `APPROVE` | Period authorization request; date validation; outcome routing; audit/provenance. |
| A-05 | Balancing and correction / reversal | Exact decimal `total debit = total credit`; no unbalanced JournalDraft post; immutable history; correction is original Journal → full reversal of exact original lines/amounts → corrected replacement event/Journal with audit lineage and Period authorization; arbitrary delta adjustment is out of M2. | Delta adjustments can reduce entries but make original economic intent and reconstruction harder. Mutable edits break auditability. | Accounting | `APPROVE` | Journal invariants; correction/reversal relationship; immutable history; atomic write set. |
| P-01 | Server capability matrix | Server evaluates organization-scoped capability; role label alone is insufficient. Authorized `OWNER`, `ADMIN`, `ACCOUNTANT`, and permitted `MEMBER`/`USER` may submit; the originating authorized user may `USER_CONFIRM`; server-authorized `OWNER`/`ADMIN`/`ACCOUNTANT` may provide elevated approval subject to SOD; Owner Override is Owner-only and conditional; only Ledger Posting Service writes posted Ledger records. | Broadly granting Owner/Admin all actions was rejected in favor of server authorization and SOD. Client-supplied roles remain non-authoritative. | Product Owner / Policy authority | `APPROVED_PRODUCT_POLICY_M2` | Authorization decision contract; service identity enforcement; audit fields; authorization tests. |
| P-02 | Independent approver resolution | Eligible independent approver is in the same organization, has active authorized membership and `OWNER`/`ADMIN`/`ACCOUNTANT` approval capability, differs from the originator by canonical actor identity, and is not otherwise excluded by SOD. Any currently eligible approver may review under queue-assignment policy; with none, do not downgrade and allow Owner Override only when explicitly permitted. | Auto-approval or a display-name comparison was rejected because it obscures authority and is mutable. | Product Owner / Policy authority | `APPROVED_PRODUCT_POLICY_M2` | Eligible-approver lookup; self-approval detection; authorization decision audit; Owner Override validation. |
| P-03 | SOD overlap rules | Originator may submit and `USER_CONFIRM`. Originator may not approve their own elevated exception or correction to a previously posted effect by default. Only explicit, auditable Owner Override may be an exception, and it never bypasses non-overridable financial invariants. | Universal four-eyes confirmation was not selected. Broad elevated self-approval remains prohibited. | Product Owner / Policy authority | `APPROVED_PRODUCT_POLICY_M2` | Capability matrix; self-approval logic; correction approval flow; Owner Override audit metadata. |
| P-04 | Review queue ownership | Primary reviewers are `ACCOUNTANT` and `ADMIN`; `OWNER` may review where organization policy permits and may be fallback when no other eligible approver exists. Every review preserves organization, originator, affected event/economic group, reason, evidence, requested action, reviewer, decision, timestamp, policy/rule version, and decision explanation when required. Resubmission re-enters normal validation; approval never mutates Ledger directly. | Direct Ledger mutation or untracked manual remediation was rejected. | Product Owner / Policy authority | `APPROVED_PRODUCT_POLICY_M2` | Review-case DTO; queue/audit contract; disposition/retry semantics; user-visible result DTO. |
| P-05 | CLOSED / LOCKED period escalation | OPEN may post only after all controls pass. CLOSED returns `PERIOD_DENIED` with optional review/escalation and no automatic date shift. LOCKED returns `PERIOD_DENIED`; no Owner Override, automatic reopen, or adjustment into another period. Reopen execution is out of M2 and escalation itself grants no posting permission. | Automatic reopen/date shift and treating CLOSED as `REJECTED` were rejected. | Product Owner / Policy authority | `APPROVED_PRODUCT_POLICY_M2` | Period result routing; escalation-case contract; no-post invariant; audit trail. |
| P-06 | Period Engine authorization interface | Period request includes organization, requester, event/economic-group reference, posting date, timezone/AccountingProfile reference, accounting period, rule identity/version, approval context, and requested operation. It returns `POSTING_ALLOWED`, `PERIOD_DENIED`, or `REVIEW_REQUIRED`, with period ID, reason codes, escalation/approval requirement where applicable, and period/rule/policy version references. Only `POSTING_ALLOWED` can permit posting eligibility; Period Engine never posts Ledger. | Boolean/status-only responses were rejected because they lose routing and audit information. | Product Owner / Policy authority | `APPROVED_PRODUCT_POLICY_M2` | Period authorization request/response DTO; authorization audit; outcome routing; atomic-post precondition. |

### Accounting approval record — A-01 through A-05

The source decision record approved the A rows above. The immutable normative source is `WENDY_PAID_EXPENSE_ACCOUNTING_RULE_v1.md`.

| Decision ID | Accounting approval | Approver | Approver role | Decision date | Evidence reference | Immutable rule version | Recorded reason / modification |
|---|---|---|---|---|---|---|---|
| A-01 | `APPROVE` | Wongsa วงศาโรตน์ | CEO | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |
| A-02 | `APPROVE` | Wongsa วงศาโรตน์ | CEO | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |
| A-03 | `APPROVE` | Wongsa วงศาโรตน์ | CEO | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |
| A-04 | `APPROVE` | Wongsa วงศาโรตน์ | CEO | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |
| A-05 | `APPROVE` | Wongsa วงศาโรตน์ | CEO | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |

## 3. Accounting decisions finalized

### A-01 — PAID_EXPENSE debit / credit semantics

**Finalized decision:** `PAID_EXPENSE v1` applies the direct paid-expense treatment for the one supported pair and preserves:

```text
ExpenseRecognized = business/accounting recognition fact
PaymentMade       = payment fact
Journal           = approved accounting representation of the linked pair
```

**Why it matters:** It defines what Engineering means by one financial effect, which then controls JournalDraft construction, balance validation, idempotency, and correction behavior.

**Finalized semantics:** one exact-decimal balanced Journal representation debits the resolved eligible Expense account and credits the resolved eligible Cash/Bank account for the same amount. It applies only where no separate authoritative tax accounting impact is required; unavailable authoritative tax impact routes for review rather than silently posting.

**Alternatives and consequences:** Separate event journals require payable, clearing, settlement, or liability semantics that are not approved in the first slice. A combined journal without both event references cannot preserve the required lineage.

### A-02 — Category-to-account mapping

**Finalized decision:** use a versioned organization-scoped mapping, effective-dated against the approved accounting context, with historical reproducibility.

**Why it matters:** The semantic expense category is not an account ID. Without a deterministic approved mapping, M2 cannot choose an expense account or define the financial effect.

**Finalized semantics:** resolution produces exactly one authoritative debit-side-eligible organization Expense account. Zero or multiple eligible mappings are `REVIEW_REQUIRED`; neither current active state alone nor a silent fallback controls resolution.

**Alternatives and consequences:** A shared fixed chart mapping is simpler but prevents organization-specific chart configuration. Free per-event selection is flexible but undermines deterministic policy and reproducibility.

### A-03 — Payment-source-to-account mapping

**Finalized decision:** use a stable payment-source identity and a versioned organization-scoped mapping, effective-dated against the approved accounting context, with historical reproducibility.

**Why it matters:** Payment source identity is not a GL account ID. Without the mapping, credit-side selection would be guessed.

**Finalized semantics:** resolution produces exactly one eligible same-organization Cash/Bank asset account. Zero or multiple eligible mappings are `REVIEW_REQUIRED`; display text, bank name, or mutable metadata alone is not authoritative.

**Alternatives and consequences:** Event-supplied account IDs couple capture to accounting policy; text matching a bank label can silently mispost cash.

### A-04 — Posting-date semantics

**Finalized decision:** `accounting_date` derives from the approved expense-recognition/effective date under the organization AccountingProfile timezone.

**Why it matters:** The selected date determines the Period Engine request and whether the financial effect can post.

**Finalized semantics:** payment date, source timestamp, `received_at`, and `created_at` do not redefine `accounting_date`; `created_at` is not posting date. OPEN follows normal controls, CLOSED is `PERIOD_DENIED`/review, LOCKED is denied, and no date shifts silently.

**Alternatives and consequences:** Payment-date or source-date posting changes cut-off semantics. Automatic date shift may make posting succeed but produces a misleading period assignment.

### A-05 — Balancing and correction / reversal

**Finalized decision:** exact decimal debit/credit balancing and immutable history are mandatory; correction is reversal plus replacement, not delta adjustment.

**Why it matters:** It defines valid journal construction, atomic effect, recovery, and historical reconstruction.

**Finalized semantics:** a full reversal inverts the exact original posted Journal lines and amounts without re-resolving the latest mapping/rule. A corrected replacement may use a newly approved rule/mapping version, and reversal/replacement requires Period authorization.

**Alternatives and consequences:** Delta adjustment can reduce entry volume but adds unapproved partial-correction semantics. Mutable posted journals break audit history.

## 4. Policy / authority decision proposals

### P-01 — Server capability matrix

**Product Owner decision recorded (2026-09-13):** The server enforces organization-scoped capability. Submit is available to authorized `OWNER`, `ADMIN`, `ACCOUNTANT`, and authorized `MEMBER`/`USER` where organization policy permits. The originating authorized user may perform `USER_CONFIRM`. Elevated approval is available to authorized `OWNER`, `ADMIN`, and `ACCOUNTANT`, subject to membership, authorization, SOD, and independent-approver rules. `OWNER_OVERRIDE` is Owner-only and conditional. Human roles never directly write Ledger records; only Ledger Posting Service may do so.

**Why it matters:** The actor role alone is not authority. This input determines authorization checks and prevents direct human Ledger writes.

**Approved M2 policy:** `USER` remains an actor type, not a new M1 membership role. A correction request and a Period escalation request are request actions under the server-authorized submit capability; a correction approval is an elevated approval and inherits P-02/P-03 controls. Client-supplied role claims are not authoritative.

**Alternatives and consequences:** Adding a new MEMBER role would change M1 domain vocabulary. Broad role grants or client role claims would weaken SOD and server authority; neither is selected.

**Approved capability matrix for M2 policy boundary:**

| Principal / organization role | Submit / `USER_CONFIRM` | Elevated approval | Owner Override | Request correction / Period escalation | Approve correction | Create posted Ledger record |
|---|---|---|---|---|---|---|
| `OWNER` | Allowed only as an authorized human member | Allowed only through server-granted elevated capability and P-02/P-03 | Conditional only under the approved Owner Override controls | Allowed only as an authorized human member | Allowed only through server-granted elevated capability and P-02/P-03 | Never |
| `ADMIN` | Allowed only when server-authorized | Allowed only through server-granted elevated capability | Never merely by being Admin | Allowed only when server-authorized | Allowed only through server-granted correction-approval capability | Never |
| `ACCOUNTANT` | Allowed only when server-authorized | Allowed only through server-granted elevated capability | Never merely by being Accountant | Allowed only when server-authorized | Allowed only through server-granted correction-approval capability | Never |
| `MEMBER` / `USER` if represented | Allowed when organization policy and server authorization permit | Not by default | No | Allowed only when server-authorized | Not by default | Never |
| `SERVICE` | No human confirmation or approval | No human approval | No | No human request | No human approval | Only the server-authorized Ledger Posting Service |

This matrix is intentionally capability-based: a role label alone grants no authority, and client-supplied role claims are ignored. Its policy meaning is `APPROVED_PRODUCT_POLICY_M2`; DTO names, capability storage, and enforcement mechanics remain an Engineering Freeze decision.

### P-02 — Independent approver resolution

**Product Owner decision recorded (2026-09-13):** An eligible independent approver belongs to the same organization, has active authorized membership, holds `OWNER`, `ADMIN`, or `ACCOUNTANT` approval capability, is not the originating actor for the elevated exception, and is not otherwise excluded by SOD policy. Identity comparison uses canonical actor/user identity, never display name, email text, or mutable profile metadata.

**Why it matters:** It decides whether an elevated exception must get independent approval or is eligible for a fully audited Owner Override.

**Approved M2 policy:** Capability rather than rank establishes eligibility; there is no role precedence among currently eligible `OWNER`, `ADMIN`, or `ACCOUNTANT` approvers. When multiple eligible independent approvers exist, any may review according to queue-assignment policy. When none exists, approval is not downgraded; `OWNER_OVERRIDE` is available only when explicitly permitted and all of its controls are met.

**Alternatives and consequences:** Silent approval/downgrade is rejected. Queue assignment may select a reviewer but must retain the actual reviewer and decision audit.

### P-03 — SOD overlap rules

**Product Owner decision recorded (2026-09-13):** Originator → submit and Originator → `USER_CONFIRM` are allowed. Originator → approval of their own elevated exception and Originator → approval of their own correction to a previously posted financial effect are prohibited by default.

**Why it matters:** It prevents a user from converting source-fact confirmation into accounting/posting authority.

**Approved M2 policy:** The only exception is explicit `OWNER_OVERRIDE` under its approved controls; self-approval detection and Owner Override are auditable. Financial invariants remain non-overridable.

**Alternatives and consequences:** Universal four-eyes approval provides stronger control but burdens small organizations. Broad self-approval increases speed but defeats elevated review.

### P-04 — Review queue ownership

**Product Owner decision recorded (2026-09-13):** Primary eligible reviewers are `ACCOUNTANT` and `ADMIN`. `OWNER` may review where organization policy permits and may be a fallback when no other eligible approver exists.

**Why it matters:** `REVIEW_REQUIRED` must lead to controlled resolution rather than untracked manual changes or forced posting.

**Approved M2 policy:** Every elevated review retains organization, originating actor, affected event/economic group, reason code, relevant evidence references, requested action, reviewer, decision, timestamp, policy/rule version, and optional/required explanation according to decision type. Corrected or resubmitted input returns through normal validation. Review approval never directly mutates Ledger.

**Engineering implication:** The exact queue owner, reason-code vocabulary, DTO, and persistence mechanics remain Engineering Freeze work, but must preserve this policy evidence and cannot create a direct Ledger-write path.

### P-05 — CLOSED / LOCKED period escalation

**Product Owner decision recorded (2026-09-13):** OPEN may post only after every other control passes. CLOSED normal PAID_EXPENSE posting is denied and returns `PERIOD_DENIED`; it may create or refer to a review/escalation workflow and never shifts the posting date automatically. LOCKED posting is denied, cannot use Owner Override, cannot automatically reopen, and cannot automatically adjust into another period.

**Why it matters:** Period status cannot be treated as a date-editing convenience, and Owner Override cannot unlock a LOCKED period.

**Approved M2 policy:** An escalation request itself grants no posting permission. Period reopen execution is outside M2; any future reopen workflow needs a separate approved Period policy.

**Alternatives and consequences:** Automatic reopening/date shift bypasses Period authority. `REJECTED` for a CLOSED period loses the separately approved Period meaning.

### P-06 — Period Engine authorization interface

**Product Owner decision recorded (2026-09-13):** The future authorization request carries, at minimum, `organization_id`, requester/actor identity, financial-event/economic-group reference, proposed `posting_date`, organization timezone or AccountingProfile reference, accounting-period identity, posting-rule identity/version, approval context, and requested operation.

**Why it matters:** This is the independent authorization required immediately before any Ledger posting attempt.

**Approved M2 policy:** The Period authority returns the deterministic equivalent of `POSTING_ALLOWED`, `PERIOD_DENIED`, or `REVIEW_REQUIRED`, with `accounting_period_id`, reason codes, approval/escalation requirement where applicable, and period/rule/policy version references. Only `POSTING_ALLOWED` permits posting eligibility. Period Engine may authorize or deny eligibility; it never posts Ledger. Exact DTO/schema names remain Engineering Freeze work.

**Alternatives and consequences:** A boolean result loses audit and routing distinctions. Passing raw period status shifts authority to the caller; neither is selected.

## 5. Approval routing summary

### 5.1 Product Owner / Policy decisions approved directly

- P-01 capability matrix and no-human-Ledger-write boundary.
- P-02 independent approver eligibility, identity comparison, multiple/none behavior, and Owner Override eligibility.
- P-03 SOD overlap rules.
- P-04 eligible reviewers and review-audit boundary.
- P-05 OPEN/CLOSED/LOCKED boundary, no automatic date shift/reopen, and no posting authority from escalation.
- P-06 Period authorization context and conceptual response categories.

All are `APPROVED_PRODUCT_POLICY_M2` with Product Owner evidence dated 2026-09-13.

### 5.2 Accounting decisions approved

- A-01 debit/credit semantics and tax-impact boundary.
- A-02 effective-dated category-to-account mapping contract.
- A-03 effective-dated payment-source-to-account mapping contract.
- A-04 accounting-date derivation and Period interaction.
- A-05 balancing and exact-original correction/reversal policy.

All five are `APPROVE` in the received Accounting reconfirmation evidence and are finalized by `PAID_EXPENSE v1`.

### 5.3 Accounting coordination required, but not an additional Policy approval

- P-02/P-03 protect the finalized A-05 correction/reversal semantics.
- P-04 constrains remediation of finalized A-02/A-03 mappings through the review/audit boundary.
- P-05/P-06 constrain the finalized A-04 accounting-date semantics supplied to the Period authority.

This coordination does not change P-01 through P-06 back to pending. The exact Period DTO and all service mechanics remain Engineering Freeze work.

### 5.4 Engineering-only decisions after policy approval

With A-01 through A-05 finalized, Engineering may begin the separate Contract Freeze preparation consistent with the already-approved P-01 through P-06 policy boundary for:

- exact DTO field names, schema versions, and error serialization;
- fingerprint encoding/hash algorithm after approved equivalence inputs are known;
- idempotency storage/retention and duplicate lookup strategy;
- transaction isolation/locking and contention handling;
- retry, timeout, recovery, and rollback mechanics; and
- test harness design for contract, invariant, concurrency, and authorization tests.

These technical choices still require Engineering freeze evidence, but do not reopen approved accounting or policy meaning.

## 6. Accounting Gate conclusion for Engineering Contract Freeze entry

The Accounting and Product/Policy decision prerequisites are complete:

1. A-01 defines the single approved PAID_EXPENSE accounting effect, tax-impact boundary, and balance representation.
2. A-02 and A-03 define deterministic, effective-dated versioned mapping identity, eligibility, zero/multiple disposition, and history.
3. A-04 and A-05 define accounting-date/Period interaction, balancing, and exact-original correction/reversal boundaries.
4. P-01 through P-06 Product Owner approval evidence is retained with the policy/rule version it governs; this evidence is recorded on 2026-09-13.
5. Accounting approval records approver, role, date, evidence reference, source hash, decision references, and immutable Rule `PAID_EXPENSE v1`.

Engineering Contract Freeze has not started in this update. M2 remains `NOT READY / NOT AUTHORIZED` until the separate Engineering Freeze and its required evidence are completed.
