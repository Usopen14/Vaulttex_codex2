# Wendy Technical Specification v0.2 — Reviewed & Consolidated

**Product:** Vault  
**Engine:** Wendy  
**Status:** Architecture approved; core authority model consolidated; implementation permitted only by milestone after remaining blocking decisions for that milestone are resolved  
**Specification version:** 0.2  
**Date:** 2026-09-10  
**Supersedes:** `WENDY_TECHNICAL_SPEC_v0.1.md` for architecture and domain semantics  
**Primary review role:** Product Owner / Architecture Review  
**Implementation posture:** Contract-first, deterministic financial core, AI-assisted interpretation

> This revision is a consolidation of the original Codex specification plus the Product Owner review, deep-research conclusions, and decisions made after v0.1. Where v0.2 conflicts with v0.1, v0.2 controls.

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** indicate normative requirement strength. This document defines contracts and boundaries before production implementation. It is not legal, tax, or accounting advice; tax/regulatory rules used in production require authoritative-source maintenance and appropriate specialist review.

---

## 0. Review Disposition and Resolved Comments

### 0.1 Overall disposition

- **Architecture:** APPROVED.
- **Financial truth model:** APPROVED WITH REFINEMENT.
- **Financial Event Model:** REVISED AND LOCKED CONCEPTUALLY.
- **Engine Contracts:** ADDED AND LOCKED CONCEPTUALLY.
- **Tax Authority Model:** ADDED.
- **Accounting Period & Close Engine:** ADDED.
- **Financial State:** REDEFINED AND EXPANDED.
- **MVP scope:** NARROWED to an explicit first vertical slice.
- **Implementation:** may proceed milestone-by-milestone only after the milestone's unresolved policy inputs are approved.

### 0.2 Review comments resolved in v0.2

**RC-01 — “Ledger is the sole financial truth” was too coarse.**  
v0.2 uses typed authority. The posted General Ledger is the authority for **accounting truth**. Confirmed Tax Events and Tax Positions are authoritative for **tax semantics/position** under their rule versions. Reconciliation/period controls are authoritative for **verification/control state**. `FinancialState` is the canonical read model derived from those authoritative facts; it is not a second ledger.

**RC-02 — Financial Event semantics were too generic.**  
A payment is not automatically an expense; a bank transaction is not automatically revenue; a tax point is not automatically the accounting-recognition date. v0.2 separates economic/accounting recognition, payment, settlement, tax, evidence, and correction/control semantics.

**RC-03 — `transactions` should not be a core source-of-truth entity in MVP.**  
The customer-facing transaction feed becomes a **derived read model / projection**. Core authority remains event + journal + ledger + tax/control facts.

**RC-04 — Reconciliation placement was ambiguous.**  
Before Ledger: use **Source Matching / Duplicate Detection / Evidence Linking** as validation controls.  
After Ledger: use **Financial Reconciliation** to compare authoritative books with external evidence. A mismatch never writes the Ledger directly.

**RC-05 — Capture needed a verification gate.**  
Low-confidence or materially uncertain extraction MUST route to `USER_CONFIRM` / correction / re-upload. The original AI extraction MUST remain preserved beside the confirmed value.

**RC-06 — Tax logic needed its own authority boundary.**  
Tax Engine owns tax semantics; it MUST NOT directly mutate the General Ledger. Accounting Engine owns account mapping and journal construction. Period Engine owns accounting-period posting permission. Tax Filing Control owns filing revision/amendment state.

**RC-07 — Financial State was too narrow.**  
It is no longer merely “a query result from posted ledger.” It combines accounting facts, tax positions, reconciliation/control facts, external-source freshness/completeness, and liquidity semantics while preserving each fact's authority.

**RC-08 — Accounting period logic was missing as a first-class engine.**  
`Accounting Period & Close Engine` is added, with distinct accounting, management-reporting, tax, and external statement/settlement cycles.

**RC-09 — Engine contract naming was inconsistent.**  
Research drafts used `business_id`; this specification standardizes tenant/authority scope on **`organization_id`** to match the original Wendy architecture.

**RC-10 — MVP was too broad.**  
The first end-to-end proof is explicitly locked to **LINE Text → Expense paid by Cash/Bank → Ledger → Expense Summary**, while keeping the domain model accrual-capable.

---

## 1. Executive Summary

Vault is the customer-facing product. Wendy is the financial/intelligence engine behind Vault.

Wendy v0.2 remains a modular, linear-first system:

```text
Input
  ↓
Understand
  ↓
Establish Authoritative Facts
  ↓
Build Financial State
  ↓
Think
  ↓
Decide / Act
  ↓
Output
```

The architecture intentionally separates **interpretation** from **authority**.

```text
AI / Parser / User Evidence
        ↓
Observation / Proposal
        ↓
Deterministic Validation
        ↓
Authoritative Domain Events
        ↓
Accounting / Tax / Period Controls
        ↓
Ledger + Tax + Reconciliation Facts
        ↓
Financial State
        ↓
Reasoning / Decision / Action
```

### 1.1 Typed authority model

Wendy MUST NOT collapse all financial authority into one component.

```text
Accounting Engine + Ledger
→ accounting recognition and posted accounting truth

Tax Engine + Tax Events / Tax Position
→ tax semantics and tax position

Period & Close Engine
→ accounting-period posting / close / lock authority

Reconciliation Engine
→ matching and verification/control state

Financial State Builder
→ canonical read model over authoritative facts and evidence

AI
→ interpretation/proposals/explanations, never authority by itself
```

### 1.2 Locked invariants

1. `SUM(DEBIT) = SUM(CREDIT)` for every posted Journal Entry.
2. No AI, adapter, reasoner, action executor, Tax Engine, or Reconciliation Engine may directly write posted ledger rows.
3. A posted accounting record is immutable in economic meaning; corrections use linked reversal/adjustment/correction records.
4. Source evidence is not authoritative financial truth merely because it came from a bank, POS, processor, file, or user.
5. Business/Economic Event ≠ Payment Event ≠ Settlement Event.
6. Accounting Event ≠ Tax Event automatically.
7. One economic transaction MAY produce many related events.
8. Every authoritative financial fact MUST be traceable back to source/evidence and the rule versions that established it.
9. Idempotency/duplicate protection is a core financial invariant, not a transport convenience.
10. Financial State is read-only to the reasoning layer and derives from authoritative facts.
11. Financial State quality problems MUST remain visible; missing/stale/unreconciled data MUST NOT be silently treated as complete or zero.
12. Financial Actions that change financial reality MUST create new events and re-enter the normal authority path.
13. AI confidence alone MUST NOT grant posting authority.
14. Tax Engine MAY declare what tax means; it MUST NOT declare the General Ledger true.
15. Period & Close Engine MAY block accounting posting; it MUST NOT choose tax-period treatment for convenience.

---

## 2. Product and Domain Definitions

| Term | Normative definition |
|---|---|
| **Vault** | Customer-facing product and experience. |
| **Wendy** | Software financial/intelligence engine behind Vault. |
| **Organization** | Tenant, authorization, accounting, and tax boundary for a customer business. |
| **Source** | Original external or internal input identity, e.g. LINE message, file, POS payload, bank item. |
| **Observation** | Machine- or human-readable description extracted from a Source; not yet a financial fact. |
| **ClassificationProposal** | Proposed semantic/category mapping, possibly AI-assisted; not authoritative. |
| **Financial Event** | Confirmed domain event describing an economic/accounting/payment/settlement/correction fact or intent. It is a logical model, not necessarily one physical table for all event domains. |
| **TaxResult** | Recomputable result of Tax Engine evaluation using explicit inputs and a rule version. It does not mean “filed” and does not post. |
| **TaxEvent** | Immutable confirmed tax-relevant fact established under a rule version. |
| **TaxPosition** | Derived current/period tax liability, credit, or other tax position resulting from Tax Events. |
| **TaxFilingSnapshot** | Immutable/revisioned record of what was declared externally for a tax period. |
| **JournalDraft** | Balanced accounting representation proposed by Accounting Engine before posting. |
| **Journal Entry / Lines** | Posted balanced accounting record. |
| **Ledger** | Set of posted Journal Entries/Lines. Authority for accounting books. |
| **Reconciliation Result** | Verification/control fact comparing authoritative books/events with external evidence. |
| **Financial State** | Versioned, time-scoped canonical business read model derived from accounting facts, tax positions, reconciliation/control state, external evidence, freshness/completeness, and liquidity semantics. |
| **Forecast** | Future-looking projection based on Financial State plus assumptions. Not actual state. |
| **Insight** | Interpretation of State/Forecast/Evidence. Not a financial fact. |
| **Decision** | Durable proposed/approved disposition over evidence and state. |
| **Financial Action** | Authorized action that changes financial reality and therefore creates new domain events. |
| **Output** | Channel-neutral state/information/alert/insight/action result. |
| **Communication** | Delivery of Output through LINE, Vault UI, API, notifications, etc. |
| **Supabase** | Initial infrastructure provider for PostgreSQL/Storage/Auth capabilities; not owner of Wendy domain logic. |
| **AI Model** | Replaceable provider component behind Wendy contracts; not Wendy itself. |

