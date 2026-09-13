# PAID_EXPENSE Engineering Contract v1

**Product:** Vault
**Engine:** Wendy
**Contract status:** `ENGINEERING_CONTRACTS_FROZEN_FOR_REVIEW — ENGINEERING_GATE_ACCEPTANCE_PENDING — IMPLEMENTATION NOT AUTHORIZED`
**Contract version:** `wendy.paid-expense.engineering-contract/1.0.0`
**Scope:** the approved THB, same-settlement `PAID_EXPENSE` vertical slice only
**Accounting source (immutable):** [`WENDY_PAID_EXPENSE_ACCOUNTING_RULE_v1.md`](WENDY_PAID_EXPENSE_ACCOUNTING_RULE_v1.md), `rule_id: PAID_EXPENSE`, `immutable_rule_version: v1`
**Product/Policy sources:** [`WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md`](WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md), P-01 through P-06; [`WENDY_M2_DECISION_REGISTER_v0.1.md`](WENDY_M2_DECISION_REGISTER_v0.1.md)
**M1 sources preserved:** `WENDY_TECHNICAL_SPEC_v0.2.md`, `WENDY_DOMAIN_TYPES_v0.1.md`, `WENDY_FIRST_EVENT_SCHEMA_v0.1.md`, and `WENDY_COA_SEED_v0.1.md`

## 1. Authority, boundary, and status

This is a technical contract freeze, not production code, a Ledger schema migration, or authorization to post. It translates the approved Accounting Rule and Product/Policy decisions into implementation-ready contracts for the single approved path:

```text
FinancialEvent → deterministic validation → Accounting Engine → JournalDraft
    → Period authorization → atomic Ledger posting
```

The immutable Accounting Rule remains the source of debit/credit, mapping, date, tax-boundary, balancing, and correction semantics. This contract never changes that Rule. A future accounting change requires a new approved Accounting Rule version and a compatible Engineering Contract version.

The following are excluded: LINE, AI authority, Tax Engine, Financial State, Reconciliation, Payroll, FinancialObligation, AP settlement, accrual-only expense, prepayment, refund, card clearing/settlement, foreign currency, tax filing, and period reopening. `ExpenseRecognized` and `PaymentMade` remain separate immutable Financial Events; a Journal is not a replacement event.

## 2. Canonical PAID_EXPENSE financial effect

### 2.1 Identity

A canonical `PAID_EXPENSE v1` financial effect is exactly this immutable set, within one organization:

```text
ExpenseRecognized@event_version
    + PaymentMade@event_version
    + PaymentMade --FULFILLS--> ExpenseRecognized
    + one shared economic_group_id
    + PAID_EXPENSE / v1
```

It is eligible for a simple direct-paid-expense Journal only after every M1 event invariant, all M2 validation gates, authorization, mapping, balance, and Period authorization checks pass. A matching fingerprint, confirmation, or review decision is never itself a posting authorization.

### 2.2 Effect classes

| Class | Deterministic meaning | Required handling |
|---|---|---|
| Same financial effect | Same `organization_id`, rule id/version, immutable Expense event id/version, immutable Payment event id/version, directed `FULFILLS` relation, and `economic_group_id`. | At most one original posted Journal effect may exist. Return its canonical result on replay. |
| Duplicate request | The same organization-scoped operation idempotency key is reused by its owner with the same canonical request-input hash. | Return the stored result; create no second mutation. |
| Duplicate event delivery | The same immutable event version pair and directed relationship are delivered again, whether through the same or another request key. | Resolve the same financial-effect fingerprint and return `DUPLICATE` with the existing canonical result; create no second Journal. |
| Source-identity collision | An authoritative source identity/content tuple already belongs to another purported pair. | If all authoritative facts establish the prior pair, return `DUPLICATE`; if facts differ or cannot establish equivalence, return `REVIEW_REQUIRED`. Never create a second effect from a display-name match. |
| Legitimate correction/replacement | An explicit compound correction of a posted original: exact full reversal of its lines plus a new, linked corrected replacement pair/Journal. | Use the correction contract in §11. The replacement has a new effect identity and its own idempotency key. |
| Independent new financial effect | A new confirmed pair with a distinct authoritative source record identity, distinct event identity/group, and no correction-chain reference. | May be assessed as a new effect; it still must pass every M2 control. |

