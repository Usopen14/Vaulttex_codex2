# PAID_EXPENSE Engineering DTO / Schema Contract v1

**Status:** `FROZEN_NON_PRODUCTION — IMPLEMENTATION NOT AUTHORIZED`
**Schema bundle version:** `wendy.paid-expense.dto/1.0.0`
**Parent contract:** [`WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_v1.md`](WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_v1.md)
**Immutable Accounting input:** `PAID_EXPENSE v1`

This is a versioned schema specification, not source code, a database migration, or an API exposed to a client. All persisted field names use the established snake_case convention. IDs, Money, ActorRef, source/evidence references, Event relationship direction, and `approval_level` retain their M1 meanings.

## 1. Common constraints

```yaml
common:
  ids: lowercase RFC-4122 UUID unless an existing M1 branded identifier says otherwise
  money:
    currency: THB
    value: positive exact M1 decimal text, at most two fractional digits
  date: YYYY-MM-DD organization-local calendar date
  timestamp: RFC-3339 timestamp with explicit UTC offset
  hash: lowercase SHA-256 hex
  approval_level:
    - AUTO_POST
    - USER_CONFIRM
    - ACCOUNTANT_OR_ADMIN_APPROVAL
```

The contracts reject unknown enum values, cross-organization references, unsigned/opaque IDs that fail M1 validation, non-THB Money, and client-supplied role/capability conclusions. `OWNER_OVERRIDE` may appear only in approval-control metadata, never as an `approval_level` value.

## 2. Authorization Decision DTO v1

```yaml
AuthorizationDecisionRequest:
  contract_version: wendy.paid-expense.authorization-decision/1.0.0
  authorization_request_id: uuid
  organization_id: uuid
  source_request_id: uuid
  idempotency_key: opaque non-empty string
  requested_operation: >
    SUBMIT | USER_CONFIRM | ELEVATED_APPROVAL | CORRECTION_APPROVAL |
    PERIOD_ESCALATION | LEDGER_POST | PAID_EXPENSE_CORRECTION
  actor: ActorRef                         # authenticated requester; USER | SERVICE only
  originator: ActorRef                    # original submitter; canonical identity comparison
  affected_effect:
    economic_group_id: uuid
    event_refs:
      - event_id: uuid
        event_version: positive integer
        event_type: ExpenseRecognized | PaymentMade
    original_journal_entry_id: uuid | null # required for correction operations
  required_approval_level: canonical M1 approval_level
  approval_context:
    user_confirmation:
      candidate_id: uuid | null
      candidate_hash: sha256-hex | null
      confirmed_by: ActorRef | null
      confirmation_audit_ref: string | null
    elevated_review:
      review_case_ref: string | null
      decision_ref: string | null
    owner_override:
      explicitly_requested: boolean
      justification: string | null
  policy_references:
    - WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-01
    - WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-02
    - WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-03
    - WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-04
  trace_id: uuid

AuthorizationDecisionResponse:
  contract_version: wendy.paid-expense.authorization-decision/1.0.0
  authorization_decision_id: uuid
  organization_id: uuid
  requested_operation: same as request
  decision: ALLOWED | REVIEW_REQUIRED | DENIED
  reason_codes: non-empty list of stable code strings
  required_next_action: string | null
  evaluated_at: timestamp
  policy_version_refs: non-empty list of immutable policy references
  authorization_evidence_ref: string
  independent_approver_resolution:
    originator_actor_id: uuid
    candidate_actor_ids_ref: string
    independent_eligible_actor_ids_ref: string
    actor_identity_comparison: DIFFERENT | SAME
    resolution_at: timestamp
  approval_control_audit:
    control_mechanism: STANDARD_INDEPENDENT_APPROVAL | OWNER_OVERRIDE | NOT_APPLICABLE
    self_approved: boolean
    owner_override_reason: string | null
    source_request_id: uuid
    affected_event_refs: list of event id/version
    policy_version_ref: string
```

Validation requirements:

- `USER_CONFIRM` is `ALLOWED` only for a human User whose confirmation binds the exact candidate hash. The response must not imply any elevated accounting or posting authority.
- Elevated/correction approval must compare canonical actor IDs. `SAME` is denied unless every Owner Override condition in the approved policy is verified.
- Owner Override requires explicit request, nonblank justification, active authorized Owner capability, organization policy enablement, and a verified empty independent-eligible set. Its audit object is mandatory and `self_approved` is true.
- The Ledger Posting Service receives `ALLOWED` only after all prior controls are resolved. Human authorization is provenance; it is never a Ledger-write credential.

## 3. Period Authorization DTO v1

