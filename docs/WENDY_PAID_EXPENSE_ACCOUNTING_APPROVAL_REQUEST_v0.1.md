# Wendy M2 — PAID_EXPENSE Accounting Approval Request

**Product:** Vault
**Engine:** Wendy
**Status:** `ACCOUNTING_GATE_COMPLETE`
**Request date:** 2026-09-13
**Accounting approver:** Wongsa วงศาโรตน์
**Decision evidence for this revised wording:** กยศ-123
**Accounting rule finalization:** `COMPLETE — WENDY_PAID_EXPENSE_ACCOUNTING_RULE_v1.md`

## Purpose

Request Accounting approval of the accounting semantics required before Engineering may freeze the M2 posting contracts.

This request preserves the source decision evidence for the revised wording. It approves Accounting semantics only; M2 remains `NOT READY / NOT AUTHORIZED` until the separate Engineering Contract Freeze is completed.

## Accounting Approval Reconciliation

The document previously reviewed by Accounting is retained as evidence for its earlier wording only:

```text
Reviewed file: /Users/lem0ness/Desktop/Vault_Wendy Logic/WENDY_PAID_EXPENSE_ACCOUNTING_APPROVAL_REQUEST_v0.1.md
SHA-256: 51bffca16847b1113d4113845ffc6beb386ecc11c3ab5efd508e2a35569421a4
Recorded approver/evidence in that file: Wongsa วงศาโรตน์ / กยศ-123
Applicability: EARLIER_WORDING_ONLY
```

That reviewed file does not contain all of the later required corrections. In particular, it lacks the A-01 authoritative-tax boundary; A-02/A-03 effective-dated, exactly-one resolution requirements; A-04 accounting-date derivation/precedence; A-05 exact-original reversal and Period-authorization requirements; and the Final Gate `APPROVE_WITH_MODIFICATION` and one-final-rule-version semantics.

This document is the revised normative approval request containing those corrections. It does not migrate, extend, or fabricate the earlier approval.

The received reconfirmation record is retained exactly as supplied:

```text
Reviewed response file: /Users/lem0ness/Desktop/Vault_Wendy Logic/WENDY_PAID_EXPENSE_ACCOUNTING_RECONFIRMATION_REQUEST_v0.1.md
Reviewed response SHA-256: 475bb1d43f33e6f65025e4e5b1a665f968b7c731905fd6d72100b9531b9e7141
Revised request SHA-256 confirmed in response: 6ba878997420328f91bc0de32d72529c99ca93f5b5da6413fbb43f5473dd9967
Decision for each A-01 through A-05: APPROVE
Approver: Wongsa วงศาโรตน์
Role: CEO
Decision date: 13 Sep 2026
Reason / modification: APPROVE
Evidence reference: กยศ-123
```

The source response metadata remains `AWAITING_ACCOUNTING_RECONFIRMATION` with `Reconfirmation evidence: PENDING/TBD` as supplied. That metadata has not been normalized or replaced. The A-01 through A-05 decision block above is recorded as the source decision evidence for this revised request hash.

The source document hash identifies the revised normative wording before this administrative finalization record was added. This record preserves that source hash and does not alter the approved A-01 through A-05 semantics.

## Scope

The scope is limited to the first PAID_EXPENSE vertical slice: an expense is recognized and paid from an approved Cash/Bank source in the same supported case.

Please review A-01 through A-05. For each decision, record:

```text
Decision: APPROVE | APPROVE_WITH_MODIFICATION | REJECT
Approver:
Role:
Decision date:
Reason / modification:
Evidence reference:
Exact revised document version/hash confirmed:
```

## A-01 — Debit / Credit Semantics

**Recommended:**

```text
Dr = approved organization Expense account
Cr = approved organization Cash/Bank account
```

`ExpenseRecognized` and `PaymentMade` remain separate Financial Events, even where one balanced Journal represents their combined accounting effect.

This simple rule applies only to the approved PAID_EXPENSE case where no separate authoritative tax accounting impact is required. If an authoritative tax accounting impact is required but unavailable, the item must not silently post using this simple rule; it must route according to the approved review/tax-dependency policy. This request does not implement or approve Tax Engine behavior.

Please confirm whether this is correct for the defined PAID_EXPENSE scope.

**Accounting response**

```text
Decision: APPROVE
Approver: Wongsa วงศาโรตน์
Role: CEO
Decision date: 13 Sep 2026
Reason / modification: APPROVE
Evidence reference: กยศ-123
Immutable rule version: v1
```

## A-02 — Category-to-Account Mapping

**Recommended:**

```text
semantic expense category
        → versioned mapping
        → organization Expense account
```

Requirements:

