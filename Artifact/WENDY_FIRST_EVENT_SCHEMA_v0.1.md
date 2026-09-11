# Wendy First Event Schema v0.1

**Product:** Vault
**Engine:** Wendy
**Contract version:** `0.1.0`
**Schema version:** `wendy.financial-event.paid-expense/0.1.0`
**Status:** `LOCKED_FOR_M1`
**Date:** 2026-09-10
**Scope:** `ExpenseRecognized` + `PaymentMade` contract for the first paid-expense vertical slice

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. This contract stops at confirmed linked Financial Events. Posting-rule implementation, journal construction, balancing, Period authorization, and Ledger posting belong to M2.

## 1. Locked semantic outcome

The first slice represents one immediate paid expense as two distinct facts:

```text
ExpenseRecognized  = the organization recognized an expense
PaymentMade        = value left an organization-controlled payment source
```

The events MUST remain distinct even when created by one atomic `ConfirmPaidExpense` command. `ExpenseRecognized ≠ PaymentMade`. Neither event is a journal, and confirmation is not posting permission.

Both confirmed events are immutable. Corrections create linked reversal/adjustment/replacement events; they never rewrite the original records.

## 2. Authority boundary

| Concern | Authority |
|---|---|
| Candidate extraction/classification | Capture/Normalize/Classify; proposal only |
| Required fields, event semantics, duplicate decision, confirmation | Validation/Event Service |
| Tax classification, tax point, eligibility, tax amount, tax period | Tax Engine; not active authoritatively in this slice |
| Final account IDs and debit/credit lines | Accounting Engine in M2 |
| Accounting-period posting permission | Period Engine in M2 |
| Atomic immutable ledger write | Ledger Posting Service in M2 |

AI MAY propose every user-entered field but MUST NOT set `CONFIRMED`, approve itself, select authoritative tax treatment, grant period permission, or post.

## 3. Shared FinancialEvent envelope

### 3.1 Required fields

```yaml
FinancialEvent:
  event_id: uuid
  organization_id: uuid
  economic_group_id: uuid
  event_domain: BUSINESS | PAYMENT
  event_type: ExpenseRecognized | PaymentMade
  schema_version: wendy.financial-event.paid-expense/0.1.0
  event_version: positive-integer
  status: EventStatus

  occurred_at: timestamp
  effective_date: date
  accounting_date: date
  amount: Money

  payload: object
  source_refs: [SourceRef, ...]
  evidence_refs: [EvidenceRef, ...]
  related_event_refs: [EventRelationship, ...]

  idempotency_key: string
  event_fingerprint: sha256-hex
  rule_context_version: string
  approval:
    required_level: ApprovalLevel
    status: ApprovalStatus
    candidate_hash: sha256-hex
    decided_at: timestamp | null
    decided_by: ActorRef | null

  created_at: timestamp
  created_by: ActorRef
```

### 3.2 Optional envelope fields

```yaml
  document_date: date | null
  payment_date: date | null
  settlement_date: date | null
  tax_point_date: date | null
  reverses_event_id: uuid | null
  adjusts_event_id: uuid | null
  supersedes_event_id: uuid | null
  extension: object | null
```

Rules:

- `source_refs` MUST contain at least one immutable source artifact/ref with a content hash.
- `evidence_refs` MUST contain the human confirmation evidence before `CONFIRMED` in v0.1.
- `rule_context_version` identifies the deterministic validation/policy bundle; it is not a tax determination or posting-rule version.
- Exactly one of `reverses_event_id`, `adjusts_event_id`, and `supersedes_event_id` MAY be present on a correction event. They are absent on the original first-slice pair.
- One generic `date` field is prohibited. The meanings of dates MUST remain explicit.

## 4. ExpenseRecognized

### 4.1 Fixed envelope values

```yaml
event_domain: BUSINESS
event_type: ExpenseRecognized
```

### 4.2 Required payload

```yaml
ExpenseRecognizedPayload:
  expense_category: MARKETING | PAYROLL | RENT | UTILITIES | PROFESSIONAL_FEES | BANK_FEES | GENERAL
  description: non-empty string
  recognition_basis: IMMEDIATE_PAID_EXPENSE
  supplier:
    display_name: non-empty string
    counterparty_id: uuid | null
    identification_status: PROVIDED | RESOLVED | UNRESOLVED
```

### 4.3 Optional payload