---

## 3. Locked Product Decisions

These decisions replace the corresponding v0.1 Open Questions.

### PD-01 — Initial vertical slice

**LOCKED:**  

```text
LINE Text
→ Expense paid by Cash/Bank
→ Financial Event(s)
→ Deterministic Accounting Rule
→ Journal
→ Ledger
→ Expense Summary
→ LINE Response
```

Example input:

```text
วันนี้จ่ายค่า Meta Ads 3,500 บาทจาก SCB
```

Expected accounting outcome, when the expense is recognized and paid at the same time under approved policy:

```text
Dr Marketing / Advertising Expense   3,500 THB
Cr SCB Bank                          3,500 THB
```

Semantically, Wendy SHOULD still be able to represent the linked facts `ExpenseRecognized` and `PaymentMade` separately even when a deterministic posting rule produces one combined Journal Entry.

### PD-02 — Accounting basis

**LOCKED:** Wendy's accounting model is **accrual basis**, aligned with the approved TFRS-for-NPAEs product policy.

The first vertical slice intentionally begins with cash-settled expenses for implementation simplicity, but the core model MUST NOT assume:

```text
cash movement = revenue/expense recognition
```

AR/AP, accruals, prepayments, cut-off, and period close remain supported by the domain model even if their automations arrive later.

### PD-03 — Default Chart of Accounts

**LOCKED CONCEPT:** Vault uses its own versioned Default COA template, with stable internal account identities and `reporting_tag` mappings to approved DBD/TFRS reporting structures.

Requirements:

- account identity MUST NOT depend on display name alone;
- account numbering MAY be a presentation/configuration choice;
- system accounts and customer-custom accounts MUST be distinguishable;
- `reporting_tag` / statement mapping MUST be versioned;
- posted lines MUST continue resolving historical account/reporting semantics after account deactivation;
- exact seed-account list remains a Milestone-1 configuration artifact, not a hard-coded universal taxonomy.

Minimum conceptual classes:

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

### PD-04 — Currency

**LOCKED:** Wendy MVP uses **THB as functional and posting currency**.

However:

- Source ingestion MUST preserve original foreign-currency amount/currency where present.
- Foreign amount MAY be normalized and displayed as evidence.
- Authoritative multi-currency posting, FX gains/losses, and revaluation are OUT of MVP.
- No non-THB Journal may post until a multi-currency policy is approved.

### PD-05 — Tax scope

**LOCKED MVP SCOPE:**

```text
Domestic VAT
Domestic WHT
Basic Current CIT / tax-deductibility
Tax Profile
Tax Period / Calendar linkage
Tax Audit Trail
```

The MVP is **not** a complete Thai tax-compliance engine. PIT, advanced cross-border tax, PP36, SBT, stamp duty, treaty logic, payroll tax, and advanced CIT adjustments are deferred unless separately approved.

### PD-06 — Financial Event vocabulary

**LOCKED CONCEPT:** use semantic events rather than one generic `TransactionCreated`.

Minimum logical vocabulary includes:

```text
Revenue:
  SaleRecognized

Expense:
  ExpenseRecognized

Receivable / Payable:
  ReceivableCreated
  ReceivableSettled
  PayableCreated
  PayableSettled

Accrual / Prepayment:
  ExpenseAccrued
  RevenueAccrued
  PrepaymentRecognized
  PrepaymentConsumed

Payment:
  PaymentAuthorized
  PaymentCaptured
  PaymentReceived
  PaymentMade

Settlement:
  SettlementCreated
  SettlementReceived

Fees:
  FeeCharged

Refund:
  RefundRecognized
  RefundPaid

Tax:
  VATTaxPointOccurred
  WHTObligationTriggered

Documents:
  InvoiceIssued
  InvoiceReceived
  TaxInvoiceIssued
  CreditNoteIssued
  DebitNoteIssued

Evidence:
  BankTransactionObserved
  POSRecordObserved
  ProcessorRecordObserved

Correction / Control:
  EventReversed
  CorrectionPosted
  PeriodClosed
  PeriodReopened
  PeriodLocked
```

This is a logical vocabulary. It MUST NOT be interpreted as “create one table per event.”

### PD-07 — Posting rules

**LOCKED:** authoritative posting rules are deterministic, versioned, testable mappings from approved Financial Event context to balanced JournalDrafts.

Rules:

- AI may propose classification/account candidates, never final debit/credit authority.
- Tax Engine may emit `AccountingImpact`, never direct account IDs or Ledger writes.
- Accounting Engine resolves Chart of Accounts and builds balanced JournalDrafts.
- Period Engine must approve posting date/period eligibility.
- Ledger Service performs atomic post + provenance + audit.
- A posting rule version used for a posted Journal MUST remain reconstructible.

### PD-08 — Review and approval policy

**LOCKED CONCEPT:** three authority levels:

```text
AUTO_POST
USER_CONFIRM
ACCOUNTANT_OR_ADMIN_APPROVAL
```

`AUTO_POST` is not “AI confidence above threshold.” It requires an approved deterministic routing policy and all relevant validation/authority checks.

Initial vertical slice default:

```text
USER_CONFIRM
```

until sufficient production-quality evidence supports safe auto-posting.

Examples likely requiring `ACCOUNTANT_OR_ADMIN_APPROVAL` include policy overrides, prior/locked-period adjustments, manual journals, material tax ambiguity, corrections to previously filed tax data, and other high-risk cases defined by policy.

---

## 4. Architecture Principles

1. **Understand before authority.** Raw input, OCR, AI output, user text, bank/POS rows, and document values begin as observations/evidence.
2. **Typed authority.** Accounting, tax, period, reconciliation, and state-building have distinct authority.
3. **One controlled accounting write path.** Only Ledger Posting Service may create posted Journal records.
4. **AI assists; deterministic engines govern.**
5. **Event semantics precede posting.** Wendy asks “what happened?” before “which debit/credit?”
6. **Evidence is not automatically an economic fact.**
7. **Provenance by construction.**
8. **Organization isolation everywhere.**
9. **Idempotent financial processing.**
10. **Explicit versioned state transitions.**
11. **Fail closed for financial writes.**
12. **No silent historical rewrite.**
13. **Separate time semantics.** `occurred_at`, accounting date, payment date, tax point, filing period, and source time are not interchangeable.
14. **Provider portability.**
15. **MVP simplicity.** Linear orchestration first; no autonomous agent loop or multi-agent workflow engine.
16. **Quality is explicit.** Balanced books do not prove completeness or reconciliation.
17. **Decision traceability.** Wendy decisions/actions must identify the Financial State/evidence version used.
18. **Rules are effective-dated/versioned.** Especially tax and accounting policy.
19. **No engine may bypass another engine's authority.**
20. **Forecast and Insight never mutate actual State.**

---

## 5. System Context and Authority Flow

```text
INPUT PRODUCERS
LINE / FILE / POS / BANK / E-COMMERCE / API / WENDY ACTION
        │
        ▼
INGESTION + SOURCE STORAGE
        │
        ▼
CAPTURE / EXTRACT
        │
        ▼
EXTRACTION QUALITY CHECK
        │
        ├── uncertain ──→ USER CONFIRM / CORRECT / RE-UPLOAD
        │
        ▼
NORMALIZE
        │
        ▼
CLASSIFY ───────────────→ AI Proposal allowed
        │
        ▼
VALIDATE
  ├─ schema / org / account
  ├─ source matching / duplicate detection
  ├─ evidence requirements
  └─ routing / approval requirements
        │
        ▼
FINANCIAL EVENT(S)
        │
        ├─────────────→ TAX ENGINE
        │                 │
        │                 ├─ TaxResult
        │                 ├─ TaxEvent
        │                 └─ AccountingImpact
        │
        ▼
ACCOUNTING ENGINE
        │
        ▼
JOURNAL DRAFT
        │
        ▼
PERIOD & CLOSE ENGINE
        │
        ▼
LEDGER POSTING SERVICE
        │
        ▼
POSTED LEDGER
        │
        ├──────────────┐
        ▼              ▼
RECONCILIATION      TAX POSITION / FILING STATE
        │              │
        └──────┬───────┘
               ▼
      FINANCIAL STATE BUILDER
               ▼
         FINANCIAL STATE
          │           │
          ▼           ▼
       FORECAST     INSIGHT / REASON
                       │
                       ▼
                    DECIDE
                       │
                       ▼
                    EXECUTE
                       │
             financial action?
                 /          \
               no            yes
               │              │
               ▼              └──→ NEW REAL EVENT(S) → normal controls
             OUTPUT
```