- organization scoped;
- versioned and historically reproducible mapping;
- account eligibility evaluated using the approved effective-dated accounting context, not current active state alone, subject to Accounting confirmation;
- resolution produces exactly one authoritative organization Expense account eligible for the PAID_EXPENSE Expense/debit side;
- zero or multiple eligible mappings return `REVIEW_REQUIRED`; and
- no automatic Suspense, Miscellaneous, or guessed account.

Please approve or modify the effective-date/account-eligibility rule and the exactly-one resolution requirement.

**Accounting response**

```text
Decision: APPROVE
Approver: Wongsa วงศาโรตน์
Role: CEO
Decision date: 13 Sep 2026
Reason / modification: APPROVE
Evidence reference: กยศ-123
Immutable rule version: v1
```

## A-03 — Payment-Source-to-Account Mapping

**Recommended:**

```text
approved payment source
        → versioned mapping
        → organization Cash/Bank asset account
```

Requirements:

- same organization;
- versioned and historically reproducible mapping evaluated using the approved effective-dated accounting context, not current active state alone, subject to Accounting confirmation;
- resolution produces exactly one eligible organization Cash/Bank asset account for the PAID_EXPENSE credit side;
- zero or multiple eligible mappings return `REVIEW_REQUIRED`; and
- no authoritative account inference from display text, bank name, or mutable metadata alone.

Please approve or modify the effective-date/account-eligibility rule and the exactly-one resolution requirement.

**Accounting response**

```text
Decision: APPROVE
Approver: Wongsa วงศาโรตน์
Role: CEO
Decision date: 13 Sep 2026
Reason / modification: APPROVE
Evidence reference: กยศ-123
Immutable rule version: v1
```

## A-04 — Posting Date

**Recommended accounting-date derivation:** within PAID_EXPENSE scope, `accounting_date` derives from the approved expense-recognition/effective date, under the organization's AccountingProfile timezone. Payment date, source timestamp, `received_at`, and `created_at` must not independently redefine `accounting_date`.

Accounting must approve or modify this derivation/precedence rule. `created_at` is not the posting date.

For a late-arriving event:

```text
OPEN   → normal posting controls
CLOSED → PERIOD_DENIED / review
LOCKED → posting denied
```

The accounting date must not silently move into another or current period.

Please approve or specify modifications.

**Accounting response**

```text
Decision: APPROVE
Approver: Wongsa วงศาโรตน์
Role: CEO
Decision date: 13 Sep 2026
Reason / modification: APPROVE
Evidence reference: กยศ-123
Immutable rule version: v1
```

## A-05 — Balancing / Correction / Reversal

**Recommended:**

- exact decimal arithmetic;
- total debit equals total credit;
- an unbalanced JournalDraft cannot post;
- posted Journal history is immutable;
- M2 PAID_EXPENSE correction follows:

```text
original posted Journal
        → full reversal
        → corrected replacement event / Journal
```

- a full reversal inverts the exact original posted Journal lines and amounts; it must not re-resolve the original effect using the latest category mapping, account mapping, or accounting rule;
- the corrected replacement may use the appropriate newly approved rule/mapping version;
- reversal and replacement posting still require Period authorization;
- retain actor, reason, source, relationships, rule version, and audit trail; and
- arbitrary delta adjustment is outside first-slice M2 scope.

Please approve or specify modifications.

**Accounting response**

```text
Decision: APPROVE
Approver: Wongsa วงศาโรตน์
Role: CEO
Decision date: 13 Sep 2026
Reason / modification: APPROVE
Evidence reference: กยศ-123
Immutable rule version: v1
```

## Final Accounting Gate

Recorded reconfirmation decisions:

```text
A-01: APPROVE
A-02: APPROVE
A-03: APPROVE
A-04: APPROVE
A-05: APPROVE
```

Decision meanings:

```text
APPROVE
  → The decision is complete only for the exact revised document
    version/hash identified in the evidence reference.

APPROVE_WITH_MODIFICATION
  → The decision is not complete until the modification is incorporated
    into the normative text and the Accounting approver confirms the
    revised wording/version/hash.

REJECT
  → The Accounting Gate remains blocked.
```

Retain the decision and evidence references for each of A-01 through A-05. Do not create five separate immutable accounting-rule versions.

All five decisions are finalized in `WENDY_PAID_EXPENSE_ACCOUNTING_RULE_v1.md`, the one immutable PAID_EXPENSE accounting-rule version representing the complete rule set. That final rule version records:

```text
Rule ID/version: PAID_EXPENSE v1
Accounting approver: Wongsa วงศาโรตน์
Approver role: CEO
Approval date: 13 Sep 2026
Evidence reference: กยศ-123
References to finalized A-01 through A-05 decisions: received reconfirmation response for source SHA-256 6ba878997420328f91bc0de32d72529c99ca93f5b5da6413fbb43f5473dd9967
```

No approval evidence has been inferred or created to advance the milestone. The evidence above is the received response record; it does not approve Engineering Contract Freeze, implementation, or Ledger posting.