```yaml
PeriodAuthorizationRequest:
  contract_version: wendy.paid-expense.period-authorization/1.0.0
  period_authorization_request_id: uuid
  organization_id: uuid
  requester: ActorRef
  source_request_id: uuid
  requested_operation: ORIGINAL_POST | REVERSAL | CORRECTED_REPLACEMENT
  financial_effect:
    economic_group_id: uuid
    event_refs: list of event id/version/type
    original_journal_entry_id: uuid | null
  proposed_accounting_date: YYYY-MM-DD
  proposed_posting_date: YYYY-MM-DD
  accounting_profile_snapshot:
    organization_id: uuid
    timezone: IANA timezone string
    functional_currency: THB
    snapshot_ref: immutable content reference
  accounting_period_id: uuid
  observed_period_version: positive integer
  accounting_rule:
    rule_id: PAID_EXPENSE
    immutable_rule_version: v1 | approved replacement version
  approval_context_ref: string
  trace_id: uuid

PeriodAuthorizationResponse:
  contract_version: wendy.paid-expense.period-authorization/1.0.0
  period_authorization_decision_id: uuid
  organization_id: uuid
  accounting_period_id: uuid
  observed_period_version: positive integer
  requested_operation: same as request
  decision: POSTING_ALLOWED | PERIOD_DENIED | REVIEW_REQUIRED
  reason_codes: non-empty list of stable code strings
  required_approval_or_escalation: string | null
  accounting_profile_snapshot_ref: immutable content reference
  period_policy_version_refs: non-empty list
  decided_at: timestamp
```

`proposed_accounting_date` and `proposed_posting_date` must be equal for M2. The original and corrected replacement derive the date as defined by Accounting Rule v1; reversal uses the approved period-authorized date without moving either date automatically. The response is evidence, not a Ledger write. It must be revalidated against its observed period version in the Ledger transaction.

## 4. Mapping resolution DTOs v1

```yaml
CategoryAccountResolutionRequest:
  contract_version: wendy.paid-expense.category-account-resolution/1.0.0
  organization_id: uuid
  expense_category: canonical M1 ExpenseCategory
  effective_accounting_date: YYYY-MM-DD
  accounting_rule: { rule_id: PAID_EXPENSE, immutable_rule_version: v1 }
  required_side: DEBIT
  required_account_class: EXPENSE

PaymentSourceAccountResolutionRequest:
  contract_version: wendy.paid-expense.payment-source-account-resolution/1.0.0
  organization_id: uuid
  payment_source_id: uuid
  payment_source_type: BANK_ACCOUNT | CASH_ON_HAND
  effective_accounting_date: YYYY-MM-DD
  accounting_rule: { rule_id: PAID_EXPENSE, immutable_rule_version: v1 }
  required_side: CREDIT
  required_account_class: CASH_OR_BANK_ASSET

MappingResolutionResponse:
  contract_version: matching request contract version
  organization_id: uuid
  resolution: EXACTLY_ONE | ZERO_ELIGIBLE | MULTIPLE_ELIGIBLE | INELIGIBLE | CROSS_ORGANIZATION
  evaluated_effective_date: YYYY-MM-DD
  mapping_id: uuid | null
  mapping_version: string | null
  mapping_effective_from: YYYY-MM-DD | null
  mapping_effective_to: YYYY-MM-DD | null
  resolved_account_id: uuid | null
  coa_version_ref: string | null
  account_eligibility_evidence_ref: string | null
  reason_codes: non-empty list
```

Only `EXACTLY_ONE` permits its side of a draft. Every other resolution is `REVIEW_REQUIRED`, with no fallback to a system, Suspense, Miscellaneous, display-label, bank-name, or guessed account.

## 5. Tax-impact eligibility DTO v1

This interim DTO is frozen as an integration boundary only. Its use for a simple PAID_EXPENSE post remains blocked until [`WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.1.md`](WENDY_PAID_EXPENSE_TAX_IMPACT_ELIGIBILITY_GATE_v0.1.md) receives the required Product and Accounting approvals.

```yaml
TaxImpactEligibilityDecision:
  contract_version: wendy.paid-expense.tax-impact-eligibility/1.0.0
  tax_impact_eligibility_decision_id: uuid
  decision_version: positive integer
  organization_id: uuid
  economic_group_id: uuid
  financial_event_refs: exact ExpenseRecognized and PaymentMade event id/version pair
  fulfills_relationship_id: uuid
  accounting_rule: { rule_id: PAID_EXPENSE, immutable_rule_version: v1 }
  outcome: >
    NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED |
    SEPARATE_ACCOUNTING_IMPACT_REQUIRED |
    UNRESOLVED
  accounting_reviewer:
    actor: M1 ActorRef where actor_type = USER
    reviewer_authorization_evidence_ref: immutable reference
    accounting_reviewer_capability_ref: immutable reference
  rationale: non-empty string
  evidence_refs: non-empty list of M1 EvidenceRef
  decided_at: RFC-3339 timestamp
  decision_provenance_hash: sha256-hex
  supersedes_tax_impact_eligibility_decision_id: uuid | null

TaxImpactEligibilityConsumption:
  tax_impact_eligibility_decision_id: uuid
  decision_version: positive integer
  decision_provenance_hash: sha256-hex
  organization_id: uuid
  economic_group_id: uuid
  event_refs: exact consumed event id/version pair
  accounting_rule: { rule_id: PAID_EXPENSE, immutable_rule_version: v1 }
  journal_entry_id: uuid
  consumed_at: RFC-3339 timestamp
  posting_transaction_ref: immutable reference
```

