# PAID_EXPENSE Accounting Approval Pack v0.1

**Product:** Vault
**Engine:** Wendy
**Status:** `ACCOUNTING_GATE_COMPLETE`
**Scope:** M2 entry review for the approved THB Cash/Bank paid-expense slice only
**Accounting approver:** Wongsa วงศาโรตน์
**Approver role:** CEO
**Decision date:** 13 Sep 2026
**Evidence reference:** กยศ-123
**Immutable Rule version:** `PAID_EXPENSE v1`
**Source document SHA-256:** `6ba878997420328f91bc0de32d72529c99ca93f5b5da6413fbb43f5473dd9967`

## 1. Purpose and decision boundary

This pack records the finalized Accounting policy required by the `PAID_EXPENSE` rule. It is not an implementation, JournalDraft, mapping table, or Ledger instruction.

The reviewer-facing request and reconfirmation evidence resolve to `WENDY_PAID_EXPENSE_ACCOUNTING_RULE_v1.md`, the one immutable normative Accounting Rule.

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
| Accounting treatment, mappings, posting date, balancing construction, and journal correction behavior | `ACCOUNTING_APPROVED — PAID_EXPENSE v1` |

The Product Owner-approved `OWNER_OVERRIDE` is an elevated approval mechanism only. It does not choose a debit/credit treatment, resolve a missing account mapping, permit an unbalanced journal, infer tax treatment, or bypass an Accounting hard invariant. See `WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md`.

## 3. Accounting finalization record

The following decisions are finalized Accounting semantics. The separate Engineering Contract Freeze is accepted; this pack remains Accounting evidence only and does not itself authorize a JournalDraft or Ledger posting.

| Decision | Finalized Accounting semantic | Accounting decision | Approver | Decision date | Evidence reference | Immutable rule version | Recorded reason / modification |
|---|---|---|---|---|---|---|---|
| A-01 | Same-settlement PAID_EXPENSE only: debit approved organization Expense and credit approved organization Cash/Bank for same exact amount; unavailable authoritative tax impact cannot use the simple rule. | `APPROVE` | Wongsa วงศาโรตน์ | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |
| A-02 | Effective-dated, versioned organization category mapping resolves exactly one authoritative debit-side eligible Expense account; zero/multiple maps are `REVIEW_REQUIRED`. | `APPROVE` | Wongsa วงศาโรตน์ | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |
| A-03 | Effective-dated, versioned organization payment-source mapping resolves exactly one eligible same-organization Cash/Bank asset account; zero/multiple maps are `REVIEW_REQUIRED`. | `APPROVE` | Wongsa วงศาโรตน์ | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |
| A-04 | `accounting_date` derives from approved expense-recognition/effective date under AccountingProfile timezone; no independent redefinition or date shift. | `APPROVE` | Wongsa วงศาโรตน์ | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |
| A-05 | Exact balance and immutable history; full reversal inverts exact original lines/amounts; corrected replacement is versioned and Period-authorized; no arbitrary delta. | `APPROVE` | Wongsa วงศาโรตน์ | 13 Sep 2026 | กยศ-123 | `PAID_EXPENSE v1` | APPROVE |

### 3.1 A-01 — PAID_EXPENSE debit / credit

**Finalized semantic:** for only the approved same-settlement PAID_EXPENSE case, debit the approved organization Expense account and credit the approved organization Cash/Bank account for the identical exact-decimal amount.

`ExpenseRecognized` remains the recognition fact and `PaymentMade` remains the payment fact. A single balanced Journal may represent their approved combined accounting effect; it does not merge or replace either Financial Event.

The simple rule applies only where no separate authoritative tax accounting impact is required. If such impact is required but unavailable, it must route through review/tax-dependency policy rather than silently post through this rule. AP settlement, accrual-only expense, prepayment, refund, payroll, foreign currency, and unsupported tax cases remain excluded.

### 3.2 A-02 — Category-to-account mapping

**Finalized semantic:**

```text
semantic expense category
        → versioned organization-scoped mapping
        → organization Expense account eligible for the PAID_EXPENSE debit side
```