```yaml
  service_period:
    start_date: date
    end_date: date
  document_reference:
    document_number: string | null
    document_type: RECEIPT | INVOICE | TAX_INVOICE | OTHER | null
  tax_observations:
    vat_mentioned: boolean | null
    wht_mentioned: boolean | null
    stated_tax_amount: Money | null
    evidence_refs: [EvidenceRef, ...]
    authority: OBSERVATION_ONLY
  user_note: string | null
  ai_proposal:
    model_id: string
    model_version: string
    confidence_by_field: object
    output_hash: sha256-hex
```

`expense_category` is business classification input. It is not an `account_id`. Mapping it to a final active account belongs to the M2 Accounting Engine and an approved versioned posting rule.

Tax observations MUST remain non-authoritative. They MUST NOT activate input VAT, WHT, a TaxEvent, a TaxPosition, or tax-related ledger posting in this slice.

## 5. PaymentMade

### 5.1 Fixed envelope values

```yaml
event_domain: PAYMENT
event_type: PaymentMade
```

### 5.2 Required envelope specialization

```yaml
payment_date: date
```

### 5.3 Required payload

```yaml
PaymentMadePayload:
  payment_method: BANK_TRANSFER | CASH
  payment_source_ref:
    payment_source_id: uuid
    source_type: BANK_ACCOUNT | CASH_ON_HAND
    display_label: non-empty string
  payee:
    display_name: non-empty string
    counterparty_id: uuid | null
    identification_status: PROVIDED | RESOLVED | UNRESOLVED
  payment_status: COMPLETED
```

### 5.4 Optional payload

```yaml
  external_payment_reference: string | null
  bank_transaction_observation_ref: uuid | null
  memo: string | null
  ai_proposal:
    model_id: string
    model_version: string
    confidence_by_field: object
    output_hash: sha256-hex
```

`payment_source_ref` identifies the organization-controlled funding instrument. It is not a GL account ID. Its deterministic mapping to exactly one active postable cash/bank account is an M2 precondition.

`payment_status: COMPLETED` records the user's confirmed statement for this first slice. It is not external settlement or reconciliation proof. A later `BankTransactionObserved` and reconciliation record may verify or dispute the observation without overwriting this event.

## 6. Relationship contract

```yaml
EventRelationship:
  relationship_id: uuid
  organization_id: uuid
  from_event_id: uuid
  relationship_type: FULFILLS
  to_event_id: uuid
  created_at: timestamp
  created_by: ActorRef
```

For this slice:

```text
PaymentMade --FULFILLS--> ExpenseRecognized
```

There MUST be exactly one such link inside the confirmed paid-expense pair. Both events MUST share `organization_id`, `economic_group_id`, currency, and the first-slice composite amount.

This link means that the payment fulfills the immediate paid-expense transaction. It does not state tax treatment, bank settlement, reconciliation, or journal lines.

## 7. Atomic command boundary

The application MAY expose one command:

```yaml
ConfirmPaidExpense:
  organization_id: uuid
  candidate_id: uuid
  candidate_hash: sha256-hex
  confirmed_by: ActorRef
  idempotency_key: string
  expected_candidate_version: positive-integer
```

Successful command output:

```yaml
ConfirmedPaidExpense:
  economic_group_id: uuid
  expense_event_id: uuid
  payment_event_id: uuid
  relationship_id: uuid
  validation_result_id: uuid
  confirmation_audit_ref: uuid
```

All records in this result MUST commit atomically or none may become confirmed. A retry with the same organization-scoped idempotency key and identical input hash MUST return the prior result. Reuse with a different input hash MUST fail with `IDEMPOTENCY_CONFLICT`.

The command output MUST NOT include a posted journal ID in M1. Downstream M2 services consume the confirmed event pair separately.

## 8. Deterministic validation rules

### 8.1 Core envelope

| Rule ID | Deterministic requirement | Failure disposition |
|---|---|---|
| `EVT-CORE-001` | IDs and schema version are valid and organization-scoped. | REJECT |
| `EVT-CORE-002` | Required envelope and type-specific fields are present; unknown fields outside `extension` are rejected. | REJECT |
| `EVT-CORE-003` | `event_domain` and `event_type` match the contract. | REJECT |
| `EVT-CORE-004` | `occurred_at`, `effective_date`, and `accounting_date` are valid explicit temporal values in organization context. | REJECT |
| `EVT-CORE-005` | Each persisted revision is immutable; transition/correction attempts append records. | REJECT |
| `EVT-ORG-001` | Actor, source, evidence, payment source, events, and relationship belong to the same organization. | REJECT |

