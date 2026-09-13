# Wendy PAID_EXPENSE Accounting Rule v1

**Product:** Vault
**Engine:** Wendy
**rule_id:** `PAID_EXPENSE`
**immutable_rule_version:** `v1`
**Status:** `IMMUTABLE_ACCOUNTING_RULE`
**approved_scope:** First PAID_EXPENSE vertical slice only; Accounting semantics only; no implementation authority

## 1. Approval and source record

| Field | Recorded value |
|---|---|
| Accounting approver | Wongsa วงศาโรตน์ |
| Approver role | CEO |
| Approval date | 13 Sep 2026 |
| Evidence reference | กยศ-123 |
| Source revised document | `WENDY_PAID_EXPENSE_ACCOUNTING_APPROVAL_REQUEST_v0.1.md` |
| Source document SHA-256 | `6ba878997420328f91bc0de32d72529c99ca93f5b5da6413fbb43f5473dd9967` |
| Reconfirmation source | `/Users/lem0ness/Desktop/Vault_Wendy Logic/WENDY_PAID_EXPENSE_ACCOUNTING_RECONFIRMATION_REQUEST_v0.1.md` |
| Reconfirmation source SHA-256 | `475bb1d43f33e6f65025e4e5b1a665f968b7c731905fd6d72100b9531b9e7141` |
| Source decision references | A-01, A-02, A-03, A-04, A-05; received response records `Decision: APPROVE` for each. |

This rule is immutable by version: its normative content must not be edited. A future approved change creates a new rule version; it does not rewrite v1.

## 2. Approved scope

This rule applies only to the first PAID_EXPENSE vertical slice: a supported expense is recognized and paid from an approved organization Cash/Bank source in the same settlement case.

`ExpenseRecognized` and `PaymentMade` remain distinct Financial Events. Their required first-slice relationship remains:

```text
PaymentMade --FULFILLS--> ExpenseRecognized
```

One balanced Journal may represent their combined approved accounting effect; it does not merge or replace either event.

## 3. A-01 — Debit / credit and tax-impact boundary

For this approved scope, the Journal effect is:

```text
Dr = approved organization Expense account
Cr = approved organization Cash/Bank account
```

Debit and credit use the same exact-decimal amount.

This rule applies only where no separate authoritative tax accounting impact is required. If authoritative tax accounting impact is required but unavailable, the item must not silently post through this simple PAID_EXPENSE rule; it routes according to applicable review/tax-dependency policy. This rule neither implements nor authorizes Tax Engine behavior.

## 4. A-02 — Category-to-account mapping

Account resolution is:

```text
semantic expense category
        → versioned organization-scoped mapping
        → organization Expense account eligible for the PAID_EXPENSE debit side
```

Eligibility is evaluated using the approved effective-dated accounting context, not current active state alone. Resolution produces exactly one authoritative eligible organization Expense account. Zero or multiple eligible mappings return `REVIEW_REQUIRED`; no automatic Suspense, Miscellaneous, or guessed account is permitted.

The mapping version remains attached to the accounting result for historical reconstruction.

## 5. A-03 — Payment-source-to-account mapping

Account resolution is:

```text
approved payment-source identity
        → versioned organization-scoped mapping
        → organization Cash/Bank asset account eligible for the PAID_EXPENSE credit side
```

The payment source and resolved account belong to the same organization. Eligibility is evaluated using the approved effective-dated accounting context, not current active state alone. Resolution produces exactly one eligible organization Cash/Bank asset account. Zero or multiple eligible mappings return `REVIEW_REQUIRED`.

Display text, bank name, or mutable metadata alone must not authoritatively identify the account. The mapping version remains attached to the accounting result for historical reconstruction.

## 6. A-04 — Accounting date and Period interaction

Within this scope, `accounting_date` derives from the approved expense-recognition/effective date under the organization's AccountingProfile timezone. Payment date, source timestamp, `received_at`, and `created_at` must not independently redefine `accounting_date`; `created_at` is not the posting date.

For late-arriving events, evaluate the approved `accounting_date` without silently moving it to another/current period:

```text
OPEN   → normal posting controls
CLOSED → PERIOD_DENIED / review
LOCKED → posting denied
```

Any posting, reversal, or corrected replacement still requires Period authorization.

## 7. A-05 — Balancing, reversal, and correction

Exact decimal arithmetic is required. Total debit must equal total credit; an unbalanced JournalDraft cannot post. Posted Journal history is immutable.

An M2 PAID_EXPENSE correction is:

```text
original posted Journal
        → full reversal of the exact original lines and amounts
        → corrected replacement event / Journal
```

A full reversal must not re-resolve the original accounting effect using the latest category mapping, account mapping, or accounting rule. A corrected replacement may use the appropriate newly approved rule/mapping version. Preserve actor, reason, source, relationships, rule version, and audit trail.

Arbitrary delta-adjustment correction is outside the first-slice M2 scope.

## 8. Explicit exclusions

This rule does not authorize or generalize to:

- AP settlement, accrual-only expense, prepayment, refund, payroll, card clearing/settlement, foreign currency, or unsupported tax treatment;
- authoritative tax calculation or Tax Engine behavior;
- a silent Suspense, Miscellaneous Expense, guessed category account, or guessed Cash/Bank account;
- period reopening, automatic date shifting, or posting without Period authorization;
- mutable posted history or arbitrary delta adjustments;
- Engineering Contract Freeze, M2 implementation, Ledger posting, or any capability beyond Accounting semantics.
