# Wendy Chart of Accounts Seed v0.1

**Product:** Vault
**Engine:** Wendy
**Contract version:** `0.1.0`
**Status:** `LOCKED_FOR_M1`
**Date:** 2026-09-10
**Scope:** Minimum organization Chart of Accounts seed and stable reporting classification

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. This is a domain seed, not posting logic. Journal construction and account selection rules belong to M2.

## 1. Purpose and boundary

This seed provides the smallest coherent five-class chart needed to identify common SME accounts and support the first paid-expense slice without turning the chart into a tax engine or a reporting cache.

- The Ledger remains the authoritative source of **recorded accounting truth**.
- Account master data defines where accounting facts may be recorded; it does not itself recognize an event or authorize posting.
- The Accounting Engine owns final GL mapping and debit/credit construction.
- The Tax Engine may emit tax semantics or an `AccountingImpact`, but MUST NOT choose final account IDs.
- The Period Engine owns posting permission.
- `reporting_tag` supports stable aggregation; it MUST NOT be treated as a writable balance.

## 2. Account identity contract

```yaml
Account:
  account_id: uuid                 # permanent organization-scoped identity
  organization_id: uuid
  code: string                     # unique within organization, mutable by controlled command
  name: string
  account_type: AccountType
  normal_balance: NormalBalance
  parent_account_id: uuid | null
  posting_mode: HEADER | POSTABLE
  control: SYSTEM | CUSTOM
  status: ACTIVE | INACTIVE
  reporting_tag: ReportingTag | null # null only for HEADER
  system_key: string | null        # immutable for SYSTEM rows
  created_at: timestamp
  created_by: ActorRef
```

Rules:

1. `account_id` is the only durable reference. Codes, names, and tags MUST NOT be foreign keys.
2. `code` MUST match `^[0-9]{4}(?:-[A-Z0-9]{1,12})*$` and be unique per organization, including inactive accounts.
3. Seed codes are stable defaults, not legally prescribed numbers. An organization MAY rename or recode through an audited command, while `account_id`, `system_key`, and reporting semantics remain traceable.
4. A `HEADER` account cannot receive journal lines.
5. A `POSTABLE` account MUST have an active path to a root of the same `account_type`.
6. Posted journal lines retain `account_id`; later account changes MUST NOT rewrite ledger history.
7. An account with posted references MUST NOT be deleted. It MAY become `INACTIVE`.
8. An inactive account rejects new mapping/posting but remains queryable.
9. `normal_balance` is descriptive and used for validation/reporting. It does not authorize an unbalanced journal.

## 3. System and custom policy

### 3.1 SYSTEM accounts

`SYSTEM` accounts form the organization seed and carry an immutable `system_key`.

- Root and grouping headers MUST remain present.
- Their `account_type`, `normal_balance`, and `system_key` MUST NOT change.
- They MAY be renamed or recoded only through an audited organization command that preserves old aliases.
- A postable SYSTEM account MAY be made inactive only when organization policy has a valid replacement mapping and no mandatory control depends on it.
- System accounts are not globally shared rows; every row remains organization-scoped.

### 3.2 CUSTOM accounts

An organization MAY add custom header or postable accounts beneath a compatible SYSTEM or CUSTOM parent.

- A CUSTOM account MUST select one allowed `reporting_tag` and matching `account_type`.
- A CUSTOM account MUST NOT impersonate a `system_key`.
- Re-parenting or changing `reporting_tag` after posting requires an audited effective-dated mapping change; historical reports MUST remain reproducible.
- Funding-instrument accounts such as individual bank accounts SHOULD be CUSTOM children under `SYS.ASSET.CASH.BANK`.

### 3.3 Concrete bank-account policy

The seed contains a bank header, not a fictional bank balance. Organization setup MUST create at least one active CUSTOM postable bank account before the first paid-expense slice can use bank payment.

Example:

```yaml
code: 1120-SCB-001
name: SCB operating account
account_type: ASSET
normal_balance: DEBIT
parent_system_key: SYS.ASSET.CASH.BANK
posting_mode: POSTABLE
control: CUSTOM
reporting_tag: ASSET.CASH.BANK
```

