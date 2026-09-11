# Wendy Domain Types v0.1

**Product:** Vault
**Engine:** Wendy
**Contract version:** `0.1.0`
**Status:** `LOCKED_FOR_M1`
**Date:** 2026-09-10
**Scope:** Domain primitives and enums for the M1 foundation and the first paid-expense vertical slice

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. This contract refines `WENDY_TECHNICAL_SPEC_v0.2.md`; it does not authorize production implementation or tax treatment.

## 1. Authority boundaries

- A confirmed `FinancialEvent` is an immutable, append-only statement of what happened. A correction creates a linked reversal, adjustment, or superseding event.
- The Ledger is the authoritative source of **recorded accounting truth**. It does not by itself prove completeness, external verification, tax truth, or economic reality.
- The Tax Engine owns tax classification, trigger, tax point, tax base, rate, eligibility, rule version, and tax-period semantics. It MUST NOT select final GL accounts or post to the Ledger.
- The Accounting Engine owns recognition policy, GL mapping, debit/credit semantics, and balanced journal construction.
- The Period Engine alone grants or denies accounting-period posting permission.
- AI outputs are proposals. They remain non-authoritative until schema checks, deterministic rules, authorization, provenance, duplicate controls, and any required human review succeed.
- Financial State is a versioned, time-scoped derived view. It MUST NOT write back to authoritative facts.

## 2. Serialization conventions

| Concept | Contract |
|---|---|
| Enum | Upper snake case ASCII string; unknown values MUST fail closed unless the consuming contract explicitly permits forward-compatible passthrough. |
| UUID | Lowercase RFC 4122 textual form. IDs are opaque and MUST NOT encode business meaning. |
| Date | ISO 8601 calendar date, `YYYY-MM-DD`. |
| Timestamp | RFC 3339 timestamp with an explicit UTC offset; authoritative storage SHOULD normalize to UTC while retaining organization timezone separately. |
| Decimal | Base-10 string matching `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`; binary floating point is prohibited. |
| Currency | ISO 4217 uppercase code. M1/M5 permits `THB` only. |
| Version | Semantic version string where this contract requests a schema version; frozen business rules use an immutable rule-version identifier. |

Unknown fields MUST be rejected at authoritative write boundaries unless a schema explicitly marks an extension object.

## 3. Identity and reference primitives

```yaml
OrganizationId: uuid
ActorId: uuid
AccountId: uuid
FinancialEventId: uuid
EconomicGroupId: uuid
SourceArtifactId: uuid
EvidenceId: uuid
AccountingPeriodId: uuid
TaxPeriodId: uuid
RuleId: non-empty ASCII string
RuleVersion: non-empty immutable version string
IdempotencyKey: non-empty opaque string, scoped by organization + operation
EventFingerprint: lowercase SHA-256 hex string
```

An `AccountId` is permanent identity. An account code or display name is not identity and MUST NOT be used as a foreign key.

### 3.1 ActorRef

```yaml
ActorRef:
  actor_type: USER | SERVICE
  actor_id: uuid
  display_name: string | null
```

`display_name` is descriptive only and MUST NOT authorize an operation.

### 3.2 SourceRef and EvidenceRef

```yaml
SourceRef:
  source_id: uuid
  source_artifact_id: uuid
  source_record_id: string | null
  content_hash: string

EvidenceRef:
  evidence_id: uuid
  evidence_type: SOURCE_ARTIFACT | DOCUMENT | USER_CONFIRMATION | EXTERNAL_RECORD
  content_hash: string | null
```

At least one immutable source reference is required before a candidate can become a confirmed first-slice event.

## 4. Money

```yaml
Money:
  value: decimal-string
  currency: ISO-4217
```

Rules:

1. `value` MUST be canonical: no thousands separators, plus sign, exponent notation, or redundant leading zeroes.
2. `-0`, `-0.00`, and equivalent negative-zero forms are invalid.
3. `Money` is unsigned in the first event contracts: `value > 0`. Direction comes from event semantics, never from the sign.
4. M1/M5 supports `THB` only and at most two fractional digits.
5. Arithmetic MUST use decimal or integer minor units and MUST reject currency mismatch.
6. Rounding MUST NOT occur silently. Any later rule that rounds MUST record the rounding mode and rule version.