### 8.2 Money and pair consistency

| Rule ID | Deterministic requirement | Failure disposition |
|---|---|---|
| `MON-001` | Money uses a canonical decimal string; no binary floating point or negative zero. | REJECT |
| `MON-002` | Amount is greater than zero. | REJECT |
| `MON-003` | Currency is `THB` with at most two fractional digits. | REJECT |
| `PAIR-001` | Expense and payment amount/currency are exactly equal in v0.1. | REJECT |
| `PAIR-002` | Both events share one `economic_group_id`. | REJECT |
| `PAIR-003` | Supplier and payee resolve to the same counterparty, or normalized display names match; ambiguous mismatch requires review. | REVIEW_REQUIRED |

Split payments, partial payments, tips, fees, reimbursements, prepayments, accrued expenses, and mixed-currency pairs are outside v0.1 and MUST be rejected as `EVENT_SEMANTICS_UNSUPPORTED`, not coerced into this pair.

### 8.3 Event-specific semantics

| Rule ID | Deterministic requirement | Failure disposition |
|---|---|---|
| `EXP-001` | `expense_category`, `description`, supplier, and `IMMEDIATE_PAID_EXPENSE` basis are present. | REJECT |
| `EXP-002` | Service-period end is not before start when supplied. | REJECT |
| `EXP-003` | Expense category is supported and resolvable by current organization policy; ambiguous classification requires review. | REVIEW_REQUIRED |
| `PMT-001` | `payment_date`, method, completed status, payment source, and payee are present. | REJECT |
| `PMT-002` | Payment source is organization-controlled and active. | REJECT |
| `PMT-003` | Method and source type agree: bank transfer→bank account; cash→cash on hand. | REJECT |
| `DATE-001` | For immediate paid expense v0.1, `effective_date`, `accounting_date`, and `payment_date` are the same organization-local calendar date. | REJECT |

`DATE-001` is a first-slice narrowing assumption, not a universal accounting rule. A later contract must represent late recognition, accruals, prepayments, and policy-derived recognition dates without rewriting v0.1 history.

### 8.4 Relationship, provenance, duplicate, and review

| Rule ID | Deterministic requirement | Failure disposition |
|---|---|---|
| `LINK-001` | Exactly one `PaymentMade --FULFILLS--> ExpenseRecognized` link exists. | REJECT |
| `LINK-002` | Link endpoints and relationship are organization-scoped and non-self-referential. | REJECT |
| `PROV-001` | Each event has at least one immutable source ref and content hash. | REJECT |
| `PROV-002` | Field/event lineage can trace the confirmed values to source and human confirmation decision. | REJECT |
| `IDEMP-001` | Command and event keys are organization-scoped and non-empty. | REJECT |
| `IDEMP-002` | Same key + same input returns the prior effect; same key + changed input conflicts. | DUPLICATE or REJECT |
| `DUP-001` | Event fingerprint check finds no conflicting prior authoritative pair. | DUPLICATE or REVIEW_REQUIRED |
| `APR-001` | Required level is `USER_CONFIRM` for the first slice. | REJECT |
| `APR-002` | Approval actor is server-authorized and is human; decision binds the exact candidate hash. | REJECT |
| `APR-003` | Candidate changed after approval. | REJECT and require new approval |
| `AI-001` | AI-derived values remain proposals until all deterministic and review gates pass. | REVIEW_REQUIRED |

Suggested event fingerprint inputs are canonicalized `organization_id + source identity + source record identity/content hash + event type + amount + currency + effective/payment date + normalized payment source`. The exact canonicalization algorithm MUST be frozen in the M2 idempotency contract before implementation.

## 9. Validation result

```yaml
ValidationResult:
  validation_result_id: uuid
  organization_id: uuid
  candidate_id: uuid
  candidate_hash: sha256-hex
  schema_version: string
  ruleset_version: string
  disposition: PASS | REVIEW_REQUIRED | REJECT | DUPLICATE
  checks:
    - rule_id: string
      outcome: PASS | FAIL | NOT_APPLICABLE
      detail_code: string | null
  duplicate_of_economic_group_id: uuid | null
  validated_at: timestamp
  validator_service_version: string
```

`PASS` means this event-schema ruleset passed. It does not assert tax correctness, GL mapping, journal balance, accounting-period permission, ledger posting, external settlement, or reconciliation.