The example name and code are not reserved defaults.

## 4. ReportingTag contract

`reporting_tag` is a stable semantic classification used by Ledger projections and Financial State Builder. It is not an account ID, posting rule, tax determination, or user-facing label.

Allowed values in v0.1:

```text
ASSET.CASH.ON_HAND
ASSET.CASH.BANK
ASSET.RECEIVABLE.TRADE
ASSET.TAX.VAT_INPUT_PENDING
ASSET.TAX.VAT_INPUT_RECOVERABLE
ASSET.PREPAYMENT
ASSET.PROPERTY_EQUIPMENT
ASSET.ACCUMULATED_DEPRECIATION

LIABILITY.PAYABLE.TRADE
LIABILITY.ACCRUED_EXPENSE
LIABILITY.TAX.VAT_OUTPUT
LIABILITY.TAX.WHT_PAYABLE
LIABILITY.BORROWING

EQUITY.CONTRIBUTED_CAPITAL
EQUITY.RETAINED_EARNINGS

REVENUE.OPERATING
REVENUE.OTHER

EXPENSE.COST_OF_SALES
EXPENSE.OPERATING.MARKETING
EXPENSE.OPERATING.PAYROLL
EXPENSE.OPERATING.RENT
EXPENSE.OPERATING.UTILITIES
EXPENSE.OPERATING.PROFESSIONAL_FEES
EXPENSE.OPERATING.BANK_FEES
EXPENSE.OPERATING.GENERAL
EXPENSE.DEPRECIATION
EXPENSE.INCOME_TAX
```

Tag rules:

1. The first segment MUST match `account_type`.
2. A postable account MUST have exactly one v0.1 primary tag.
3. Tag meaning is versioned centrally and MUST NOT be edited per organization.
4. Reports aggregate tagged posted journal lines. They MUST NOT accept manually written tag balances.
5. Tax-tagged accounts describe accounting presentation only. Eligibility, tax point, tax period, and tax amount remain Tax Engine semantics.
6. `ASSET.ACCUMULATED_DEPRECIATION` is an ASSET contra account with `normal_balance: CREDIT`.

## 5. Minimum seed

All rows below are `SYSTEM`. `Required` means the row MUST exist after organization initialization. Rows marked inactive are reserved for a future approved capability and MUST reject posting until activated through policy.