## 5. OrganizationRole

```text
OWNER
ADMIN
PREPARER
REVIEWER
APPROVER
ACCOUNTANT
TAX_PREPARER
TAX_APPROVER
CLOSE_ADMIN
AUDITOR_READ_ONLY
SERVICE
```

Roles are organization-scoped labels, not self-executing permission. Server-side policy MUST evaluate the actor, organization, requested capability, amount/risk thresholds, and separation-of-duties rules. Client-supplied roles are never authoritative.

For the first slice, `PREPARER` MAY prepare a candidate and an authorized `REVIEWER`, `APPROVER`, or `ACCOUNTANT` MAY confirm it according to organization policy. A `SERVICE` MAY perform deterministic processing but MUST NOT satisfy a required human review.

## 6. Account types

### 6.1 AccountType

```text
ASSET
LIABILITY
EQUITY
REVENUE
EXPENSE
```

### 6.2 NormalBalance

```text
DEBIT
CREDIT
```

### 6.3 AccountControl

```text
SYSTEM
CUSTOM
```

### 6.4 AccountStatus

```text
ACTIVE
INACTIVE
```

### 6.5 AccountPostingMode

```text
HEADER
POSTABLE
```

`AccountType` describes accounting classification; it is not a reporting taxonomy. Stable reporting semantics come from `reporting_tag` as defined in `WENDY_COA_SEED_v0.1.md`.

## 7. Event domain and lifecycle

### 7.1 EventDomain

```text
BUSINESS
DOCUMENT
PAYMENT
SETTLEMENT
TAX
SOURCE
CORRECTION
CONTROL
```

For compatibility with the v0.2 canonical envelope, `EventDomain` is serialized in the field `event_domain`. `BUSINESS` covers economic/accounting recognition. `SOURCE` covers evidence observations. `CORRECTION` and `CONTROL` remain distinct values even if a storage projection groups them together. `event_family` is not a canonical persisted replacement for `event_domain`; it MAY exist only as optional derived taxonomy metadata.

### 7.2 EventStatus

```text
DRAFT
CANDIDATE
REVIEW_REQUIRED
VALIDATED
CONFIRMED
REJECTED
REVERSED
```

Allowed lifecycle:

```text
DRAFT → CANDIDATE → VALIDATED → CONFIRMED
                    └────────→ REVIEW_REQUIRED → CONFIRMED
          └──────────────────→ REJECTED
CONFIRMED ──new linked correction──→ REVERSED
```

- `VALIDATED` means deterministic validation passed; it is not authority to post.
- `CONFIRMED` is the authoritative event boundary.
- Each persisted event revision is immutable. A workflow transition appends a new revision/status record; it MUST NOT rewrite the prior payload.
- `REVERSED` is a projection derived from a confirmed reversal relationship. The original confirmed event remains stored and unchanged.

### 7.3 EventRelationshipType

```text
CAUSED_BY
DERIVED_FROM
FULFILLS
SETTLES
EVIDENCED_BY
MATCHES
TRIGGERS_TAX
REVERSES
ADJUSTS
SUPERSEDES
```

Relationship direction is `from_event_id --relationship_type--> to_event_id`. Both events MUST belong to the same organization.

## 8. Approval

### 8.1 ApprovalLevel

```text
AUTO_POST
USER_CONFIRM
ACCOUNTANT_OR_ADMIN_APPROVAL
```

`AUTO_POST` never bypasses deterministic validation or authorization. The first paid-expense slice is fixed at `USER_CONFIRM`. `NONE`, `REVIEWER_CONFIRMATION`, `SINGLE_APPROVER`, and `DUAL_CONTROL` are not values of `approval_level`. If required by a future policy, they belong to a separate control-mechanism axis such as `approval_control_mode` or approval-policy details. `USER_CONFIRM` is not automatically equivalent to `REVIEWER_CONFIRMATION`; `SINGLE_APPROVER` and `DUAL_CONTROL` may later refine `ACCOUNTANT_OR_ADMIN_APPROVAL` but are not approval levels themselves.

### 8.2 ApprovalStatus

```text
NOT_REQUIRED
PENDING
APPROVED
REJECTED
EXPIRED
```