No client may turn an unsupported family into an independent effect by changing an idempotency key, event display text, source label, or UI description.

## 3. Fingerprint contract

### 3.1 Two related, versioned fingerprints

M1 carries an `event_fingerprint` field and deliberately deferred its algorithm. M2 freezes both of the following without changing any accepted M1 event behavior:

| Name | Version | Purpose |
|---|---|---|
| Financial Event fingerprint | `wendy.financial-event-fingerprint/1.0.0` | Identifies a single immutable confirmed event version from stable source/economic inputs. It is stored as the M1 `event_fingerprint` for M2-created/validated events. |
| PAID_EXPENSE financial-effect fingerprint | `wendy.paid-expense-effect-fingerprint/1.0.0` | Identifies the approved paired accounting effect and is stored with the posting identity. It is never substituted for either Financial Event identity. |

Both values are lowercase 64-character SHA-256 hex. The hash is an identity/check, not permission to post.

### 3.2 Canonical Financial Event fingerprint input

The canonical payload for one event is the following object. The event-specific object is selected by `event_type`; absent optional values are represented as JSON `null`, never omitted.

```yaml
fingerprint_contract: wendy.financial-event-fingerprint/1.0.0
organization_id: lowercase RFC-4122 UUID
event_type: ExpenseRecognized | PaymentMade
event_id: lowercase RFC-4122 UUID
event_version: positive integer
economic_group_id: lowercase RFC-4122 UUID
amount:
  currency: THB
  value: normalized exact decimal
effective_date: YYYY-MM-DD
source_refs:
  - source_id: lowercase RFC-4122 UUID
    source_artifact_id: lowercase RFC-4122 UUID
    source_record_id: string | null
    content_hash: lowercase SHA-256 hex
event_specific:
  ExpenseRecognized:
    expense_category: canonical enum token
    recognition_basis: IMMEDIATE_PAID_EXPENSE
  PaymentMade:
    payment_date: YYYY-MM-DD
    payment_method: BANK_TRANSFER | CASH
    payment_source_id: lowercase RFC-4122 UUID
    payment_source_type: BANK_ACCOUNT | CASH_ON_HAND
    payment_status: COMPLETED
```

The source tuples are sorted lexicographically by `(source_id, source_artifact_id, source_record_id with null before text, content_hash)`. This freezes the suggested M1 source-identity, record/content, type, Money, date, and payment-source inputs while excluding mutable presentation data.

### 3.3 Canonical PAID_EXPENSE financial-effect fingerprint input

```yaml
fingerprint_contract: wendy.paid-expense-effect-fingerprint/1.0.0
organization_id: lowercase RFC-4122 UUID
effect_kind: PAID_EXPENSE_ORIGINAL
accounting_rule:
  rule_id: PAID_EXPENSE
  immutable_rule_version: v1
economic_group_id: lowercase RFC-4122 UUID
expense_event:
  event_id: lowercase RFC-4122 UUID
  event_version: positive integer
  event_fingerprint: lowercase SHA-256 hex
payment_event:
  event_id: lowercase RFC-4122 UUID
  event_version: positive integer
  event_fingerprint: lowercase SHA-256 hex
relationship:
  relationship_type: FULFILLS
  from: payment_event
  to: expense_event
```

The roles are named, not list-position dependent. `relationship_id` is provenance and is stored with the posting, but it is not an effect-fingerprint component; changing an internal relationship identifier must not manufacture a new financial effect. Mapping versions, current account names, and account display metadata are provenance inputs to the JournalDraft, not new-effect inputs. A mapping-version mismatch for an already recorded effect is a conflict/review condition, never permission to post a second effect.