### 5.1 Cross-cutting controls

- authorization and organization scope;
- trace/provenance;
- audit;
- rule/policy/model versions;
- idempotency;
- sensitive-data policy;
- observability;
- secrets;
- access to source artifacts;
- stale-state detection for decisions/actions.

---

## 6. Wendy Core Pipeline

### 6.1 INPUT

Input adapters accept messages/files/API payloads without asserting financial truth.

Output: `SourceEnvelope`.

### 6.2 CAPTURE / EXTRACT

Parsers/OCR/vision/AI transform raw sources into `ExtractedObservation`.

Allowed: extraction, OCR, table parsing, document-type proposal.  
Forbidden: posting, authoritative tax treatment, final accounting classification.

### 6.3 EXTRACTION QUALITY CHECK / CONFIRMATION

Critical fields MUST be evaluated individually where possible.

```text
ExtractedObservation
        ↓
VerificationDecision

AUTO_ACCEPTED
CONFIRMATION_REQUIRED
REUPLOAD_REQUIRED
```

A user confirmation means:

> “The captured source value matches what the user sees/knows.”

It does **not** mean:

> “The accounting/tax treatment is correct.”

When user correction occurs, preserve:

```text
original_extracted_value
user_corrected_value
final_confirmed_value
actor
time
reason / UI context
```

### 6.4 NORMALIZE

Convert confirmed/extracted values into canonical field semantics.

Normalize ≠ classify.

### 6.5 CLASSIFY

Produce `ClassificationProposal`.

AI MAY propose event type/category/counterparty/account candidates.  
Proposal MUST remain distinguishable from an authoritative decision.

### 6.6 VALIDATE

Deterministic controls decide whether the candidate can become/affect authoritative events.

Pre-ledger matching belongs here:

```text
Source Matching
Duplicate Detection
Evidence Linking
```

This is not Financial Reconciliation.

### 6.7 FINANCIAL EVENT

Create event(s) that represent what occurred, with event semantics and relationships.

### 6.8 ACCOUNTING / TAX / PERIOD AUTHORITY

Accounting, Tax, and Period engines apply their own contracts. They MUST NOT collapse into one generic “financial rules” function.

### 6.9 LEDGER

Atomic posting only after balanced journal, authorization, idempotency, provenance, and period approval.

### 6.10 RECONCILIATION

Compare posted/accounting facts with bank/POS/processor/other evidence. Mismatch routes to review; financial correction returns via new events.

### 6.11 FINANCIAL STATE

State Builder derives the canonical read model.

### 6.12 REASON / DECIDE / EXECUTE

AI may explain and propose. Authorization/policy governs action. Financial Actions create new events.

### 6.13 RECORD / TRACE / RESPOND / OUTPUT

Every final response retains references sufficient to explain where authoritative numbers came from and what quality limitations exist.

---

## 7. Input Architecture and Capture Verification

### 7.1 SourceEnvelope

```ts
SourceEnvelope {
  source_id: string
  organization_id: string

  source_type: string
  source_channel: string
  original_reference?: string

  captured_at?: datetime
  received_at: datetime

  content_type?: string
  artifact_refs?: string[]
  structured_payload_ref?: string

  sender_principal_ref?: string

  idempotency_key: string
  checksums?: string[]
  allowlisted_metadata?: object
}
```

`source_type` describes the nature of the source.  
`source_channel` describes transport.  
A photo MUST NOT imply receipt/invoice/slip classification.

### 7.2 ExtractedObservation

```ts
ExtractedObservation {
  observation_id: string
  organization_id: string
  source_id: string

  extracted_fields: FieldObservation[]
  raw_text_ref?: string

  extraction_method: "parser" | "ocr" | "vision_ai" | "llm"
  extraction_run_id: string

  warnings: EngineWarning[]
}
```

Each important field SHOULD preserve value, source locator, confidence, and extraction method.

### 7.3 Capture Verification

```ts
VerificationDecision {
  status:
    | "AUTO_ACCEPTED"
    | "CONFIRMATION_REQUIRED"
    | "REUPLOAD_REQUIRED"

  uncertain_fields: string[]
  critical_fields: string[]
  reason_codes: string[]
}
```

```ts
ConfirmedObservation {
  observation_id: string
  source_id: string
  organization_id: string

  confirmed_fields: object
  corrected_fields: object

  confirmed_by: string
  confirmed_at: datetime

  original_extraction_id: string
  trace_id: string
}
```

Original extraction is append-only evidence. User correction MUST NOT overwrite it.

---

## 8. Canonical Observation Schema and Engine Envelope

### 8.1 Canonical observation

```ts
NormalizedObservation {
  observation_id: string
  organization_id: string
  source_ids: string[]

  transaction_date?: date
  document_date?: date
  service_date?: date
  payment_date?: date

  amount?: {
    value: decimal_string
    currency: ISO4217
  }

  original_amount?: {
    value: decimal_string
    currency: string
  }

  counterparty_candidate?: object
  description?: string
  document?: object
  line_items?: object[]

  unresolved_fields: string[]
  normalization_confidence?: number

  provenance_ref: string
  schema_version: string
}
```

Rules:

- Accounting arithmetic MUST NOT use binary floating point.
- Original and normalized values MUST be preserved where transformation matters.
- Unknown values remain unknown; missing ≠ zero.
- THB is the only MVP posting currency.
- Foreign source amounts remain evidence, not authoritative FX posting.

### 8.2 EngineRequest envelope

All mutation-capable Wendy engines MUST use a common envelope or equivalent contract.

```ts
EngineRequest<T> {
  contract_version: string

  request_id: string
  trace_id: string
  idempotency_key?: string

  organization_id: string

  actor: {
    actor_type: "USER" | "SERVICE" | "AI_PROPOSAL" | "INTEGRATION"
    actor_id?: string
  }

  requested_at: datetime
  payload: T
}
```

`idempotency_key` is mandatory whenever a request may create or change financial, tax, control, filing, or external-action state.

### 8.3 Engine error envelope

```ts
EngineError {
  error_code: string

  severity:
    | "WARNING"
    | "REVIEW"
    | "BLOCKING"
    | "SYSTEM"

  message: string
  field?: string
  rule_id?: string

  retryable: boolean
  trace_id: string
}
```

Core codes include:

```text
INVALID_SCHEMA
SOURCE_MISSING
DUPLICATE_SOURCE
DUPLICATE_EVENT
CLASSIFICATION_UNCERTAIN
REVIEW_REQUIRED
RULE_VIOLATION
ACCOUNT_NOT_FOUND
TAX_PROFILE_MISSING
PERIOD_CLOSED
PERIOD_LOCKED
JOURNAL_UNBALANCED
LEDGER_POST_FAILED
RECONCILIATION_CONFLICT
IDEMPOTENCY_CONFLICT
STALE_FINANCIAL_STATE
INTERNAL_ERROR
```

---

## 9. AI Logic

### 9.1 Allowed

- OCR/vision/document understanding;
- extraction;
- merchant/entity normalization;
- semantic classification proposals;
- anomaly/context interpretation;
- reasoning and explanation over supplied authoritative/structured facts;
- UI wording.

### 9.2 Prohibited authority

AI MUST NOT be authoritative for:

- arithmetic totals;
- ledger balance;
- journal posting;
- debit/credit balancing;
- final tax liability;
- tax rule applicability without deterministic engine confirmation;
- period close/lock permission;
- reconciliation final state;
- financial statements;
- permission/approval;
- direct mutation of Financial State;
- direct mutation of Ledger.

### 9.3 AI provider boundary

```ts
AIService.execute(task, context) -> AIResult
```

Provider/model remains replaceable.

### 9.4 Confidence

Confidence MAY influence verification/routing, but:

```text
AI confidence
≠
authority
```

`AUTO_POST` requires deterministic policy approval and all mandatory controls.

---

## 10. Validation, Source Matching, and Approval Routing

### 10.1 Deterministic controls

Validation MUST cover as applicable:

- organization authorization and entity consistency;
- exact decimal money format;
- THB posting policy;
- dates/timezone/business period;
- required event fields;
- account existence/active state;
- source/provenance;
- source hash/reference;
- duplicate source/event/idempotency;
- source overlap such as bank/POS/processor;
- accounting-period permission;
- tax-profile presence when authoritative tax treatment is requested;
- approval level;
- event state transition/version.

### 10.2 Routing result