| Code | system_key | Name | Type | Normal | Parent | Mode | Initial status | reporting_tag |
|---|---|---|---|---|---|---|---|---|
| `1000` | `SYS.ASSET` | Assets | ASSET | DEBIT | — | HEADER | ACTIVE | — |
| `1100` | `SYS.ASSET.CASH` | Cash and cash equivalents | ASSET | DEBIT | `SYS.ASSET` | HEADER | ACTIVE | — |
| `1110` | `SYS.ASSET.CASH.ON_HAND` | Cash on hand | ASSET | DEBIT | `SYS.ASSET.CASH` | POSTABLE | ACTIVE | `ASSET.CASH.ON_HAND` |
| `1120` | `SYS.ASSET.CASH.BANK` | Bank accounts | ASSET | DEBIT | `SYS.ASSET.CASH` | HEADER | ACTIVE | — |
| `1200` | `SYS.ASSET.AR` | Trade accounts receivable | ASSET | DEBIT | `SYS.ASSET` | POSTABLE | ACTIVE | `ASSET.RECEIVABLE.TRADE` |
| `1300` | `SYS.ASSET.VAT_INPUT_PENDING` | Input VAT pending evidence | ASSET | DEBIT | `SYS.ASSET` | POSTABLE | INACTIVE | `ASSET.TAX.VAT_INPUT_PENDING` |
| `1310` | `SYS.ASSET.VAT_INPUT_RECOVERABLE` | Recoverable input VAT | ASSET | DEBIT | `SYS.ASSET` | POSTABLE | INACTIVE | `ASSET.TAX.VAT_INPUT_RECOVERABLE` |
| `1400` | `SYS.ASSET.PREPAYMENT` | Prepayments | ASSET | DEBIT | `SYS.ASSET` | POSTABLE | ACTIVE | `ASSET.PREPAYMENT` |
| `1500` | `SYS.ASSET.PPE` | Property and equipment | ASSET | DEBIT | `SYS.ASSET` | POSTABLE | ACTIVE | `ASSET.PROPERTY_EQUIPMENT` |
| `1590` | `SYS.ASSET.ACCUM_DEP` | Accumulated depreciation | ASSET | CREDIT | `SYS.ASSET` | POSTABLE | ACTIVE | `ASSET.ACCUMULATED_DEPRECIATION` |
| `2000` | `SYS.LIABILITY` | Liabilities | LIABILITY | CREDIT | — | HEADER | ACTIVE | — |
| `2100` | `SYS.LIABILITY.AP` | Trade accounts payable | LIABILITY | CREDIT | `SYS.LIABILITY` | POSTABLE | ACTIVE | `LIABILITY.PAYABLE.TRADE` |
| `2200` | `SYS.LIABILITY.ACCRUED_EXPENSE` | Accrued expenses | LIABILITY | CREDIT | `SYS.LIABILITY` | POSTABLE | ACTIVE | `LIABILITY.ACCRUED_EXPENSE` |
| `2300` | `SYS.LIABILITY.VAT_OUTPUT` | Output VAT payable | LIABILITY | CREDIT | `SYS.LIABILITY` | POSTABLE | INACTIVE | `LIABILITY.TAX.VAT_OUTPUT` |
| `2310` | `SYS.LIABILITY.WHT` | Withholding tax payable | LIABILITY | CREDIT | `SYS.LIABILITY` | POSTABLE | INACTIVE | `LIABILITY.TAX.WHT_PAYABLE` |
| `2400` | `SYS.LIABILITY.BORROWING` | Borrowings | LIABILITY | CREDIT | `SYS.LIABILITY` | POSTABLE | ACTIVE | `LIABILITY.BORROWING` |
| `3000` | `SYS.EQUITY` | Equity | EQUITY | CREDIT | — | HEADER | ACTIVE | — |
| `3100` | `SYS.EQUITY.CAPITAL` | Contributed capital | EQUITY | CREDIT | `SYS.EQUITY` | POSTABLE | ACTIVE | `EQUITY.CONTRIBUTED_CAPITAL` |
| `3200` | `SYS.EQUITY.RETAINED_EARNINGS` | Retained earnings | EQUITY | CREDIT | `SYS.EQUITY` | POSTABLE | ACTIVE | `EQUITY.RETAINED_EARNINGS` |
| `4000` | `SYS.REVENUE` | Revenue | REVENUE | CREDIT | — | HEADER | ACTIVE | — |
| `4100` | `SYS.REVENUE.OPERATING` | Operating revenue | REVENUE | CREDIT | `SYS.REVENUE` | POSTABLE | ACTIVE | `REVENUE.OPERATING` |
| `4900` | `SYS.REVENUE.OTHER` | Other revenue | REVENUE | CREDIT | `SYS.REVENUE` | POSTABLE | ACTIVE | `REVENUE.OTHER` |
| `5000` | `SYS.EXPENSE.COS` | Cost of sales | EXPENSE | DEBIT | — | POSTABLE | ACTIVE | `EXPENSE.COST_OF_SALES` |
| `6000` | `SYS.EXPENSE.OPERATING` | Operating expenses | EXPENSE | DEBIT | — | HEADER | ACTIVE | — |
| `6110` | `SYS.EXPENSE.MARKETING` | Marketing expense | EXPENSE | DEBIT | `SYS.EXPENSE.OPERATING` | POSTABLE | ACTIVE | `EXPENSE.OPERATING.MARKETING` |
| `6120` | `SYS.EXPENSE.PAYROLL` | Payroll expense | EXPENSE | DEBIT | `SYS.EXPENSE.OPERATING` | POSTABLE | ACTIVE | `EXPENSE.OPERATING.PAYROLL` |
| `6130` | `SYS.EXPENSE.RENT` | Rent expense | EXPENSE | DEBIT | `SYS.EXPENSE.OPERATING` | POSTABLE | ACTIVE | `EXPENSE.OPERATING.RENT` |
| `6140` | `SYS.EXPENSE.UTILITIES` | Utilities expense | EXPENSE | DEBIT | `SYS.EXPENSE.OPERATING` | POSTABLE | ACTIVE | `EXPENSE.OPERATING.UTILITIES` |
| `6150` | `SYS.EXPENSE.PROFESSIONAL_FEES` | Professional fees | EXPENSE | DEBIT | `SYS.EXPENSE.OPERATING` | POSTABLE | ACTIVE | `EXPENSE.OPERATING.PROFESSIONAL_FEES` |
| `6160` | `SYS.EXPENSE.BANK_FEES` | Bank fees | EXPENSE | DEBIT | `SYS.EXPENSE.OPERATING` | POSTABLE | ACTIVE | `EXPENSE.OPERATING.BANK_FEES` |
| `6190` | `SYS.EXPENSE.GENERAL` | General operating expense | EXPENSE | DEBIT | `SYS.EXPENSE.OPERATING` | POSTABLE | ACTIVE | `EXPENSE.OPERATING.GENERAL` |
| `6200` | `SYS.EXPENSE.DEPRECIATION` | Depreciation expense | EXPENSE | DEBIT | `SYS.EXPENSE.OPERATING` | POSTABLE | ACTIVE | `EXPENSE.DEPRECIATION` |
| `8000` | `SYS.EXPENSE.INCOME_TAX` | Income tax expense | EXPENSE | DEBIT | — | POSTABLE | INACTIVE | `EXPENSE.INCOME_TAX` |