Eligibility uses the approved effective-dated accounting context, not current active state alone. Resolution must produce exactly one authoritative debit-side eligible organization Expense account. Zero or multiple eligible mappings return `REVIEW_REQUIRED`. The mapping version remains with the posted result for historical reconstruction. There is no Miscellaneous, Suspense, or guessed fallback.

The finalized source is `PAID_EXPENSE v1`.

### 3.3 A-03 — Payment-source-to-account mapping

**Finalized semantic:**

```text
approved payment-source identity
        → versioned organization-scoped mapping
        → organization Cash/Bank asset account eligible for the PAID_EXPENSE credit side
```

The payment source and resolved account must belong to the same organization. Eligibility uses the approved effective-dated accounting context, not current active state alone. Resolution must produce exactly one eligible Cash/Bank asset account. Zero or multiple eligible mappings return `REVIEW_REQUIRED`. Mapping version remains reconstructible for history. Display text, bank name, or mutable metadata alone must not authoritatively infer a bank or cash account.

The finalized source is `PAID_EXPENSE v1`.

### 3.4 A-04 — Posting date

**Finalized semantic:** `accounting_date` derives from the approved expense-recognition/effective date under the organization AccountingProfile timezone. Payment date, source timestamp, `received_at`, and `created_at` do not independently redefine it. `created_at` is never the posting date.

For a late-arriving event, evaluate its approved `accounting_date`: OPEN follows normal controls; CLOSED returns `PERIOD_DENIED` or review; LOCKED denies posting. The date is never silently moved to the current period.

The finalized source is `PAID_EXPENSE v1`.

### 3.5 A-05 — Balancing and correction / reversal

**Finalized semantic:** exact decimal arithmetic only; total debit must equal total credit; an unbalanced JournalDraft cannot post; posted Journal history is immutable.

For M2 PAID_EXPENSE, correction is a fully linked sequence:

```text
original Journal → full reversal → corrected replacement event / Journal
```

The full reversal inverts the exact original posted Journal lines and amounts; it does not re-resolve the latest category mapping, account mapping, or accounting rule. A corrected replacement may use a newly approved rule/mapping version. Reversal and replacement require Period authorization. Preserve links, reason, actor, source, rule version, and audit trail. Arbitrary delta-adjustment correction is outside the first PAID_EXPENSE M2 scope.

The finalized source is `PAID_EXPENSE v1`.

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

| Case | Accounting Rule v1 outcome | Posting precondition after Engineering Freeze |
|---|---|---|
| Confirmed matching pair, one eligible category mapping, one eligible Cash/Bank mapping, authorized period, and balanced approved treatment | Accounting semantics satisfied | Candidate to become `POSTED` only after every Engineering contract check passes. |
| Category exists but mapping is absent, multiple, inactive, or incompatible | `REVIEW_REQUIRED`; no post | Never a guessed account. A hard-invalid request remains `REJECTED` under the Product Owner boundary. |
| Payment source is known but no eligible Cash/Bank mapping exists | No post | `REVIEW_REQUIRED`; never a guessed account. |
| Invalid amount/schema, organization mismatch, unsupported currency, or broken event invariant | No post | `REJECTED`; no account selection or journal construction. |
| Period authorization is denied | No post | `PERIOD_DENIED`; no journal before Period Engine authorization. |
| Corrected event relation without exact-original reversal/replacement evidence | No post | Non-posting review/escalation; Rule v1 correction semantics must be satisfied. |

## 6. Accounting Gate completion record

All five A decisions are recorded as `APPROVE` in the received reconfirmation evidence. The one immutable normative artifact is `WENDY_PAID_EXPENSE_ACCOUNTING_RULE_v1.md`, with source document SHA-256 `6ba878997420328f91bc0de32d72529c99ca93f5b5da6413fbb43f5473dd9967` and evidence reference กยศ-123.

The Accounting Gate is `COMPLETE`. The separate Engineering Contract Freeze and T-01 Gate are complete, and Product Owner implementation authorization is recorded in `WENDY_M2_IMPLEMENTATION_AUTHORIZATION_v1.md`; M2 is `READY / AUTHORIZED` and implementation has not started.