```ts
ValidationResult {
  validation_id: string
  decision:
    | "ACCEPTED"
    | "REJECTED"
    | "REQUIRES_REVIEW"

  validated_fields: object
  errors: EngineError[]
  warnings: EngineWarning[]

  rule_results: object[]
  rule_version: string

  approval_level:
    | "AUTO_POST"
    | "USER_CONFIRM"
    | "ACCOUNTANT_OR_ADMIN_APPROVAL"
}
```

### 10.3 Source Matching vs Reconciliation

```text
BEFORE LEDGER
→ source matching / duplicate detection / evidence linking

AFTER LEDGER
→ financial reconciliation
```

No function named `reconcile()` should ambiguously perform both roles.

---

## 11. Financial Event Model

### 11.1 Core semantic principle

The following are distinct:

```text
economic/business occurrence
accounting recognition
payment
settlement
tax trigger
document/evidence
control/correction
```

A convenient one-record `TransactionCreated` abstraction MUST NOT erase these distinctions.

### 11.2 Key invariants

```text
SaleRecognized ≠ PaymentReceived

ExpenseRecognized ≠ PaymentMade

PaymentCaptured ≠ SettlementReceived

SettlementReceived ≠ BankTransactionObserved

TaxInvoiceIssued ≠ SaleRecognized

InvoiceReceived ≠ ExpenseRecognized

Bank/POS/Processor observation ≠ authoritative accounting fact
```

One economic transaction MAY produce many related event records.

### 11.3 Event domains

Wendy MAY implement the model using one event store, multiple typed tables, or a hybrid, but the logical domains MUST remain distinguishable:

- Economic/Accounting Recognition Event
- Payment Event
- Settlement Event
- Tax Event
- Source/Evidence Observation
- Correction/Adjustment Event
- Period/Control Event

Pure source evidence SHOULD remain in Source/Observation structures rather than becoming a Financial Event automatically.

### 11.4 FinancialEvent core

```ts
FinancialEvent {
  event_id: string
  event_type: string
  event_domain: string
  event_version: integer

  organization_id: string
  economic_group_id?: string

  occurred_at?: datetime
  effective_date?: date

  accounting_date?: date
  payment_date?: date
  tax_point_candidate_date?: date

  amount?: {
    value: decimal_string
    currency: string
  }

  counterparty_id?: string

  source_refs: string[]
  evidence_refs?: string[]

  parent_event_id?: string
  related_event_ids?: string[]

  reverses_event_id?: string
  corrects_event_id?: string

  accounting_effect: "NONE" | "CANDIDATE" | "REQUIRED"
  tax_effect: "NONE" | "CANDIDATE" | "REQUIRED"
  cash_effect: "NONE" | "CANDIDATE" | "REQUIRED"

  status: string

  rule_version?: string
  trace_id: string

  created_at: datetime
  created_by: string
}
```

Fields not applicable to a given event remain absent/null; the schema MUST NOT fabricate irrelevant dates/effects merely for uniformity.

### 11.5 Event lifecycle

Suggested lifecycle for financial events that may lead to posting:

```text
PROPOSED
  ↓
VALIDATED
  ↓
ACCEPTED / APPROVAL_PENDING
  ↓
POSTING_PENDING
  ↓
POSTED
```

Alternatives:

```text
PROPOSED → REJECTED
PROPOSED/VALIDATED → REVIEW_REQUIRED
```

Once accounting effect is POSTED, economic/accounting fields used for that posting are immutable.

### 11.6 Correction model

No destructive edit to posted history.

Allowed patterns:

```text
original event
→ reversal event
→ corrected replacement event
```

or an approved delta adjustment when accounting policy explicitly permits it.

All corrections MUST identify source, reason, actor, predecessor, and rule/policy version.

### 11.7 Accrual-capable semantics

Example:

```text
28 Sep
ExpenseRecognized
→ Dr Expense
→ Cr AP / Accrued Liability

3 Oct
InvoiceReceived
→ evidence / AP document update

15 Oct
PaymentMade
→ Dr AP
→ Cr Bank
```

This is three events, not one.

### 11.8 Payment / settlement semantics

The model MAY later support:

```text
PaymentInitiated
→ PaymentAuthorized
→ PaymentCaptured
→ ProcessorBalanceCreated
→ SettlementCreated
→ SettlementReceived
→ BankTransactionObserved
```

Different payment rails MAY skip stages. No universal hard-coded lifecycle is assumed.

---

## 12. Double-entry Accounting Engine and Posting Rules

### 12.1 Accounting authority

Accounting Engine owns:

- accounting-recognition rule application;
- Chart-of-Accounts resolution;
- debit/credit construction;
- balanced JournalDraft creation;
- accounting-rule version reference.

It does not own external channel behavior or tax-law semantics.

### 12.2 AccountingRequest

```ts
AccountingRequest {
  financial_events: FinancialEvent[]
  accounting_profile: object
  chart_of_accounts_version: string
  accounting_rule_version: string

  tax_accounting_impacts?: AccountingImpact[]
}
```

### 12.3 JournalDraft

```ts
JournalDraft {
  journal_draft_id: string
  organization_id: string

  event_ids: string[]
  posting_date: date

  entries: Array<{
    account_id: string
    debit: decimal_string
    credit: decimal_string
    memo?: string
  }>

  total_debit: decimal_string
  total_credit: decimal_string

  accounting_rule_id: string
  accounting_rule_version: string

  trace_id: string
}
```

### 12.4 Hard accounting controls

- debit XOR credit per line;
- non-negative exact amounts;
- total debit = total credit;
- all accounts in same authorized organization;
- no direct AI account/posting authority;
- no posting into unauthorized period;
- at-most-once posting per idempotency/event contract;
- mandatory provenance written atomically with posting.

---

## 13. Tax Engine and Tax Authority

### 13.1 Authority rule

> **Tax Engine decides tax semantics. Accounting Engine decides journal construction. Ledger records accounting truth. Period Engine decides where/when accounting may post. Filing Control records what was declared.**

Tax Engine owns:

- tax classification;
- tax trigger;
- tax point;
- tax base;
- tax rate/rule;
- tax eligibility;
- tax period;
- tax liability/credit semantics.

Tax Engine MUST NOT own:

- Chart-of-Accounts mapping;
- debit/credit construction;
- journal balancing;
- direct General Ledger posting.

### 13.2 Canonical tax objects

#### TaxResult — recomputable calculation

```ts
TaxResult {
  tax_result_id: string
  evaluation_run_id: string

  organization_id: string

  source_financial_event_id: string
  source_event_version: integer

  tax_type: string
  jurisdiction: string

  rule_id: string
  rule_version: string
  input_snapshot_hash: string

  tax_base?: decimal_string
  tax_amount?: decimal_string

  liability_candidate?: decimal_string
  credit_candidate?: decimal_string

  tax_point_candidate?: date
  tax_period_candidate?: string

  eligibility_status: string
  evidence_gaps: string[]

  calculated_at: datetime
  calculation_reason: string
}
```

`TaxResult` MAY be recomputed/superseded. It does not post and does not mean filed.

#### TaxEvent — immutable tax fact

```ts
TaxEvent {
  tax_event_id: string
  organization_id: string

  event_type: string
  source_financial_event_id: string

  tax_type: string
  jurisdiction: string

  occurred_at: datetime
  tax_point_date: date
  tax_period_id: string

  tax_base?: decimal_string
  tax_amount?: decimal_string
  currency: string

  rule_id: string
  rule_version: string

  evidence_refs: string[]
  document_refs: string[]

  accounting_impact: string
  filing_impact: string

  reverses_tax_event_id?: string
  adjusts_tax_event_id?: string
  supersedes_tax_event_id?: string

  created_at: datetime
  created_by: string
}
```

Confirmed Tax Events are immutable; correction creates new Tax Adjustment/Reversal events.

#### TaxPosition — derived position

`TaxLiability` and `TaxCredit` are positions, not primitive events.

```text
TaxEvent(s)
   ↓
TaxPosition
   ├─ liability
   └─ credit
```

#### TaxFilingSnapshot — external declaration state

```ts
TaxFilingSnapshot {
  filing_id: string
  organization_id: string

  tax_type: string
  tax_period_id: string
  revision: integer

  status:
    | "DRAFT"
    | "READY"
    | "FILED"
    | "AMENDED"
    | "ASSESSED"
    | "SETTLED"

  included_tax_event_manifest: string[]
  included_tax_event_hash: string

  declared_tax_base?: decimal_string
  declared_liability?: decimal_string
  declared_credit?: decimal_string

  rule_manifest_hash: string

  filed_at?: datetime
  authority_reference?: string

  supersedes_filing_id?: string
}
```

Live `TaxPosition` and filed return state MUST NOT be conflated.

### 13.3 AccountingImpact boundary

Tax Engine MAY emit:

```ts
AccountingImpact {
  impact_type: string
  tax_amount: decimal_string
  tax_event_id: string
  recognition_date: date

  required: boolean
}
```