### 3.4 Canonicalization and collision handling

1. Construct the object exactly as specified above using UTF-8 JSON Canonicalization Scheme (RFC 8785): deterministic member ordering, no insignificant whitespace, and standard JSON escaping.
2. All UUIDs and SHA-256 strings must already satisfy the lowercase M1 formats. Enum tokens are the exact canonical tokens; no locale folding is permitted.
3. Exact decimal Money is normalized without binary arithmetic or rounding: remove only trailing fractional zeroes; remove the decimal point if the remaining fractional part is empty; retain `0` for a zero whole component. Thus `1`, `1.0`, and `1.00` hash as `1`; their original lexical value remains preserved in event provenance. Currency is always `THB`.
4. Dates are the validated `YYYY-MM-DD` organization-local calendar values. Timestamps, receipt time, `created_at`, display labels, descriptions, counterparty display names, mutable account names, UI wording, AI proposals/confidence, and current account metadata are excluded.
5. Hash the UTF-8 canonical bytes with SHA-256. Store the fingerprint contract version, hash, and canonical preimage bytes (or an immutable content-addressed reference to them).
6. On a matching version/hash, compare canonical preimage bytes. Equal bytes follow duplicate rules. Different bytes are a blocking `FINGERPRINT_COLLISION` system condition: do not post, do not silently deduplicate, retain diagnostic evidence, and require safe operator investigation.

## 4. Idempotency and exactly-once effect

### 4.1 Mutation operations and namespace

Every mutation-capable M2 command is an `EngineRequest` with an idempotency key. Its namespace is:

```text
wendy:{organization_id}:paid_expense:v1:{operation}
```

Frozen operations are:

```text
VALIDATE_PAID_EXPENSE
USER_CONFIRM_PAID_EXPENSE
REQUEST_ELEVATED_APPROVAL
DECIDE_ELEVATED_APPROVAL
REQUEST_PERIOD_AUTHORIZATION
POST_PAID_EXPENSE
REQUEST_PAID_EXPENSE_CORRECTION
POST_PAID_EXPENSE_CORRECTION
```

The effective unique key is `(organization_id, operation, idempotency_key)`. A key is owned by the authenticated originating principal recorded on first use. Reuse by another principal, another organization, or another operation is an idempotency conflict, not a replay right.

### 4.2 Stored reservation/result

An immutable idempotency record stores at least namespace, key, owning actor/service identity, canonical request-input hash, request id, trace id, state (`IN_PROGRESS`, terminal result, or `UNKNOWN_OUTCOME`), financial-effect fingerprint when applicable, result/outcome, Journal/review/Period references when applicable, response hash, creation/completion timestamps, and transaction/commit reference when posted.

`request_id` and transport timestamps are correlation data, not idempotency inputs. The canonical request-input hash uses the same serialization rules as §3 and includes the organization, operation, authenticated actor identity, immutable event/version or correction references, requested action, approval context, and rule version. It excludes request id, trace id, and request timestamp.

### 4.3 Replay, conflict, and retention rules

| Condition | Result |
|---|---|
| Same scoped key and same canonical request-input hash | Return the stored canonical result. No additional mutation occurs. |
| Same scoped key and different canonical request-input hash | `IDEMPOTENCY_CONFLICT`; no post. |
| Different key but same PAID_EXPENSE financial-effect fingerprint | `DUPLICATE`, referencing the existing canonical result where disclosure is authorized. |
| Different key with matching authoritative source identity but incompatible facts | `REVIEW_REQUIRED`; no post. |
| Different, independently sourced effect | Continue only through all normal gates. |

M2 idempotency records for financial mutations have **no expiry**. They are retained with the immutable financial/audit history. A future retention change requires a versioned engineering contract and must preserve the ability to prevent a second financial effect.

