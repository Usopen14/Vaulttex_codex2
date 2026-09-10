# Wendy First Event Schema v0.1

**Status:** Normative companion artifact for Milestone M1  
**Applies to:** `WENDY_TECHNICAL_SPEC_v0.2.md`  
**Scope:** Contract for the first semantic event set; it does not authorize capture, confirmation UI, validation workflow, accounting posting, tax calculation or a LINE integration  
**Source of authority:** v0.2 §3 PD-01, PD-02, PD-04, PD-06, PD-07, PD-08; §§11, 29 and 33

## 1. Locked scenario boundary

The first future end-to-end slice is constrained to:

```text
LINE text evidence
→ expense paid by cash or an organization-owned bank account
→ user confirmation
→ linked ExpenseRecognized and PaymentMade semantic events
→ deterministic accounting rule
→ journal / ledger
→ expense summary
```

M1 implements only event **identity and relation contracts** for this scenario. The later steps above are explicitly out of M1.

## 2. Semantic rules

- `ExpenseRecognized` and `PaymentMade` are distinct event types even where a later deterministic rule produces one combined Journal Entry.
- `ExpenseRecognized` does not universally imply `PaymentMade`, and `PaymentMade` does not universally imply `ExpenseRecognized`.
- The first scenario may link both events under a shared `economic_group_id` after confirmation.
- A source/bank/POS observation is evidence, not an event automatically.
- Event amount is exact THB money; source foreign-currency evidence does not enable non-THB posting.
- Initial approval routing for the full vertical slice is `USER_CONFIRM`; AI confidence cannot replace it.
- Tax semantics are unresolved for this event unless an approved later Tax Engine/rule establishes them. M1 must not create tax results or events.

## 3. First-event contract

```ts
FirstExpensePaymentEventSet {
  organization_id: string
  economic_group_id: string
  trace_id: string

  source_refs: string[]
  confirmation_ref?: string

  approval_level: "USER_CONFIRM"

  expense_recognized: {
    event_id: string
    event_type: "ExpenseRecognized"
    event_domain: "ACCOUNTING_RECOGNITION"
    event_version: integer
    effective_date: date
    amount: { value: decimal_string, currency: "THB" }
    category_role: "marketing_advertising_expense"
    source_refs: string[]
  }

  payment_made: {
    event_id: string
    event_type: "PaymentMade"
    event_domain: "PAYMENT"
    event_version: integer
    payment_date: date
    amount: { value: decimal_string, currency: "THB" }
    payment_account_role: "cash_on_hand" | "bank"
    source_refs: string[]
  }

  relation: {
    relation_id: string
    relation_type: "RECOGNITION_SETTLED_BY_PAYMENT"
  }
}
```

`category_role` and `payment_account_role` are role references, not account IDs. A later Accounting Engine resolves authorized organization-specific accounts using an approved COA/rule version. This schema does not choose debit/credit account IDs.

## 4. Required validation contract for a later processing milestone

Before any event set can be accepted for a future posting path, the owning milestone must prove:

- one authorized organization scope across all objects;
- non-empty source/provenance references;
- exact THB money and equal expense/payment amounts for this combined scenario;
- distinct event and relation identifiers;
- a valid `economic_group_id` shared by both events;
- approved `USER_CONFIRM` evidence;
- valid COA/rule/period checks under their owning engines;
- idempotency and duplicate checks.

No M1 implementation may treat this validation list as an implemented posting flow.

## 5. Explicit non-decisions

This artifact does not define account IDs/numbers, posting rule IDs, tax profile fields, VAT/WHT/CIT outcome, exact user-confirmation UX, event required-field schema beyond the first scenario, period permission, auto-post eligibility, or database tables. Those remain controlled by their approved owning artifacts or v0.2 Open Questions.