An approval is bound to an immutable candidate hash. Editing a candidate invalidates prior approval and requires a new approval decision.

## 9. PeriodStatus

The accounting-period state is independent of tax-period and filing state.

```text
OPEN
PRE_CLOSE
REVIEW
ADJUSTING
READY_TO_CLOSE
CLOSED
LOCKED
REOPEN_REQUESTED
APPROVED
REOPENED
```

`APPROVED` is valid only as the approval state following `REOPEN_REQUESTED`; it does not mean a journal is approved. `REOPENED` is a controlled posting window, not permission to mutate prior events or journals.

Only the Period Engine interprets these states into a `PostingAuthorization` or denial. Other services MUST NOT infer posting permission merely from an enum value. In the first slice, ordinary posting requires a Period Engine authorization for a target period currently governed as `OPEN`.

## 10. Tax-related types

These types establish contracts only. The first paid-expense slice does not activate authoritative VAT, WHT, or CIT behavior.

### 10.1 TaxType

```text
VAT
WHT
CIT
```

### 10.2 TaxDeterminationStatus

```text
NOT_EVALUATED
CANDIDATE
REVIEW_REQUIRED
DETERMINED
NOT_APPLICABLE
```

Only a Tax Engine result under a frozen `rule_id`, `rule_version`, and input snapshot may be `DETERMINED`. AI output can be at most `CANDIDATE`.

### 10.3 TaxEligibilityStatus

```text
UNKNOWN
PENDING_EVIDENCE
ELIGIBLE
INELIGIBLE
NOT_APPLICABLE
```

Observed input VAT with missing evidence MUST remain `PENDING_EVIDENCE`; it MUST NOT become usable tax credit.

### 10.4 TaxEventStatus

```text
CONFIRMED
REVERSED
ADJUSTED
```

`REVERSED` and `ADJUSTED` describe append-only relationships/projections. A confirmed TaxEvent is never edited in place.

### 10.5 TaxPeriod

`TaxPeriod` is a temporal/calendar identity used to associate tax semantics with a date range. It is not a filing workflow state machine and has no canonical workflow status in M1.

```yaml
TaxPeriod:
  tax_period_id: uuid
  organization_id: uuid
  start_date: YYYY-MM-DD
  end_date: YYYY-MM-DD
```

TaxPeriod, TaxPosition, TaxFilingSnapshot, and Tax Filing Workflow are separate concepts. No filing, amendment, acknowledgement, lock, or posting behavior is implemented in M1.

### 10.6 TaxFilingWorkflowStatus — deferred to M7

```text
PREPARING
READY_TO_FILE
FILED
ACKNOWLEDGED
AMENDMENT_REQUIRED
AMENDED
```

These values are owned by Tax Filing Control, not `TaxPeriod`. Their transition graph is deferred to M7 and MUST NOT be inferred during M1.

### 10.7 TaxFilingSnapshotStatus

```text
DRAFT
APPROVED
FILED
ACKNOWLEDGED
SUPERSEDED
```

Filed snapshots are immutable. An amendment creates a new revision linked through `amends_snapshot_id` or supersession metadata.

## 11. ValidationDisposition

```text
PASS
REVIEW_REQUIRED
REJECT
DUPLICATE
```

`PASS` confirms only the scope of the invoked validator. It never implies tax correctness, account mapping, period authorization, or posting.

## 12. Compatibility policy

- Enum values and serialized field names are stable for contract version `0.1.x`.
- Adding an enum value is a breaking change for fail-closed authoritative consumers and requires a minor contract version plus explicit consumer readiness.
- Renaming/removing a value, changing meaning, or weakening a validation invariant requires a major contract version.
- Persisted records MUST store the schema and relevant rule-context versions used at creation.

## 13. Normative references

- `WENDY_TECHNICAL_SPEC_v0.2.md` §§1–8, 10–13, 18–21.
- `WENDY_COA_SEED_v0.1.md` for account and reporting-tag policy.
- `WENDY_FIRST_EVENT_SCHEMA_v0.1.md` for first-slice event constraints.
- `sources/Tax Authority in Vault_ Who May Decide, Create, Post, Correct, and Re-evaluate Tax` for the tax/accounting/period authority boundary.
- `work/vault-close-engine/report-source.md` for independent accounting/tax period semantics.