It MUST NOT emit authoritative debit/credit account IDs.

### 13.4 VAT semantics

- VAT uses its statutory tax point logic, not generic accounting date.
- Input VAT observed from OCR/document does not automatically become usable Tax Credit.
- Eligibility/evidence status must be representable.
- Period VAT position derives from eligible input/output Tax Events.
- A VAT filing does not recreate original transaction-level VAT accounting.

### 13.5 WHT semantics

WHT is triggered by the relevant payment event under the approved rule set.

```text
ExpenseRecognized
→ AP / liability
→ PaymentMade
→ WHTObligationTriggered
```

Do not trigger WHT merely because an expense was recognized.

### 13.6 CIT semantics

CIT is primarily period-oriented. Transaction-level deductible/non-deductible facts contribute to period calculations.

A routine business expense MUST NOT create a CIT-payable journal merely by applying a rate to that expense.

### 13.7 Tax period ≠ accounting period

Store both identities when relevant:

```text
accounting_effective_date
accounting_period_id

tax_point_date
tax_period_id
```

A filed tax period blocks silent mutation of filing history. It does not automatically block every accounting correction whose tax consequence refers to that period.

### 13.8 Rule versioning and re-evaluation

Tax rules MUST support at least:

```text
rule_id
rule_version

legal_valid_from
legal_valid_to

published_at
known_from

authority_source
logic_hash / parameter_hash
supersedes_rule_version
change_reason
```

Historical Tax Events freeze the rule version used.

Retroactive or corrected logic uses:

```text
New Rule / New Evidence
→ TaxReevaluationRun
→ new TaxResult
→ compare old vs new
→ TaxAdjustmentEvent / Review / Filing Amendment
```

Never migrate historical Tax Events to “latest rule” silently.

### 13.9 MVP tax scope

IN:

- Business Tax Profile;
- Domestic VAT;
- Domestic WHT;
- transaction-level CIT deductibility/basic current CIT estimate;
- effective-dated rules;
- tax period link;
- tax audit trail;
- filing snapshot foundation.

OUT unless separately approved:

- full PIT engine;
- advanced cross-border;
- treaty logic;
- advanced SBT/stamp duty;
- payroll tax;
- exhaustive filing automation.

---

## 14. Accounting Period & Close Engine

### 14.1 Four independent period concepts

Wendy MUST distinguish:

1. **Statutory Accounting Period**
2. **Management Reporting Period**
3. **Tax Period**
4. **External Statement / Settlement Cycle**

One generic `period_id` is insufficient across domains.

### 14.2 Accounting profile

```ts
AccountingProfile {
  organization_id: string

  fiscal_year_start: date
  fiscal_year_end: date

  accounting_standard: string
  entity_type: string

  functional_currency: "THB"
  timezone: string
}
```

The system MUST NOT assume every fiscal year is Jan–Dec.

### 14.3 Accounting-period state machine

```text
OPEN
  ↓
PRE_CLOSE
  ↓
REVIEW
  ↓
ADJUSTING
  ↓
READY_TO_CLOSE
  ↓
CLOSED
  ↓
LOCKED
```

If reopening is allowed:

```text
LOCKED
→ REOPEN_REQUESTED
→ APPROVED
→ REOPENED
→ adjustments/review
→ RECLOSED
→ LOCKED
```

### 14.4 Posting date

`posting_date` / approved accounting date determines accounting period.  
`created_at` MUST NOT be used as a substitute.

### 14.5 Close controls

MVP close foundation SHOULD support:

- fiscal-year configuration;
- monthly accounting periods;
- journal→period mapping;
- reconciliation status;
- close checklist;
- adjusting journal;
- trial-balance gate;
- close + lock;
- reopen with approval;
- P&L / Balance Sheet / Cash Flow from ledger;
- VAT/WHT period linkage;
- audit trail.

Advanced close automation remains later scope.

### 14.6 Period invariants

- every posted Journal has an accounting period;
- locked period cannot be directly edited;
- adjustments preserve source/reason/actor;
- opening balance is derived from approved previous closing balance;
- tax period is not assumed equal to accounting period;
- close/reopen/lock is fully audited.

---

## 15. Ledger Architecture

The Ledger is the set of posted Journal Entries/Lines, not a mutable balance field.

### 15.1 Controlled write contract

```text
Accepted Financial Event(s)
→ Accounting Engine
→ JournalDraft
→ Period Check
→ LedgerRepository.postBalancedEntry(...)
   [single DB transaction + idempotency + audit + provenance]
```

### 15.2 Forbidden paths

```text
AI → Ledger                     FORBIDDEN
Adapter → Ledger                FORBIDDEN
Tax Engine → Ledger             FORBIDDEN
Reconciliation → Ledger         FORBIDDEN
Reasoning → Ledger              FORBIDDEN
Action Executor → Ledger        FORBIDDEN
Client/manual app SQL → Ledger  FORBIDDEN
```

### 15.3 Ledger balance authority

Ledger balances answer:

> “What do the accounting books contain?”

They do not by themselves prove:

- source completeness;
- current bank availability;
- full reconciliation;
- fresh external feeds;
- future cash;
- management interpretation.

---

## 16. Financial Reconciliation

Reconciliation runs **after** relevant authoritative accounting records exist.

```text
Ledger / Event Facts
        +
External Evidence
        ↓
Reconciliation
        ↓
MATCHED
PARTIALLY_MATCHED
UNMATCHED
CONFLICT
        ↓
review / resolution
```

### 16.1 Rules

- mismatch never posts/adjusts Ledger directly;
- financial correction creates new Financial Event(s);
- source evidence and ledger facts remain distinct;
- one-to-one, one-to-many, many-to-one, and split matches may be supported by approved rules;
- matched groups store evidence, rule version, amounts/dates, and actor/resolution.

---

## 17. Financial State

### 17.1 Definition

> **Financial State is a versioned, time-scoped business view derived from authoritative accounting facts plus tax, control/reconciliation, and approved external-evidence state, while preserving the boundary between facts, forecasts, and interpretations.**

It is broader than a Ledger balance but narrower than “everything Wendy knows.”

### 17.2 Authority chain

```text
Ledger Balance
→ authoritative accounting facts

Tax Position
→ authoritative tax facts/position

Reconciliation / Period Control
→ verification/control facts

Bank/POS/Processor snapshots
→ external evidence

        ↓
Financial State Builder
        ↓
Financial State
```

External evidence MUST NOT overwrite Ledger amounts simply because it disagrees.

Example:

```text
Ledger cash                  520,000
Bank observed                515,000
Unreconciled difference        5,000

Financial State:
  accounting_cash            520,000
  bank_booked_cash            515,000
  reconciliation_status       PARTIAL
  unresolved_cash_difference    5,000
```

### 17.3 Canonical model

```text
FinancialState

identity
├─ state_id
├─ organization_id
├─ state_version
└─ generated_at

position
├─ assets
│  ├─ cash
│  ├─ receivables
│  ├─ inventory
│  ├─ prepayments
│  └─ other
├─ liabilities
│  ├─ payables
│  ├─ accruals
│  ├─ borrowings
│  ├─ tax
│  └─ other
└─ equity

performance
├─ revenue
├─ cost_of_sales
├─ gross_profit
├─ operating_expenses
├─ operating_profit
├─ tax_expense
└─ net_profit

liquidity
├─ ledger_cash
├─ bank_booked_cash
├─ bank_available_cash
├─ restricted_cash
├─ unsettled_processor_receivables
├─ near_term_receivables
├─ near_term_payables
└─ operationally_available_cash

quality
├─ accounting_integrity
├─ reconciliation
│  ├─ status
│  ├─ matched_amount
│  ├─ unresolved_amount
│  └─ unresolved_count
├─ completeness
│  ├─ status
│  ├─ expected_sources
│  ├─ missing_sources
│  └─ coverage_through
├─ freshness
│  ├─ ledger_updated_at
│  ├─ bank_updated_at
│  ├─ pos_updated_at
│  └─ processor_updated_at
└─ exceptions
   ├─ material_count
   └─ highest_severity

time
├─ position_as_of
├─ performance_from
├─ performance_to
├─ accounting_period_id
├─ reporting_context
└─ timezone

provenance
├─ ledger_revision
├─ tax_revision
├─ reconciliation_revision
├─ source_snapshot_ids
├─ rule_versions
└─ derivation_version
```

### 17.4 FinancialState invariants

```text
Ledger Balance ≠ Financial State

Financial State ≠ Forecast

Financial State ≠ Insight

Financial State actual
MUST derive from authoritative facts

Position values
MUST have AS_OF

Performance values
MUST have FROM + TO

Quality
MUST NOT alter underlying accounting fact

Missing data
MUST be representable

Stale data
MUST be representable

Available cash
≠ Ledger cash

Every State
MUST identify fact/rule/source versions sufficient for reconstruction
```