Exactly-once means one committed original Journal effect per PAID_EXPENSE financial-effect fingerprint. At-least-once delivery, repeated requests, connection loss, and retries may repeat a response but must never create a second effect.

## 5. Authorization and segregation-of-duties contract

Authorization is server-side. Client role claims, names, emails, and display metadata are non-authoritative. M1 `approval_level` remains exactly `AUTO_POST`, `USER_CONFIRM`, or `ACCOUNTANT_OR_ADMIN_APPROVAL`; `OWNER_OVERRIDE` is control metadata under elevated approval, not another approval level.

The frozen request/response schemas are defined in [`WENDY_PAID_EXPENSE_ENGINEERING_DTO_SCHEMA_v1.md`](WENDY_PAID_EXPENSE_ENGINEERING_DTO_SCHEMA_v1.md) §2. Their required behavior is:

- **Submit:** server resolves active organization membership and permitted submit capability.
- **USER_CONFIRM:** must be a human `USER` ActorRef, binds the exact candidate hash/source-business facts, and may be performed by the originator. It does not grant accounting, tax, correction, Period, or Ledger-posting approval.
- **Elevated approval:** server resolves active authorized `OWNER`/`ADMIN`/`ACCOUNTANT` capability, same organization, canonical actor identity different from the originator, and all SOD exclusions. The approver cannot approve their own elevated exception or correction by default.
- **Independent approver resolution:** records the policy version, membership/eligibility evidence reference, candidate set reference, resolved result, and the identity comparison. Display-name comparison is prohibited.
- **Owner Override:** only where organization policy enables it, no eligible independent approver exists, the actor is an authorized Owner, and the actor explicitly chooses the mechanism and supplies justification. Record actor, time, source request, affected events/economic group, policy version, no-independent-approver evidence, `SELF_APPROVED`, `OWNER_OVERRIDE`, and reason. It cannot bypass organization authorization, invalid event/amount/currency, tax dependency, missing mapping, Journal balance, idempotency conflict, immutable history, any Ledger invariant, or `LOCKED` Period denial.
- **Correction approval:** is a distinct elevated action. Its requester/originator cannot approve it by default; the same independent-approver/Owner-Override rules apply.
- **Period escalation request:** is a request only; it creates no post or override.
- **Ledger Posting Service:** is the sole identity permitted to write posted Ledger records. Human actors can cause an authorized request but never directly write Ledger rows.

Authorization outcome is `ALLOWED`, `REVIEW_REQUIRED`, or `DENIED`; only `ALLOWED` may enter the posting transaction. Every decision is immutable audit/provenance input to the result.

## 6. Period authorization contract

The exact DTOs are in the schema companion §3. Before an original post, reversal, or corrected replacement, the Period authority receives:

- `organization_id`, requester ActorRef, source request, the relevant Financial Event ids/versions and `economic_group_id`;
- `proposed_accounting_date` and `proposed_posting_date`, which must be the same validated M2 calendar date;
- an AccountingProfile snapshot reference containing its organization, timezone, and immutable snapshot/content reference;
- `accounting_period_id` and observed `period_version`;
- `PAID_EXPENSE`/`v1` rule identity (or the approved replacement rule/version), approval context, and operation; and
- trace/provenance references required to tie the answer to the transaction.

The deterministic response is one of `POSTING_ALLOWED`, `PERIOD_DENIED`, or `REVIEW_REQUIRED`, and always carries `accounting_period_id`, observed period version, reason codes, required approval/escalation action where applicable, policy/version references, and a decision reference. Only `POSTING_ALLOWED` is posting eligibility.

`accounting_date` derives from the approved expense-recognition/effective date under the AccountingProfile timezone. `created_at`, receipt time, source timestamp, and payment date cannot shift it. OPEN follows normal controls. CLOSED and LOCKED cannot post a normal PAID_EXPENSE effect; they return `PERIOD_DENIED` or the policy-defined review route, with no automatic date shifting. LOCKED cannot be unlocked by Owner Override. The transaction rechecks that the Period decision’s version/current state is still valid. Period authorization never writes the Ledger and period reopening is out of M2.

