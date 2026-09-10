# Wendy Domain Types v0.1

**Status:** Normative companion artifact for Milestone M1  
**Applies to:** `WENDY_TECHNICAL_SPEC_v0.2.md`  
**Scope:** Provider-neutral domain contracts and invariants; no adapters, persistence schema, posting flow, tax calculation, reconciliation or Financial State  
**Source of authority:** v0.2 §§2, 3, 8, 11, 14, 23 and 24

## 1. Contract conventions

- Every tenant-scoped contract carries `organization_id`; the server derives authorization scope separately.
- Monetary amount is an exact decimal string. Binary floating-point values are never valid contract input.
- `THB` is the only M1/MVP posting currency. Foreign source amounts remain evidence and are not represented as a posting capability here.
- Identifiers are opaque strings at the contract boundary; storage format is intentionally not chosen.
- All mutation-capable engine requests require `EngineRequest` and an idempotency key.
- Status and role values not locked by v0.2 remain extensible strings rather than invented enums.

## 2. Identity and organization boundary

```ts
type OrganizationId = string
type UserId = string
type MembershipId = string
type AccountId = string
type COAVersionId = string
type RuleSetId = string
type RuleVersionId = string
type FinancialEventId = string
type EconomicGroupId = string
type TraceId = string
type RequestId = string

Organization {
  organization_id: OrganizationId
  legal_name: string
  display_name: string
  status: string
}

OrganizationMembership {
  membership_id: MembershipId
  organization_id: OrganizationId
  user_id: UserId
  role_key: string
  status: string
}
```

`role_key` does not imply a permission model. The exact Owner/Admin/Accountant permissions and segregation-of-duties policy remain unresolved.

## 3. Exact money

```ts
ExactMoney {
  amount: decimal_string
  currency: "THB"
}

SourceMoneyEvidence {
  amount: decimal_string
  currency: string
}
```

`decimal_string` is a base-10 textual amount. Amount precision/rounding policy is not invented here. M1 validates syntactic exactness and THB posting currency only.

## 4. Profiles

```ts
AccountingProfile {
  organization_id: OrganizationId
  fiscal_year_start: date
  fiscal_year_end: date
  accounting_standard: string
  entity_type: string
  functional_currency: "THB"
  timezone: string
}

TaxProfile {
  tax_profile_id: string
  organization_id: OrganizationId
  jurisdiction: string
  status: string
  effective_from: date
  effective_to?: date
  configuration_ref?: string
}
```

`TaxProfile` is identity/configuration metadata only. `status` remains policy-owned rather than a hard-coded workflow enum. M1 neither determines tax nor computes a TaxResult, TaxEvent, TaxPosition or filing state.

## 5. Versioned COA and rule foundations

```ts
COAVersion {
  coa_version_id: COAVersionId
  organization_id: OrganizationId
  version: string
  effective_from: date
  effective_to?: date
  status: string
}

Account {
  account_id: AccountId
  organization_id: OrganizationId
  stable_key: string
  display_name: string
  account_class: string
  account_role?: string
  coa_version_id: COAVersionId
  active: boolean
}

RuleSet {
  rule_set_id: RuleSetId
  organization_id: OrganizationId
  domain: string
  status: string
}

RuleVersion {
  rule_version_id: RuleVersionId
  rule_set_id: RuleSetId
  version: string
  effective_from: date
  effective_to?: date
  logic_ref: string
  change_reason: string
}
```

M1 stores/validates version identity and effective dates only. It does not execute accounting or tax rules.

## 6. Engine envelopes

```ts
EngineRequest<T> {
  contract_version: string
  request_id: RequestId
  trace_id: TraceId
  idempotency_key: string
  organization_id: OrganizationId
  actor: {
    actor_type: "USER" | "SERVICE" | "AI_PROPOSAL" | "INTEGRATION"
    actor_id?: string
  }
  requested_at: datetime
  payload: T
}

EngineError {
  error_code: string
  severity: "WARNING" | "REVIEW" | "BLOCKING" | "SYSTEM"
  message: string
  field?: string
  rule_id?: string
  retryable: boolean
  trace_id: TraceId
}
```

M1 supports the v0.2 core error vocabulary: `INVALID_SCHEMA`, `SOURCE_MISSING`, `DUPLICATE_SOURCE`, `DUPLICATE_EVENT`, `CLASSIFICATION_UNCERTAIN`, `REVIEW_REQUIRED`, `RULE_VIOLATION`, `ACCOUNT_NOT_FOUND`, `TAX_PROFILE_MISSING`, `PERIOD_CLOSED`, `PERIOD_LOCKED`, `JOURNAL_UNBALANCED`, `LEDGER_POST_FAILED`, `RECONCILIATION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `STALE_FINANCIAL_STATE`, and `INTERNAL_ERROR`.

## 7. Financial Event identity and relationship primitives

```ts
FinancialEventIdentity {
  event_id: FinancialEventId
  organization_id: OrganizationId
  event_type: string
  event_domain: string
  event_version: integer
  economic_group_id?: EconomicGroupId
  source_refs: string[]
  trace_id: TraceId
  status: string
}

FinancialEventRelation {
  relation_id: string
  organization_id: OrganizationId
  from_event_id: FinancialEventId
  to_event_id: FinancialEventId
  relation_type: string
  trace_id: TraceId
}
```

The contract preserves v0.2 distinctions between economic/accounting recognition, payment, settlement, tax trigger, evidence and correction/control. A relation must be organization-consistent and cannot self-reference. A relationship primitive neither validates an event nor produces a Journal.

## 8. Explicit exclusions from M1

These types deliberately exclude provider adapters, LINE, AI execution, Financial Event processing lifecycle, Journal Draft construction, Ledger posting, Tax Engine calculations, Reconciliation, Period Close processing and Financial State construction.