State MAY be incomplete, uncertain, stale, or partially reconciled. It MUST NOT hide those conditions.

### 17.5 State lifecycle and decisions

Reasoning is read-only over State.

```text
Facts
→ Financial State FS-100
→ Reasoning / Decision references FS-100
```

If facts change to FS-101 before a sensitive action executes, the action policy MUST be able to detect stale state and require re-evaluation.

The implementation MAY use materialized snapshots or reproducible state references. The logical identity/version requirement is locked; storage strategy is not.

---

## 18. Query and Calculation

Financial Query Service uses deterministic code/SQL over the appropriate authoritative facts.

Examples:

- cash/book balances;
- receivables/payables;
- revenue/expenses/COGS/profit;
- period comparison;
- tax position;
- unreconciled amounts;
- data quality/freshness metrics;
- liquidity metrics.

Every result MUST carry:

- organization scope;
- metric semantics/basis;
- currency;
- `as_of` or `from/to`;
- accounting/tax/reconciliation/state version reference;
- rule/derivation version;
- completeness/quality status;
- contributing fact IDs or reproducible query reference.

An LLM MAY verbalize the result. It MUST NOT replace the number.

---

## 19. Reasoning, Decision, and Execution

### 19.1 Reasoning

Input: Financial State + relevant events/evidence + business context.

Output MUST separate:

- fact;
- inference;
- recommendation;
- uncertainty;
- supporting references.

### 19.2 Decision

Decision records identify:

- `based_on_state_id`;
- evidence refs;
- policy version;
- proposer;
- required approver;
- risk level;
- status.

### 19.3 Approval levels

Use the locked three-level policy:

```text
AUTO_POST
USER_CONFIRM
ACCOUNTANT_OR_ADMIN_APPROVAL
```

### 19.4 Execution

Non-financial actions may include alerts/reports/tasks/messages/APIs.

Financial actions:

```text
Action Proposal
→ Policy
→ Approval
→ External Execution (when applicable)
→ Provider/rail result
→ New Financial Event(s)
→ Accounting/Tax/Period controls
→ Ledger / Tax / State update
```

The exact ordering varies by action/rail. What is locked is that an executor cannot directly mutate the Ledger.

`UNKNOWN` MUST be representable when an external action outcome cannot be safely inferred.

---

## 20. Source Traceability and Provenance

Traceability is cross-cutting:

```text
Original Source
→ Source Artifact
→ Extraction Run
→ Original AI/Parser Observation
→ User Confirmation/Correction if any
→ Normalization
→ Classification Proposal
→ Validation
→ Financial Event(s)
→ Tax Result/Event if applicable
→ Accounting Rule
→ Journal Draft
→ Period Check
→ Posted Journal
→ Reconciliation
→ Financial State
→ Insight / Decision
→ Action
→ Output / Delivery
```

Requirements:

- original evidence is never silently replaced;
- user corrections append lineage;
- posted records require mandatory provenance;
- tax events freeze rule version;
- Financial State freezes/references fact-version inputs;
- outputs with numeric claims must trace to State/calculation/facts;
- corrections append history rather than erasing it.

---

## 21. Output Architecture

Output is channel-neutral domain content.

```ts
Output {
  output_id: string
  organization_id: string

  type:
    | "FINANCIAL_STATE"
    | "INFORMATION"
    | "ALERT"
    | "INSIGHT"
    | "ACTION_RESULT"

  state_id?: string
  evidence_refs: string[]

  sensitivity: string
  created_at: datetime
}
```

Communication delivery is separate and rechecks recipient authorization.

---

## 22. Multi-Organization Architecture

- all critical financial/tax/control entities are organization-scoped or inherit scope through an immutable parent;
- server derives permitted organization scope from authenticated membership/role;
- unscoped financial repository methods are forbidden;
- foreign keys/composite constraints SHOULD prevent cross-org references;
- storage paths, AI context, queues/jobs, logs, caches, idempotency namespaces, State snapshots, and rule application are organization-scoped;
- privileged service role bypass is narrowly controlled and audited.

Vault Company operational data is separate from customer organizations.

---

## 23. Conceptual Data Model v0.2

This is conceptual, not a migration.

### 23.1 Organization and policy

```text
organizations
users
organization_memberships

accounting_profiles
tax_profiles

accounts
account_reporting_mappings

rule_sets
rule_versions
approval_policies
```

### 23.2 Source and interpretation

```text
sources
source_artifacts
processing_runs
extracted_observations
observation_confirmations
classification_proposals
ai_interpretations
```

### 23.3 Events and accounting

```text
financial_events
financial_event_relations

journal_entries
journal_lines
```

A separate customer-facing `transactions` table is NOT core authority. If needed:

```text
transaction_feed_projection
```

must be derived/rebuildable.

### 23.4 Tax

```text
tax_results
tax_events
tax_event_relations
tax_positions
tax_filing_snapshots
tax_reevaluation_runs
```

### 23.5 Period / close

```text
fiscal_years
accounting_periods
period_close_runs
period_close_tasks
period_locks
period_approvals

tax_periods
statement_cycles
```

### 23.6 Reconciliation

```text
reconciliation_runs
reconciliation_items
reconciliation_matches
```

### 23.7 State, decision, action, output

```text
financial_state_refs_or_snapshots

decisions
actions
outputs
communication_deliveries

audit_logs
```

### 23.8 Relationship summary

```text
Organization --< Membership >-- User

Organization --< AccountingProfile
Organization --< TaxProfile
Organization --< Account

Organization --< Source --< SourceArtifact
Source --< ProcessingRun --< ExtractedObservation
Observation --< Confirmation
Observation --< ClassificationProposal

Evidence --< FinancialEvent --< EventRelation

FinancialEvent(s)
  ├──> TaxResult -> TaxEvent -> TaxPosition
  └──> AccountingEngine -> JournalEntry --< JournalLine >-- Account

Journal/ExternalEvidence --< ReconciliationResult

Ledger + TaxPosition + Reconciliation + SourceSnapshots
  -> FinancialState

FinancialState/Evidence -> Decision -> Action
Financial Action -> New FinancialEvent(s)

Decision/State -> Output -> CommunicationDelivery

All controlled transitions -> AuditLog
```

---

## 24. Engine Contracts and Authority Matrix

### 24.1 Contract rule

Every engine contract specifies:

```text
Input
Validation
Authority / permissions
Output
Errors
Versioning
Idempotency
Traceability
```

### 24.2 Authority matrix

| Engine / Module | May create/own | MUST NOT do |
|---|---|---|
| Ingestion | SourceEnvelope | assert accounting/tax truth |
| Capture | ExtractedObservation | create/post financial facts |
| Verification | Confirmation state | approve accounting/tax treatment |
| Normalize | canonical field semantics | final classification |
| Classify | proposals/confidence | post or become truth automatically |
| Validation | deterministic acceptance/routing | invent source facts |
| Financial Event Service | typed events/relations | direct journal SQL |
| Accounting Engine | JournalDraft/account mapping | own tax-law semantics |
| Tax Engine | TaxResult/TaxEvent/TaxPosition semantics | direct Ledger write/account mapping |
| Period & Close Engine | period state/post permission | change tax period for convenience |
| Ledger Posting Service | posted Journal/Lines | bypass validation/period/provenance |
| Reconciliation | match/control facts | directly fix Ledger |
| Financial State Builder | derived State | change underlying facts |
| Query/Calculation | deterministic results | narrative invention |
| Reasoning | explanation/insight | authoritative arithmetic/authorization |
| Decision | durable disposition/approval state | execute adapter side-effects directly |
| Execution | authorized external/internal actions | direct Ledger mutation |
| Output/Response | channel-neutral result/rendering | recalculate financial truth |
| Audit/Trace | durable lineage/control trail | business-rule bypass |

### 24.3 Ledger contract

```ts
PostJournalCommand {
  journal_draft_id: string
  organization_id: string

  expected_accounting_rule_version: string
  idempotency_key: string
}
```

Before posting Ledger MUST establish:

- balanced journal;
- valid event relationship;
- organization consistency;
- account validity;
- period permission;
- not previously posted;
- mandatory provenance/audit availability.

### 24.4 Reconciliation contract

```ts
ReconciliationResult {
  reconciliation_id: string

  status:
    | "MATCHED"
    | "PARTIALLY_MATCHED"
    | "UNMATCHED"
    | "CONFLICT"

  matched_refs: string[]

  amount_difference?: decimal_string
  date_difference_days?: integer

  review_required: boolean
  proposed_adjustment_event?: object
}
```

A proposed adjustment is not posted until it becomes an approved event and re-enters the normal accounting path.

### 24.5 Period contract