## 7. JournalDraft and mapping contract

The non-posted `JournalDraft` schema and invariants are in schema companion §4. A valid original PAID_EXPENSE v1 draft has exactly the approved effect:

```text
Dr  exactly-one eligible organization Expense account  = exact THB amount
Cr  exactly-one eligible organization Cash/Bank account = exact THB amount
```

Both accounts are resolved from organization-scoped, versioned, effective-dated authoritative mappings evaluated in the approved accounting-date context:

```text
semantic expense category → exactly one debit-eligible Expense account
approved payment-source identity → exactly one credit-eligible Cash/Bank asset account
```

The draft persists the mapping id/version, account id, account/COA eligibility evidence, effective-date context, accounting rule id/version, exact event ids/versions, `economic_group_id`, directed relationship, source/evidence/confirmation refs, trace id, and each exact decimal line. It must not hard-code organization account IDs or infer accounts from display text, bank name, mutable metadata, Miscellaneous Expense, Suspense, or a guessed mapping.

Zero, multiple, inactive-for-context, ineligible, cross-organization, or otherwise unresolved mappings yield `REVIEW_REQUIRED`; no JournalDraft may be posted. If authoritative tax accounting impact is required but unavailable, the simple Dr Expense / Cr Cash-Bank rule is also `REVIEW_REQUIRED`; it must not silently post. This contract does not implement a Tax Engine or invent the classifier that makes that determination.

Each line has one positive THB amount on exactly one side: debit XOR credit. Each amount follows M1 exact decimal Money rules; no binary floating point or rounding is permitted. All lines are same-organization, postable, and use the applicable account eligibility context. `total_debit == total_credit` by exact decimal comparison. A nonzero, unbalanced, incomplete, or ineligible draft cannot enter Ledger posting.

## 8. Atomic Ledger-posting boundary

The Ledger Posting Service performs original posting in one database transaction at serializable isolation. A response saying `POSTED` is emitted only after commit. Within the transaction it must establish or write, as applicable:

1. idempotency reservation/result and canonical request-input hash;
2. final authorization/SOD decision references and immutable approval-control audit;
3. revalidated Period authorization reference/version;
4. the financial-effect identity/fingerprint reservation;
5. immutable Journal Entry and exact Journal Lines;
6. FinancialEvent-to-Journal and relationship links;
7. accounting rule/version, mapping-version, COA/eligibility, source/evidence, confirmation, exact consumed T-01 tax-impact eligibility decision/consumption provenance, fingerprint, and trace provenance;
8. immutable Ledger/audit record; and
9. the terminal posting result linked to the committed Journal.

No application actor other than the Ledger Posting Service can write a posted Journal or Lines. Mandatory foreign keys, organization scopes, balance checks, immutable-row protections, and unique constraints are database-enforced as well as application-validated.

If any required check or write fails, the transaction rolls back entirely. It leaves no posted Journal, Line, Event-to-Journal link, financial-effect reservation, successful idempotency result, or success audit record. A pre-commit failure may safely be retried with the same key. Post-commit response loss is handled through §10, not by assuming rollback.

## 9. Concurrency and locking contract

The M2 storage design must enforce, at minimum:

```text
UNIQUE (organization_id, operation, idempotency_key)
UNIQUE (organization_id, effect_fingerprint_contract, financial_effect_fingerprint)
UNIQUE (organization_id, original_journal_entry_id) on the full-reversal link
```

The posting transaction reserves/reads the idempotency row and financial-effect identity with database conflict semantics; it does not use a process-local lock as correctness control. It locks an original Journal and its correction-chain link before creating a correction. It validates the event versions, rule/mapping provenance, authorization evidence, and Period version that were used to build the draft; a stale or changed prerequisite re-enters deterministic validation/review and cannot post from stale data.