The seed deliberately contains no automatic suspense account. A missing or ambiguous mapping MUST produce review or rejection rather than a silent suspense posting. A future approved accounting policy MAY add a controlled suspense account with explicit clearing and close rules.

## 6. First-slice readiness

An organization is ready for the paid-expense slice only when all are true:

- `SYS.EXPENSE.MARKETING` exists, is ACTIVE, and is POSTABLE.
- At least one active CUSTOM bank account exists under `SYS.ASSET.CASH.BANK`, or Cash on Hand is explicitly selected.
- Each payment-source reference is mapped to exactly one active postable cash/bank account by an approved, versioned M2 accounting policy.
- The target accounting period can be evaluated by the Period Engine.
- No tax-tagged account is activated merely because text contains a tax observation.

This readiness check does not define the journal. The M2 Accounting Engine and posting-rule contract will do that.

## 7. Validation identifiers

| Rule ID | Meaning |
|---|---|
| `COA-ID-001` | Account identity is UUID and organization-scoped. |
| `COA-CODE-001` | Account code format and organization uniqueness pass. |
| `COA-TYPE-001` | Parent/child account types are compatible. |
| `COA-POST-001` | HEADER account cannot receive journal lines. |
| `COA-STATUS-001` | INACTIVE account cannot receive new mappings/postings. |
| `COA-TAG-001` | Reporting tag exists and matches account type. |
| `COA-SYS-001` | SYSTEM key and locked semantics are unchanged. |
| `COA-HIST-001` | Master-data change preserves historical reproducibility. |
| `COA-BANK-001` | Concrete payment source resolves to one active postable bank/cash account. |

## 8. Explicit non-goals

- No debit/credit line construction, balancing, posting authorization, or ledger write.
- No complete statutory Thai chart, financial-statement disclosure taxonomy, consolidation, cost centers, inventory, payroll, fixed-asset register, FX, or multi-book behavior.
- No authoritative VAT, WHT, or CIT treatment. Tax accounts are inactive placeholders until a capability is approved.
- No mutable account balances.

## 9. Normative references

- `WENDY_TECHNICAL_SPEC_v0.2.md` §§0–3, 6–8, 13, 18–24.
- `WENDY_DOMAIN_TYPES_v0.1.md` for `AccountType`, `NormalBalance`, `AccountControl`, and `AccountStatus`.
- `WENDY_FIRST_EVENT_SCHEMA_v0.1.md` for the paid-expense event contract.