```ts
PeriodCheckResult {
  accounting_period_id: string
  status: string

  posting_allowed: boolean
  adjustment_required: boolean
  approval_required: boolean

  reason_codes: string[]
}
```

### 24.6 Financial State contract

State Builder is read-only over authoritative facts and writes only a derived/reproducible State representation.

---

## 25. Repository / Code Structure Proposal

```text
docs/
  WENDY_TECHNICAL_SPEC_v0.2.md
  WENDY_PRODUCT_DECISIONS_v0.1.md
  research/

src/
  domain/
    organizations/
    sources/
    observations/
    financial-events/
    accounting/
    tax/
    periods/
    ledger/
    reconciliation/
    financial-state/
    decisions/
    actions/
    outputs/

  application/
    ingestion/
    capture/
    verification/
    normalization/
    classification/
    validation/
    event-processing/
    posting/
    tax-evaluation/
    period-close/
    reconciliation/
    state-building/
    queries/
    reasoning/
    execution/

  ports/
    repositories/
    ai/
    storage/
    auth/
    communication/
    external-financial-sources/

  adapters/
    supabase/
    ai-provider/
    line/
    file-parsers/
    future-bank-pos-ecommerce/

  infrastructure/
    configuration/
    observability/
    security/
    rule-loading/

tests/
  unit/
  integration/
  contract/
  invariant/
  state-machine/
  fixtures/
```

Dependencies point inward. Domain code imports neither Supabase SDK, LINE SDK, nor provider-specific AI SDK.

---

## 26. Infrastructure and Security

### 26.1 Initial infrastructure

- Database: PostgreSQL hosted by Supabase initially.
- Storage: Supabase Storage behind `FileStorage`.
- Auth: Supabase Auth or approved adapter.
- Interface: LINE adapter first.
- Backend: Wendy-owned application/business logic.
- AI: one initial provider behind `AIService`.

### 26.2 Security boundaries

Minimum:

- organization authorization on every operation;
- RLS/constraints as defense in depth;
- Ledger write role restricted to Posting Service;
- Tax/State/AI services have no Ledger mutation credentials;
- append-oriented audit for approvals/corrections/filings;
- signed/short-lived source artifact access;
- sensitive data minimization/redaction;
- secret rotation;
- signed provider callbacks/replay protection;
- document prompt injection treated as data, not policy;
- service-role use narrowly scoped and audited;
- data retention/residency rules approved before production.

---

## 27. Failure and Error Handling

Rules:

- financial write failures fail closed;
- no partial journal;
- tax semantic failure does not silently default to “no tax”;
- validation/business errors are not blind-retried;
- retries require idempotency;
- external timeout may become `UNKNOWN`;
- original source and prior runs remain available;
- filing history is never overwritten due to later recalculation;
- stale Financial State is detectable;
- user-facing status distinguishes unprocessed, review required, rejected, posted, and uncertain external outcome.

---

## 28. Observability and Audit

### 28.1 Metrics

Track at minimum:

- stage latency/error rate;
- extraction confirmation/correction rate;
- AI schema failure;
- validation/review rate;
- duplicate/idempotency conflict;
- unbalanced journal rejection;
- posting success/conflict;
- tax evaluation/review/adjustment;
- period-close exceptions;
- reconciliation mismatch;
- Financial State freshness/completeness;
- stale-decision rejection;
- action/delivery outcome.

### 28.2 Durable audit

Record:

- actor type;
- source/observation correction;
- validation result;
- approval;
- event creation/reversal/correction;
- tax rule/version and tax event adjustment;
- filing snapshot revision/amendment;
- period close/reopen/lock;
- posting;
- reconciliation resolution;
- decision/action;
- sensitive access.

Logs are not the sole audit source.

---

## 29. MVP Scope and First Vertical Slice

### 29.1 Wendy Core MVP

```text
Organization
→ Source
→ Observation
→ Financial Event
→ Validation
→ Accounting Rule
→ Journal
→ Period Check
→ Ledger
→ Financial State
```

### 29.2 Wendy Intelligence MVP

```text
LINE Text
→ Extract / Normalize / Classify
→ Proposal
→ USER_CONFIRM
→ Financial Event
```

### 29.3 First end-to-end vertical slice

**Locked scenario:**

```text
User:
"วันนี้จ่ายค่า Meta Ads 3,500 บาทจาก SCB"
```

Expected flow:

```text
LINE Source
→ text extraction
→ Normalize amount/counterparty/payment account/date
→ ClassificationProposal: marketing.advertising
→ deterministic validation
→ USER_CONFIRM
→ linked ExpenseRecognized + PaymentMade semantics
→ deterministic posting rule
→ Dr Marketing Expense 3,500
→ Cr SCB Bank 3,500
→ posted exactly once
→ Financial State refreshed
→ query: Marketing expense MTD
→ LINE response with provenance
```

Tax behavior in this first slice:

- Wendy MUST NOT invent VAT/WHT/CIT facts without sufficient Tax Profile/evidence.
- Tax Engine may return `NO_TAX_EFFECT`, `PENDING_EVIDENCE`, or `REVIEW_REQUIRED` according to approved deterministic rules.
- Accounting may proceed only according to approved accounting/tax dependency policy.

### 29.4 Success criteria

The slice passes only if:

- debit = credit;
- no duplicate post on retry;
- organization isolation holds;
- source→event→rule→journal→ledger trace exists;
- user confirmation is auditable;
- AI cannot mutate Ledger;
- failed validation cannot post;
- Financial State derives the expense amount from posted facts;
- State exposes quality limitations;
- the same user query returns deterministic accounting values independent of LLM arithmetic.

---

## 30. Non-Goals for v0.2 MVP

- full ERP;
- replacement for professional accountant/tax professional;
- banking-license functionality;
- Virtual Bank;
- card issuing;
- payment infrastructure;
- stablecoin settlement;
- autonomous financial agent;
- Hermes orchestration;
- multi-agent swarm;
- production multi-provider AI routing;
- full Thai tax compliance;
- advanced multi-currency;
- intercompany/consolidation;
- advanced payroll;
- complex payment/chargeback automation.

The domain may remain extensible to these areas without implementing them now.

---

## 31. Testing Strategy

Financial invariant tests are release-blocking.

### 31.1 Existing controls retained

- Debit = Credit.
- Unbalanced Journal cannot post.
- AI cannot update Ledger.
- Posted accounting records have provenance.
- Financial Action creates new event(s).
- Cross-organization access fails.
- Duplicate delivery/event is idempotent.
- Failed validation cannot post.
- Reconciliation mismatch does not mutate Ledger.

### 31.2 New event-semantic tests

- `SaleRecognized` does not imply `PaymentReceived`.
- `ExpenseRecognized` does not imply `PaymentMade`.
- `PaymentCaptured` does not imply `SettlementReceived`.
- `BankTransactionObserved` does not automatically create Revenue.
- one economic group may produce multiple valid events.
- posted-event correction creates reversal/adjustment/replacement rather than edit.

### 31.3 Capture verification tests

- low-confidence critical field requires confirmation/re-upload;
- user correction preserves original AI value;
- confirmation does not bypass accounting/tax validation.

### 31.4 Tax authority tests

- Tax Engine cannot write Ledger;
- TaxResult can be recomputed without mutating TaxEvent;
- confirmed TaxEvent is immutable;
- TaxPosition derives from TaxEvents;
- TaxFilingSnapshot preserves filed revision;
- amendment creates later filing revision;
- WHT trigger is tied to approved payment semantics;
- tax period and accounting period can differ;
- retroactive rule re-evaluation produces delta/review, not silent history rewrite.

### 31.5 Period tests

- posted Journal has accounting period;
- locked period blocks direct posting;
- reopen requires policy/approval/audit;
- tax period remains independent;
- opening balance equals approved prior closing balance when applicable.

### 31.6 Financial State tests

- State actual derives from authoritative facts;
- Ledger cash is not overwritten by bank evidence;
- position metric has `as_of`;
- performance metric has `from/to`;
- missing source is represented;
- stale source is represented;
- partial reconciliation is represented;
- Forecast never appears as actual;
- Insight cannot mutate State;
- State identifies ledger/tax/reconciliation/source/derivation versions;
- sensitive action detects stale based-on State when policy requires.

### 31.7 Contract/property/security tests

- schema/contract version compatibility;
- exact-money precision/property tests;
- state-machine invalid transitions;
- transaction/concurrency at-most-once posting;
- RLS/authorization/service-role controls;
- prompt-injection isolation;
- disaster/rebuild from authoritative records;
- traceability source→output and output→source.

**Acceptance gate:** no release if a hard invariant, organization isolation, provenance, posting authority, tax authority, or State derivation test fails.

---

## 32. Implementation Milestones v0.2

### M0 — Product Decisions and Policy Pack — COMPLETED FOR CORE ITEMS