| Race | Required result |
|---|---|
| Same request key/payload concurrently | One transaction becomes the owner; the other waits/reads the stored `IN_PROGRESS` or terminal result. |
| Same key, different payload | Exactly one reservation exists; the changed payload returns `IDEMPOTENCY_CONFLICT`; no post. |
| Different keys, same events/effect concurrently | One effect reservation commits; the loser returns the canonical `DUPLICATE` result after authorization-safe lookup. |
| Same source identity, incompatible proposed facts | No automatic winner is posted from the collision alone; route `REVIEW_REQUIRED`. |
| Correction races original posting | Correction locks/checks original effect. If original is not committed, correction remains `IN_PROGRESS`/retries safely with its same key; it cannot reverse a partial Journal. |
| Period closes/locks while posting | The transaction detects the stale Period version and rechecks. It cannot commit under an invalid Period authorization. |

These controls guarantee one original accounting effect per canonical fingerprint and one full reversal per original Journal. They do not infer authority from a fingerprint match.

## 10. Retry and failure contract

| Outcome | Retry rule | Financial effect |
|---|---|---|
| `REJECTED` / deterministic hard validation failure | Do not blindly retry. Correct the input through the authorized flow, then use a new request/key where appropriate. | None. |
| `REVIEW_REQUIRED` | Do not retry until missing evidence, mapping, tax dependency, or authorized review is resolved. Revalidation is required on resubmission. | None. |
| `PERIOD_DENIED` | Do not retry as a post. Follow a permitted review/escalation path; no date shift/reopen in M2. | None. |
| `IDEMPOTENCY_CONFLICT` / fingerprint collision | Do not retry the changed request under the same key. Investigate/reconcile. | None created by the conflict. |
| Pre-commit transient infrastructure failure | Same key may be retried after the transaction has rolled back. | None before a successful commit. |
| Unknown transaction outcome / lost response | Query the idempotency record by the same scoped key. If terminal, return it. If `IN_PROGRESS`, wait/poll. If unresolved, retry only with the same key; unique reservations make it safe. | At most one. |

`DUPLICATE` is a successful no-new-effect result, not an instruction to post again. `POSTED` is returned only with a committed immutable Journal reference. Error handling must never convert uncertainty into a fresh request key or a second Ledger write.

## 11. Correction and reversal contract

A first-slice correction is one idempotent compound operation:

```text
original posted Journal
  → exact full reversal Journal
  → corrected replacement FinancialEvent pair / Journal
```

The correction request identifies the original Journal/effect, reason, requester, source evidence, and corrected replacement events. The transaction locks the original correction chain, requires approval under §5, and requires independent Period authorization for both reversal and replacement. The reversal clones the exact original line identities/provenance and swaps every debit for the identical credit and every credit for the identical debit. It reuses the original rule/mapping/account resolution evidence and **must not** re-resolve latest mappings, accounts, or rule.

The corrected replacement uses new immutable event identity, its own effect fingerprint and idempotency key, the then-approved rule/mapping versions, and its own exact T-01 tax-impact eligibility decision when that gate is approved. It may not reuse the original effect identity. A `CorrectionCase` provenance record links original Journal, reversal Journal, replacement Journal, reason, actors, source/evidence, approval decisions, both Period decisions, original/replacement rule and mapping versions, original/replacement tax-impact decision consumption, and relevant M1 `REVERSES`/`SUPERSEDES` event references. The original, reversal, and replacement records remain immutable and traceable.

For the M2 correction operation, reversal and replacement commit together or not at all; a standalone reversal, mutable edit, or arbitrary delta-adjustment is outside this slice unless separately approved.

## 12. Release-blocking acceptance tests