Only an exact, authorized, evidence-backed `NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED` decision may be consumed. The other outcomes, a missing/mismatched record, or an unapproved reviewer capability return `REVIEW_REQUIRED`. The decision is never a substitute for Tax Engine authority, accounting authorization, Period authorization, mapping, balance, idempotency, or Ledger invariants.

## 6. JournalDraft DTO v1

```yaml
JournalDraft:
  contract_version: wendy.paid-expense.journal-draft/1.0.0
  journal_draft_id: uuid
  organization_id: uuid
  financial_effect_fingerprint:
    contract_version: wendy.paid-expense-effect-fingerprint/1.0.0
    value: sha256-hex
  event_refs:
    - event_id: uuid
      event_version: positive integer
      event_type: ExpenseRecognized | PaymentMade
  economic_group_id: uuid
  fulfills_relationship_ref: uuid
  accounting_rule:
    rule_id: PAID_EXPENSE
    immutable_rule_version: v1
  accounting_date: YYYY-MM-DD
  posting_date: YYYY-MM-DD
  currency: THB
  mapping_provenance:
    category_mapping: MappingResolutionResponse where resolution = EXACTLY_ONE
    payment_source_mapping: MappingResolutionResponse where resolution = EXACTLY_ONE
  lines:
    - line_number: positive integer
      account_id: uuid
      debit: Money | null
      credit: Money | null
      line_provenance_ref: immutable content reference
  total_debit: Money
  total_credit: Money
  provenance:
    source_refs: non-empty list of M1 SourceRef
    evidence_refs: list of M1 EvidenceRef
    confirmation_audit_ref: string
    validation_result_ref: uuid
    tax_impact_eligibility_decision_ref: uuid
    authorization_decision_ref: uuid
    period_authorization_ref: uuid
    trace_id: uuid
```

Invariants: exactly one Expense debit mapping and one Cash/Bank credit mapping; two or more lines only where approved future rule versions require them (v1 has the two direct lines); every line belongs to the organization; `debit XOR credit`; each present amount is positive exact THB Money; `total_debit == total_credit` by exact decimal arithmetic; dates are equal; mappings and the exact consumed `NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED` decision are valid in their retained effective context. A JournalDraft is not a posted Journal and cannot be mutated into a post without rechecking this contract.

## 7. Posting result and correction-chain DTOs v1

```yaml
PostingResult:
  contract_version: wendy.paid-expense.posting-result/1.0.0
  organization_id: uuid
  idempotency_namespace: string
  idempotency_key: opaque string
  outcome: POSTED | REVIEW_REQUIRED | REJECTED | DUPLICATE | PERIOD_DENIED | IN_PROGRESS | UNKNOWN_OUTCOME
  financial_effect_fingerprint: sha256-hex | null
  journal_entry_id: uuid | null
  existing_result_ref: string | null
  review_case_ref: string | null
  period_authorization_ref: uuid | null
  reason_codes: list of stable code strings
  committed_transaction_ref: string | null
  trace_id: uuid

CorrectionCase:
  contract_version: wendy.paid-expense.correction-case/1.0.0
  correction_case_id: uuid
  organization_id: uuid
  original_journal_entry_id: uuid
  reversal_journal_entry_id: uuid
  corrected_replacement_journal_entry_id: uuid
  original_effect_fingerprint: sha256-hex
  replacement_effect_fingerprint: sha256-hex
  reason: non-empty string
  source_request_id: uuid
  requester: ActorRef
  approval_decision_ref: uuid
  reversal_period_authorization_ref: uuid
  replacement_period_authorization_ref: uuid
  original_rule_mapping_provenance_ref: immutable content reference
  replacement_rule_mapping_provenance_ref: immutable content reference
  event_relationship_refs: list of M1 REVERSES | SUPERSEDES relationship references
  created_at: timestamp
```

`PostingResult.outcome` keeps the Product Owner’s five canonical user/domain outcomes distinguishable. `IN_PROGRESS` and `UNKNOWN_OUTCOME` are transport/processing states, never successful financial effects. A correction case can exist only when the two new Journal records commit atomically with it.

## 8. Formal Engineering acceptance record

**Acceptance status:** `PENDING_ENGINEERING_OWNER_ACCEPTANCE`

| Evidence field | Recorded value |
|---|---|
| Engineering owner | `PENDING/TBD` |
| Role | `PENDING/TBD` |
| Decision | `PENDING/TBD` — permitted values: `ACCEPT`, `ACCEPT_WITH_REQUIRED_CHANGE`, `REJECT` |
| Decision date | `PENDING/TBD` |
| Evidence reference | `PENDING/TBD` |
| Accepted contract version | `PENDING/TBD` — must equal `wendy.paid-expense.engineering-contract/1.0.0` |
| Accepted DTO bundle version | `PENDING/TBD` — must equal `wendy.paid-expense.dto/1.0.0` |
| Accepted test-contract version | `PENDING/TBD` — must equal `wendy.paid-expense.acceptance-tests/1.0.0` |

This evidence must explicitly cover the authorization/SOD, Period, mapping, tax-impact eligibility, JournalDraft, PostingResult, and correction DTO contracts as part of the Engineering acceptance bundle. Codex must not be recorded as the owner or approver.