Locked:

- accrual accounting basis;
- internal COA + reporting mapping concept;
- THB-only posting currency;
- MVP tax scope;
- Financial Event semantic model;
- deterministic posting authority;
- three-level review/approval policy;
- initial vertical slice.

Remaining detailed seed/rule artifacts are completed inside their owning milestone.

### M1 — Domain Contracts + Organization + Policy Foundations

Implement/review:

- organization/membership boundary;
- exact-money type;
- AccountingProfile/TaxProfile;
- Default COA seed + reporting tags;
- generic rule/version model;
- EngineRequest/Error envelopes;
- event identities/relations;
- no production integrations yet.

**Exit:** domain contracts and authority matrix compile/test without provider dependencies.

### M2 — Financial Core: Event → Accounting → Period → Ledger

Implement:

- Financial Event lifecycle/relations;
- deterministic validation;
- first expense/payment posting rule;
- Accounting Engine;
- monthly Period permission foundation;
- Ledger atomic posting;
- immutability/correction path;
- invariant tests.

**Exit:** first deterministic linked event set posts exactly once; unauthorized/unbalanced/duplicate/locked-period paths fail closed.

### M3 — Source / Capture / Verification / Provenance

Implement:

- LINE text source envelope;
- observations;
- verification/confirmation trace;
- source matching/duplicate controls;
- end-to-end provenance.

### M4 — Financial State v0.1 Read Model

Implement:

- Ledger-based position/performance;
- basic quality/freshness;
- provenance version refs;
- expense/revenue query;
- no Forecast yet.

### M5 — First Vertical Slice

Complete:

```text
LINE Text
→ Expense paid by Cash/Bank
→ User Confirm
→ Events
→ Journal
→ Ledger
→ Financial State
→ Expense Summary
→ LINE
```

### M6 — AI Capture / Normalize / Classify

Add one AI provider behind contract. Benchmark extraction/classification separately from accounting truth.

### M7 — Tax Engine MVP

Implement approved Tax Profile + Domestic VAT/WHT + basic CIT/deductibility contracts, effective-dated rules, TaxResult/TaxEvent/TaxPosition, filing snapshot foundation.

### M8 — Reconciliation + Close Foundation

Implement financial reconciliation, monthly close checklist, close/lock/reopen controls, trial-balance gate, and State quality integration.

### M9 — Reason / Decide / Action

Ground reasoning in State IDs. Add approval/stale-state controls and financial-action-to-event routing.

### M10 — Additional Connectors / Advanced Capabilities

Bank/POS/e-commerce, document OCR, additional AI providers, advanced tax/close/payment lifecycles only after measured need.

---

## 33. Remaining Open Questions

These are narrower than v0.1 because core Product Decisions are now locked.

### 33.1 Blocking before the relevant implementation

1. Exact Default COA seed accounts, system/custom-account policy, and reporting-tag version set.
2. Exact first-event required-field schema and deterministic posting-rule IDs.
3. Exact AccountingProfile entity types and onboarding fields.
4. Exact TaxProfile mandatory fields for each MVP tax capability.
5. Authoritative tax-rule ingestion/approval/change-management process.
6. Detailed `AUTO_POST` eligibility criteria and materiality thresholds.
7. Exact role permissions for Accountant vs Admin vs Owner and segregation-of-duties cases.
8. Closed/locked-period correction policy and reopening authority.
9. Tax Filing Snapshot production workflow and whether filing submission itself is in MVP.
10. Financial State persistence strategy: snapshots, reproducible refs, or hybrid.
11. State-quality thresholds for UI labels/alerts.
12. Legal/regulatory classification of Vault/Wendy services and customer-facing claims before launch.

### 33.2 Non-blocking for the first vertical slice

- AI provider/model;
- Supabase Auth implementation detail;
- async queue technology;
- advanced OCR file types;
- bank/POS/e-commerce connector order;
- retention/archive periods before production;
- data residency/backup/RPO/RTO before production;
- SLOs/cost budgets;
- advanced reconciliation tolerances;
- multi-currency;
- advanced close automation;
- advanced tax modules;
- Forecast engine;
- Hermes/agent orchestration.

---

## 34. Research Basis Incorporated in v0.2

This revision incorporates architecture conclusions from these internal project research/work products:

- `WENDY_TECHNICAL_SPEC_v0.1.md` — original Codex technical specification.
- Financial Event Model research — event semantics, payment/settlement/evidence/correction separation.
- Wendy Engine Contracts research — contract envelopes, authority boundaries, errors, idempotency.
- `Tax Authority in Vault: Who May Decide, Create, Post, Correct, and Re-evaluate Tax` — TaxResult/TaxEvent/TaxPosition/TaxFilingSnapshot and tax/accounting/period authority split.
- `Financial State for Wendy/Vault` — position/performance/liquidity/quality/time/provenance model.
- Tax Rules research — Tax Profile, VAT/WHT/basic CIT architecture and effective-dated deterministic rules.
- Accounting Period & Close research — four period concepts, period state machine, close/lock/reopen controls.
- Product Decision consolidation — accrual basis, Default COA approach, THB-only posting currency, MVP tax scope, event semantics, posting/approval policy.
- Product Owner review — remove standalone core `transactions` authority, narrow MVP, revise milestones, lock first vertical slice.

Research conclusions that affect legal/tax behavior are translated here into **software authority boundaries and requirements**. Production tax/legal content still requires controlled authoritative-source maintenance and specialist validation.

---

## 35. Changelog from v0.1

### Breaking conceptual changes

- Replaced “Ledger is sole financial truth” with typed authority model while retaining Ledger as accounting truth.
- Replaced generic Financial Event semantics with domain-event separation.
- Removed `transactions` as core source-of-truth entity.
- Added Source Matching/Verification distinction from Financial Reconciliation.
- Added Capture Verification / Human Confirmation Gate.
- Added Tax Engine authority model and tax object model.
- Added `TaxFilingSnapshot`.
- Added `Accounting Period & Close Engine`.
- Replaced Financial State definition with versioned canonical read model including quality/liquidity/provenance.
- Standardized research `business_id` to `organization_id`.
- Locked core Product Decisions and first vertical slice.
- Revised implementation milestones around Event → Accounting → Period → Ledger first.

### Retained from v0.1

- Vault/Wendy separation;
- PostgreSQL double-entry foundation;
- one controlled Ledger write path;
- AI provider portability;
- Supabase as initial infrastructure only;
- organization isolation;
- end-to-end provenance;
- immutable/corrective history;
- idempotency;
- fail-closed financial writes;
- linear MVP;
- non-financial vs financial action distinction.

---

## Final Review Checklist

| Criterion | v0.2 result |
|---|---|
| Vault vs Wendy separated | LOCKED |
| AI vs deterministic authority separated | LOCKED |
| Ledger accounting authority | LOCKED |
| Tax authority separate from Ledger authority | LOCKED |
| Financial Event semantics | REVISED + LOCKED |
| Payment vs settlement vs recognition | LOCKED |
| Source evidence vs financial fact | LOCKED |
| Engine contracts | ADDED |
| Capture verification | ADDED |
| Source matching vs reconciliation | CORRECTED |
| Period & Close authority | ADDED |
| Financial State canonical read model | REVISED + LOCKED |
| Forecast/Insight separated from actual State | LOCKED |
| Multi-organization isolation | LOCKED |
| Idempotency | HARD INVARIANT |
| Transactions core entity | REMOVED / PROJECTION ONLY |
| THB-only MVP posting | LOCKED |
| Accrual basis | LOCKED |
| MVP tax scope | LOCKED |
| Approval model | LOCKED CONCEPT |
| Initial vertical slice | LOCKED |
| Implementation-ready financial core | READY TO BEGIN M1, then M2, subject to exact seed/schema artifacts |

---

## End-of-Work Summary

Wendy v0.2 is no longer merely an “AI-assisted ledger pipeline.” It is a typed-authority Financial OS engine.

The fundamental chain is:

```text
Evidence
→ Observation
→ Validation
→ Typed Financial Events
→ Authoritative Engines
→ Ledger / Tax / Control Facts
→ Financial State
→ Reason / Decide / Act
→ New Real Events
```

The Ledger remains the accounting authority, but Wendy now explicitly understands that accounting truth, tax truth, external evidence, verification quality, liquidity availability, forecast, and insight are different semantic layers.

The first implementation goal remains deliberately small:

```text
LINE Text
→ Expense paid from Cash/Bank
→ User Confirm
→ Event(s)
→ Balanced Journal
→ Ledger
→ Financial State
→ Expense Summary
```

If this slice cannot be proven correct, traceable, idempotent, organization-isolated, and deterministic at the authority boundaries, broader connectors and AI features MUST NOT hide that defect.
