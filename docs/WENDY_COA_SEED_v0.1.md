# Wendy COA Seed v0.1

**Status:** Normative companion artifact for Milestone M1  
**Applies to:** `WENDY_TECHNICAL_SPEC_v0.2.md`  
**Scope:** Versioned chart-of-accounts (COA) contract and seed-registration boundary; not a production account list or migration  
**Source of authority:** v0.2 §3 PD-03, §3 PD-04, §12 and §23

## 1. Normative rules

1. Vault uses a versioned internal Default COA template with stable internal account identities.
2. Display name and account number are not account identity.
3. System accounts and customer-custom accounts remain distinguishable.
4. `reporting_tag` mappings are versioned, and historical posted records must retain resolvable historical semantics after account deactivation.
5. All account templates, account instances, mappings and versions are scoped by `organization_id` where applicable.
6. Wendy MVP permits THB only as the functional and posting currency. No non-THB account posting capability is enabled by this artifact.
7. COA definitions are foundations only. This artifact grants neither posting authority nor a direct Ledger write path.

## 2. Required conceptual account classes

The Default COA template must be capable of representing these locked classes from v0.2:

```text
ASSET
  Cash / Bank
  Accounts Receivable
  Inventory
  Prepayments
  Other Assets

LIABILITY
  Accounts Payable
  Accrued Liabilities
  Borrowings
  Tax Liabilities
  Other Liabilities

EQUITY
REVENUE
COST_OF_SALES
OPERATING_EXPENSE
  Marketing / Advertising
  Rent
  Payroll
  Software
  Utilities
  Fees
  Other Expense
```

This list establishes supported **classes and roles**, not final account numbers, reporting tags, normal-balance settings, or seed rows beyond what v0.2 has approved.

## 3. M1 seed-registration contract

```ts
AccountTemplateSeed {
  template_account_id: string        // stable identity; never inferred from name
  coa_version_id: string
  account_class: string              // one of the conceptual classes above
  account_role?: string              // e.g. marketing_advertising_expense
  display_name: string
  presentation_code?: string
  system_account: boolean
  active_from: date
  active_to?: date
  reporting_mappings: ReportingMappingSeed[]
}

ReportingMappingSeed {
  mapping_id: string
  reporting_tag: string
  mapping_version: string
  effective_from: date
  effective_to?: date
}

OrganizationAccount {
  account_id: string
  organization_id: string
  template_account_id?: string
  account_role?: string
  display_name: string
  active: boolean
}
```

`account_role` is a semantic lookup key used by deterministic rules. It is not permission for an AI, Tax Engine, adapter or action executor to choose debit/credit account IDs.

## 4. First-slice account roles

The approved first slice needs these logical roles only:

| Role | Account class | Constraint |
|---|---|---|
| `marketing_advertising_expense` | `OPERATING_EXPENSE` | Debit candidate for the locked Meta Ads scenario |
| `cash_on_hand` | `ASSET` | May be a payment source when selected by the user/context |
| `bank` | `ASSET` | Must resolve to an organization-owned bank account; an example source may say SCB but no universal SCB account ID is seeded |

The exact Default COA seed rows, system/custom policy, account numbering, reporting-tag version set, and organization onboarding procedure remain unresolved in v0.2 §33.1. This artifact therefore MUST NOT be read as silently deciding any of them.

## 5. Version and lifecycle invariants

- A `coa_version_id` is immutable once referenced by an accepted Financial Event or Journal Draft.
- Deactivation prevents new use under policy but does not erase historical resolution.
- A reporting mapping revision appends an effective-dated version; it does not rewrite the prior mapping.
- An organization account can reference only a template/version valid for the same organization configuration context.
- A COA seed artifact does not itself create a Journal, Journal Draft, Financial Event or Ledger row.

## 6. Explicit non-decisions

This artifact does not decide accounting policy, debit/credit mappings, actual account numbers, COA seed values, tax treatment, approval thresholds, user roles, or posting behavior. Those require their approved owning artifacts/rules.