## 10. Confirmation preconditions

A pair MAY become `CONFIRMED` only when:

1. both schemas pass deterministic validation;
2. pair and relationship rules pass;
3. organization authorization passes server-side;
4. provenance and duplicate checks pass;
5. an authorized human confirms the exact candidate hash;
6. tax observations, if any, remain clearly non-authoritative;
7. the atomic write can create both events and their relationship exactly once.

Period posting authorization is deliberately **not** a confirmation precondition. It is required later when M2 attempts to post a journal. This preserves the boundary between “the event happened” and “the journal may post into this accounting period.”

## 11. Example: confirmed pair

The following is illustrative and contains no posting logic.

```yaml
economic_group_id: 7f286f4e-40c0-4c50-8c34-2e15ed720ccd

expense:
  event_id: 67d3396b-44d7-488b-9cff-755ad5893fc2
  organization_id: 8dc58877-f02d-4f6d-b38e-aa2191053c27
  event_domain: BUSINESS
  event_type: ExpenseRecognized
  schema_version: wendy.financial-event.paid-expense/0.1.0
  event_version: 1
  status: CONFIRMED
  occurred_at: 2026-09-10T10:00:00+07:00
  effective_date: 2026-09-10
  accounting_date: 2026-09-10
  amount: { value: "3500.00", currency: THB }
  payload:
    expense_category: MARKETING
    description: Meta Ads
    recognition_basis: IMMEDIATE_PAID_EXPENSE
    supplier: { display_name: Meta, counterparty_id: null, identification_status: PROVIDED }

payment:
  event_id: b05be9aa-c4fb-4276-8442-e437fc977c26
  organization_id: 8dc58877-f02d-4f6d-b38e-aa2191053c27
  event_domain: PAYMENT
  event_type: PaymentMade
  schema_version: wendy.financial-event.paid-expense/0.1.0
  event_version: 1
  status: CONFIRMED
  occurred_at: 2026-09-10T10:00:00+07:00
  effective_date: 2026-09-10
  accounting_date: 2026-09-10
  payment_date: 2026-09-10
  amount: { value: "3500.00", currency: THB }
  payload:
    payment_method: BANK_TRANSFER
    payment_source_ref:
      payment_source_id: d96d897e-daf5-4560-905c-d1ac953a719e
      source_type: BANK_ACCOUNT
      display_label: SCB
    payee: { display_name: Meta, counterparty_id: null, identification_status: PROVIDED }
    payment_status: COMPLETED

relationship:
  from_event_id: b05be9aa-c4fb-4276-8442-e437fc977c26
  relationship_type: FULFILLS
  to_event_id: 67d3396b-44d7-488b-9cff-755ad5893fc2
```

The omitted shared envelope fields remain required in an actual persisted record.

## 12. Explicit exclusions

- No posting-rule table, account selection, debit/credit semantics, JournalDraft, balancing, PostingAuthorization, or Ledger write.
- No receipt OCR requirement, FX, split/partial payment, accrual, prepayment, refund, reimbursement, card authorization/capture/settlement, or payment initiation.
- No authoritative VAT/WHT/CIT determination or posting. WHT in particular may be triggered by payment only after an approved Tax Engine capability exists.
- No inference that `COMPLETED` means externally settled or reconciled.
- No AI auto-confirm or auto-post.

## 13. M2 hand-off contract

M2 may consume only a confirmed, validated, linked pair plus frozen organization accounting policy and chart context. M2 must then independently:

1. resolve versioned accounting policy and final active account IDs;
2. construct and balance a `JournalDraft`;
3. obtain explicit Period Engine `PostingAuthorization` for the accounting date;
4. post atomically and idempotently through Ledger Posting Service;
5. create an immutable ledger revision and preserve event/source/rule lineage.

These are downstream obligations, not implementation contained in this schema.

## 14. Normative references

- `WENDY_TECHNICAL_SPEC_v0.2.md` §§0.3, 1–8, 10–13, 18–21.
- `WENDY_DOMAIN_TYPES_v0.1.md` for shared primitives/enums.
- `WENDY_COA_SEED_v0.1.md` for account identity and reporting classification.
- `sources/Tax Authority in Vault_ Who May Decide, Create, Post, Correct, and Re-evaluate Tax` for tax authority and correction boundaries.
- `work/vault-close-engine/report-source.md` for period and late-event separation.
