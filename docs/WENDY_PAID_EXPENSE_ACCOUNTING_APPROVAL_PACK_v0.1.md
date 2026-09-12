# PAID_EXPENSE Accounting Approval Pack v0.1

**Product:** Vault
**Engine:** Wendy
**Status:** `PENDING_ACCOUNTING_APPROVAL`
**Scope:** M2 entry review for the approved THB Cash/Bank paid-expense slice only
**Accounting approver:** `PENDING/TBD`
**Decision date:** `PENDING/TBD`
**Rule version to approve:** `PENDING/TBD`

## 1. Purpose and decision boundary

This pack asks Accounting to approve or reject the accounting policy required by the `PAID_EXPENSE` rule. It is not a posting rule, implementation, JournalDraft, mapping table, or Ledger instruction.

The Product Owner-approved scope remains one confirmed, validated pair:

```text
ExpenseRecognized + PaymentMade --FULFILLS--> ExpenseRecognized
```

The events remain distinct. The rule has no authority to hard-code an organization-specific account ID, select Suspense or Miscellaneous Expense, guess an account, or infer tax treatment.

## 2. Constraints already established

| Constraint | State |
|---|---|
| M1 FinancialEvent semantics, provenance, exact decimal Money, THB first-slice scope, and the `FULFILLS` direction | `DECIDED_M1` |
| Product routing: `POSTED`, `REVIEW_REQUIRED`, `REJECTED`, `DUPLICATE`, and `PERIOD_DENIED` remain distinguishable | `APPROVED_FOR_M2_ENTRY` |
| Unknown/inactive/ambiguous mapping must fail closed or require review; no silent Suspense, Miscellaneous Expense, guessed account, or guessed tax treatment | `APPROVED_FOR_M2_ENTRY` |
| Accounting treatment, mappings, posting date, balancing construction, and journal correction behavior | `PENDING_ACCOUNTING_APPROVAL` |

The Product Owner-approved `OWNER_OVERRIDE` is an elevated approval mechanism only. It does not choose a debit/credit treatment, resolve a missing account mapping, permit an unbalanced journal, infer tax treatment, or bypass an Accounting hard invariant. See `WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md`.

## 3. Accounting decisions awaiting approval

### 3.1 Debit / credit semantics

**Status:** `PENDING_ACCOUNTING_APPROVAL`

Accounting must specify the permitted debit/credit treatment for the sole supported event pair and whether one or more approved configurations are allowed. This pack does not select sides, accounts, or lines.

Approval must define:

- the accounting effect represented by `ExpenseRecognized` plus `PaymentMade` in this first slice;
- which resolved account category is eligible on each permitted side;
- whether any condition changes that treatment; and
- the versioned rule reference that governs the decision.

### 3.2 Category-to-account mapping contract

**Status:** `PENDING_ACCOUNTING_APPROVAL`

Candidate contract for Accounting approval; no mapping values are supplied here:

| Aspect | Candidate requirement to approve or revise |
|---|---|
| Mapping scope | Organization-scoped and versioned; never a global hard-coded organization account ID. |
| Mapping input | `organization_id`, approved rule version, `expense_category`, effective date/context, and the selected COA version. |
| Mapping result | Exactly one active, postable `AccountId`, or an approved non-posting outcome. |
| Ambiguity | Missing, inactive, multiple, incompatible, or otherwise unresolved mappings do not post and are `REVIEW_REQUIRED` when the financial meaning remains plausible. |
| History | A later mapping change must preserve reproducibility of an earlier posted effect. |

Accounting must approve the exact inputs, account-eligibility rules, effective-dating semantics, and mapping-remediation process. A hard-invalid mapping request may be `REJECTED`; a plausible category that cannot resolve deterministically is `REVIEW_REQUIRED` under the Product Owner routing boundary.

### 3.3 Payment-source-to-account mapping contract

**Status:** `PENDING_ACCOUNTING_APPROVAL`

Candidate contract for Accounting approval; no payment-source mapping values are supplied here:

| Aspect | Candidate requirement to approve or revise |
|---|---|
| Mapping scope | Organization-scoped and versioned. |
| Mapping input | `organization_id`, `payment_source_ref`, effective date/context, selected COA version, and approved rule version. |
| Mapping result | Exactly one active, postable Cash/Bank `AccountId`, or an approved non-posting outcome. |
| Bank source | An organization CUSTOM bank account may exist beneath the seed bank header; the header is not a postable funding account. |
| Cash source | Cash on Hand treatment and eligibility must be explicit. |
| Ambiguity/history | Unresolved mapping cannot post and is `REVIEW_REQUIRED` when the payment source is known; mapping changes must preserve prior posted-result reconstruction. |

### 3.4 Posting-date semantics

**Status:** `PENDING_ACCOUNTING_APPROVAL`

The event contract already keeps `effective_date`, `accounting_date`, and `payment_date` explicit; the immediate-paid-expense slice currently requires those dates to match. Confirmation is not period authorization.

Accounting must approve:

- which explicit event date is proposed as the posting date;
- how organization timezone affects that proposal;
- treatment of late events; and
- which cases require `REVIEW_REQUIRED`, `PERIOD_DENIED`, or another approved non-posting outcome.

### 3.5 Balancing requirements

**Status:** `PENDING_ACCOUNTING_APPROVAL`

No accounting effect may post unless the approved result satisfies exact-decimal balancing: total debit equals total credit. Accounting must approve the full balancing invariant, permitted line composition, precision/rounding treatment if any, and the failure disposition. This pack authorizes no rounding policy.

### 3.6 Correction / reversal behavior

**Status:** `PENDING_ACCOUNTING_APPROVAL`

Financial Events are immutable and event corrections preserve lineage. Accounting must approve the journal-level correction/reversal behavior, eligibility triggers, relationship/provenance requirements, and historical reconstruction rules. This pack does not choose a correction mechanism.

## 4. Explicit fail-closed conditions

Posting is prohibited until resolved when any of the following apply:

- the FinancialEvent pair, relationship, organization, exact amount, currency, or provenance fails a hard invariant;
- required evidence or human confirmation is missing from an otherwise plausible record, in which case it is `REVIEW_REQUIRED` and still does not post;
- an expense category cannot resolve to exactly one eligible account under an approved versioned mapping;
- a payment source cannot resolve to exactly one eligible Cash/Bank account under an approved versioned mapping;
- the selected accounts are inactive, incompatible, or do not meet an approved eligibility rule;
- posting-date/Period authorization is absent or denied;
- accounting authority, balancing, rule version, or required approval evidence is missing; or
- any tax treatment would be guessed rather than supplied by a separately authorized capability.

`OWNER_OVERRIDE` cannot change any fail-closed condition above into a posting authorization.

The Product Owner routing decision determines whether an unresolved, plausible case is `REVIEW_REQUIRED` or a hard invalid case is `REJECTED`. Neither outcome posts.

## 5. Approval examples

| Case | Expected outcome before Accounting approvals | Approved-rule outcome only after all required decisions exist |
|---|---|---|
| Confirmed matching pair, one eligible category mapping, one eligible Cash/Bank mapping, authorized period, and balanced approved treatment | `PENDING_ACCOUNTING_APPROVAL`; no post yet | Candidate to become `POSTED` if every approved contract check passes. |
| Category exists but mapping is absent, multiple, inactive, or incompatible | No post | `REVIEW_REQUIRED`; never a guessed account. A hard-invalid request remains `REJECTED` under the Product Owner boundary. |
| Payment source is known but no eligible Cash/Bank mapping exists | No post | `REVIEW_REQUIRED`; never a guessed account. |
| Invalid amount/schema, organization mismatch, unsupported currency, or broken event invariant | No post | `REJECTED`; no account selection or journal construction. |
| Period authorization is denied | No post | `PERIOD_DENIED`; no journal before Period Engine authorization. |
| Corrected event relation without approved journal correction policy | No post | Non-posting review/escalation until Accounting approves correction/reversal behavior. |

## 6. Accounting approval record

Accounting must record an approval or rejection for each §3 item, the approved immutable rule version, named approver, decision date, and durable evidence reference. Until all fields are completed, this pack remains `PENDING_ACCOUNTING_APPROVAL` and M2 remains `NOT READY`.
