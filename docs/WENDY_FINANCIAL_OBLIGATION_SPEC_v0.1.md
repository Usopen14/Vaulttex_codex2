# Wendy Financial Obligation v0.1 — Deferred Design Note

**Product:** Vault
**Engine:** Wendy
**Status:** `DEFERRED — NOT AUTHORIZED FOR M2 IMPLEMENTATION`
**Product Owner decision date:** 2026-09-12
**Proposed future milestone:** `M? — Financial Obligation capability`, post-M2 and subject to a separate roadmap, policy, and implementation authorization

## 1. Purpose and authority boundary

`FinancialObligation` represents an amount that an organization is expected or required to pay. It is distinct from the accounting recognition of an expense, the fact of payment, external settlement, and Ledger posting.

```text
FinancialObligation ≠ ExpenseRecognized ≠ PaymentMade ≠ Settlement ≠ Ledger
```

A FinancialObligation is not a source of accounting truth. The Ledger remains the authority for recorded accounting truth. This capability must not create a journal, select an account, calculate tax, authorize a period, or write to the Ledger merely because an obligation exists or changes.

Payroll may later create obligations with `obligation_type = PAYROLL`. That future possibility does not authorize Payroll calculation, employee-level payroll, withholding tax, social security, payslips, payroll filing, payroll automation, or any Payroll implementation in M2.

## 2. Conceptual schema

This is a conceptual schema only. It is not a persisted table, DTO, event, migration, API, or implementation contract. Field formats, requiredness, validation, versioning, and storage authority remain deferred.

```yaml
FinancialObligation:
  obligation_id: opaque identity
  organization_id: organization boundary
  obligation_type: approved obligation classification
  amount: exact-money amount
  due_or_expected_payment_context: optional future payment expectation
  source_or_policy_reference: provenance for why the obligation exists
  lifecycle_context: deferred state and transition evidence
  related_financial_event_refs: optional future relationships
  created_audit: deferred audit/provenance fields
  version_context: deferred schema and policy version references
```

`amount` describes the amount expected or required to pay; it is not a debit, credit, account balance, tax amount, payment result, or Ledger amount. This note does not establish a currency policy for obligations.

## 3. Obligation types

The only explicitly named future type in this decision is:

```text
PAYROLL
```

`PAYROLL` means a future Payroll capability may create a FinancialObligation. It does not imply an expense, a liability, a payment, a settlement, tax treatment, a payslip, or a Ledger posting.

No other obligation type is frozen by this note. Additional types, their source authority, and their semantics require a separate approved versioned decision.

## 4. Lifecycle semantics

No canonical `FinancialObligation` status enum or transition graph is approved here. A future capability must define how an obligation is established, changed, satisfied, disputed, cancelled, or otherwise closed, together with the authority and evidence required for each transition.

Regardless of any future lifecycle, these boundaries are fixed:

- an obligation lifecycle change does not rewrite a Financial Event or posted Ledger history;
- an obligation does not become `ExpenseRecognized`, `PaymentMade`, or `Settlement` by state transition alone;
- a payment, settlement, or accounting record does not silently change an obligation lifecycle without an approved relationship/authority rule; and
- any correction must preserve prior history rather than silently overwrite it.

## 5. Relationship to Financial Events

An obligation may eventually have explicit, traceable relationships to Financial Events. Such a relationship is not defined by this note and must not be inferred from shared amount, date, counterparty, or text.

In particular:

- `ExpenseRecognized` records a recognition fact; it is not an obligation by default.
- `PaymentMade` records the asserted fact that value left an organization-controlled source; it is not proof that an obligation exists or was fully satisfied.
- A future obligation created by Payroll with `obligation_type = PAYROLL` is not employee payroll calculation or an accounting event.

## 6. Relationship to Payment and Settlement

Payment and Settlement remain separate semantic layers. A future obligation relationship may state that a payment is intended to satisfy, partially satisfy, or relate to an obligation only after the relationship type, authority, amount-allocation rules, and correction behavior are separately approved.

This note defines no fulfillment algorithm, allocation, matching, settlement inference, reconciliation behavior, or automatic status change. It must not collapse expected payment, actual PaymentMade, external Settlement, and Ledger effect into one fact.

## 7. Relationship to Financial State liquidity

A future Financial State capability may use approved obligations as a separately labeled liquidity input. It must preserve the distinction between recorded Ledger cash, external evidence, expected/required outflows, forecasts, and actual Financial State facts.

An obligation must not overwrite Ledger cash, create an actual Ledger liability/balance, or mutate Financial State. Whether an obligation affects a future liquidity projection, forecast, availability measure, or quality label is deferred to that future Financial State design and its approved authority rules.

## 8. Explicit non-goals

- No FinancialObligation tables, migrations, services, APIs, events, event flows, or Ledger integration in M2.
- No Payroll calculation, employee-level payroll, withholding tax, social security, payslips, payroll filing, or payroll automation.
- No accounting recognition, account mapping, debit/credit construction, JournalDraft, period authorization, or Ledger posting.
- No authoritative tax, payment initiation, settlement matching, reconciliation, or Financial State implementation.
- No inference of an obligation from a source document, Financial Event, payment, settlement, or Ledger record without a separately approved rule.

## 9. Proposed future milestone and entry gate

The proposed capability is a separately authorized post-M2 milestone, tentatively named `Financial Obligation capability`; its milestone number and roadmap position are `PENDING/TBD`.

Before that milestone can be authorized, Product Owner, Accounting, Tax/Payroll authority where applicable, and Engineering must separately approve:

1. canonical obligation types, source authority, and lifecycle/transitions;
2. exact-money/currency, due-date, allocation, and correction semantics;
3. relationships to Financial Events, Payment, Settlement, accounting recognition, and Ledger authority;
4. any liquidity/Financial State use and its forecast-versus-actual boundary;
5. Payroll and tax scope, if `PAYROLL` is introduced beyond a type label; and
6. versioned contracts, authorization, audit/provenance, idempotency, and tests.

Until then, `FinancialObligation` is a deferred domain capability and not part of M2.