The full non-production test contract is [`WENDY_PAID_EXPENSE_TEST_CONTRACT_v1.md`](WENDY_PAID_EXPENSE_TEST_CONTRACT_v1.md). It is required before implementation approval and covers balance, mapping, organization scope, authorization/SOD, Period behavior, duplicate/idempotency/concurrency, atomic rollback, correction traceability, immutability, and the authoritative-tax-impact boundary. The approval-ready interim T-01 gate and its exact outcomes are defined in [`WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.1.md`](WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.1.md); that document is pending Product and Accounting approval and does not alter Accounting Rule v1.

## 13. Freeze decisions and remaining boundary

| Area | Freeze state | Notes |
|---|---|---|
| Accounting semantics | `CONSUMED_IMMUTABLE` | `PAID_EXPENSE v1` only; this document does not alter it. |
| Product/Policy SOD and Period policy | `CONSUMED_APPROVED` | P-01 through P-06 are expressed in DTO/audit/invariant form. |
| Fingerprint/idempotency/atomicity/concurrency/retry | `FROZEN` | Versioned technical contracts in this document and its two companions. |
| T-01 tax-impact eligibility authority | `PENDING_ACCOUNTING_AND_PRODUCT_APPROVAL` | The approval-ready interim decision contract uses `NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED`, `SEPARATE_ACCOUNTING_IMPACT_REQUIRED`, and `UNRESOLVED`. It is Accounting-controlled, evidence-backed, exact-event/rule bound, and fail-closed. No Tax Engine/classifier or authoritative tax policy is implemented in M2. |

The pending T-01 decision does not permit a workaround, guess, or silent simple posting. It is the identified cross-domain readiness blocker; it is not approved here because doing so would invent Accounting/Product policy.

## 14. M2 authorization status

The technical-contract preparation is complete: the immutable Accounting Rule, approved Product/Policy boundary, deterministic technical contracts, DTO schemas, and release-blocking test contract are frozen for review. The **formal Engineering Freeze gate is not yet complete** because no named Engineering owner or durable Engineering acceptance evidence was supplied. This document does **not** mark M2 `READY / AUTHORIZED` and does not authorize any code, migration, JournalDraft construction, Period service, or Ledger write.

M2 may be marked `READY / AUTHORIZED` only when:

1. T-01 is approved by the required Accounting and Product authorities, including an authorized Accounting-reviewer capability/evidence policy, and the post consumes only an exact matching `NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED` decision;
2. the frozen contract and test contract are accepted by a named authorized Engineering owner, with decision date and durable evidence reference; and
3. an explicit M2 implementation authorization is recorded.

## 15. Formal Engineering acceptance record

**Acceptance status:** `PENDING_ENGINEERING_OWNER_ACCEPTANCE`

| Evidence field | Recorded value |
|---|---|
| Engineering owner | `PENDING/TBD` |
| Role | `PENDING/TBD` |
| Decision | `PENDING/TBD` — permitted values: `ACCEPT`, `ACCEPT_WITH_REQUIRED_CHANGE`, `REJECT` |
| Decision date | `PENDING/TBD` |
| Evidence reference | `PENDING/TBD` |
| Accepted contract version | `PENDING/TBD` — must equal `wendy.paid-expense.engineering-contract/1.0.0` |
| Accepted DTO bundle version | `PENDING/TBD` — must equal `wendy.paid-expense.dto/1.0.0` |
| Accepted test-contract version | `PENDING/TBD` — must equal `wendy.paid-expense.acceptance-tests/1.0.0` |

The named Engineering owner must explicitly accept fingerprint canonicalization, idempotency and exactly-once effect, authorization/SOD, Period authorization, JournalDraft, serializable atomic Ledger posting, database uniqueness/concurrency, retry/`UNKNOWN_OUTCOME`, rollback, exact reversal/correction, and the release-blocking test contract. `ACCEPT_WITH_REQUIRED_CHANGE` is not acceptance until the required change is incorporated into a new/revised contract version and explicitly accepted. Codex is not, and must never be recorded as, the Engineering owner or approver.
