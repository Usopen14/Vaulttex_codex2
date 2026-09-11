# Wendy Product Decisions v0.1 — M1 Approved Decisions

**Product:** Vault
**Engine:** Wendy
**Document status:** `APPROVED_FOR_M1` — Product Owner approval evidence recorded; this does not approve M2 posting
**Scope:** M1 contract decisions and the §24.1 engine-contract checklist

This register records the formal Product Owner approval evidence supplied in this Codex task. The Product Owner's personal name was not provided, so the approving role is recorded as `Product Owner`; no personal identity is invented. Approval of these M1 decisions does not approve the separate `PAID_EXPENSE` posting rule or authorize M2 implementation.

## 1. Decision metadata

| Decision | Owner | Approver | Decision date | Formal status |
|---|---|---|---|---|
| D-001 Approval level vocabulary | Product Owner | Product Owner | 2026-09-11 | `APPROVED_FOR_M1` |
| D-002 Financial-event canonical identity | Product Owner | Product Owner | 2026-09-11 | `APPROVED_FOR_M1` |
| D-003 Tax-period / filing-workflow separation | Product Owner | Product Owner | 2026-09-11 | `APPROVED_FOR_M1` |
| D-005 M1 technical verification acceptance | Product Owner | Product Owner | 2026-09-11 | `ACCEPTED` |
| D-004 M2 paid-expense posting-rule approval | `PENDING/TBD` | `PENDING/TBD` | `PENDING/TBD` | `PENDING/TBD` |

**Approval evidence for D-001, D-002, D-003, and D-005:** Product Owner messages in this Codex task, including the canonical-decision directions and the 2026-09-11 instruction: “M1 technical verification is accepted” and “update `WENDY_PRODUCT_DECISIONS_v0.1.md` with formal Product Owner approval evidence and decision dates for all resolved M1 decisions.” This is the durable task-local evidence reference for these M1 decisions.

## 2. Product-owner directions recorded for M1

### D-001 — Approval vocabulary

**Formal approval:** Product Owner, 2026-09-11, `APPROVED_FOR_M1`.

Persist the canonical field as `approval_level` with only:

```text
AUTO_POST
USER_CONFIRM
ACCOUNTANT_OR_ADMIN_APPROVAL
```

`NONE`, `REVIEWER_CONFIRMATION`, `SINGLE_APPROVER`, and `DUAL_CONTROL` are not approval levels. If later needed, they belong to a separate control-mechanism axis such as `approval_control_mode`. The first paid-expense slice requires `USER_CONFIRM`.

Example: an `ExpenseRecognized` event carries `approval.required_level: USER_CONFIRM`; a service cannot satisfy the human confirmation requirement.

Acceptance tests: `test/m1-contracts.test.ts` rejects `AUTO_POST` for the first slice and checks that confirmation records a `USER` decision.

### D-002 — Financial-event identity

**Formal approval:** Product Owner, 2026-09-11, `APPROVED_FOR_M1`.

The persisted canonical fields are `event_domain` and `economic_group_id`, using the names and semantics in `WENDY_TECHNICAL_SPEC_v0.2.md`. `event_family` may be only optional derived taxonomy metadata. An external or business transaction identifier may remain source/evidence/connector/projection metadata, but cannot replace `economic_group_id`.

Example: `ExpenseRecognized` uses `event_domain: BUSINESS`; its paired `PaymentMade` uses `event_domain: PAYMENT`; both hold the same `economic_group_id`.

Acceptance tests: `test/m1-contracts.test.ts` and `test/m1-invariants.test.ts` verify the canonical fields and one directional `FULFILLS` relationship.

### D-003 — Tax temporal and filing concepts

**Formal approval:** Product Owner, 2026-09-11, `APPROVED_FOR_M1`.

`TaxPeriod` is calendar identity only in M1. It has `tax_period_id`, `organization_id`, `start_date`, and `end_date`; it has no M1 status or transition graph. `TaxPosition`, `TaxFilingSnapshot`, and Tax Filing Workflow remain separate concepts.

`PREPARING`, `READY_TO_FILE`, `FILED`, `ACKNOWLEDGED`, `AMENDMENT_REQUIRED`, and `AMENDED` are deferred `TaxFilingWorkflowStatus` values, owned by Tax Filing Control. Their graph is deferred to M7. The difference between this deferred enum and `TaxFilingSnapshot.status` in the v0.2 specification is intentionally not reconciled in M1 and is an M7 design decision.

Example: September 2026 can be represented as `TaxPeriod(2026-09-01..2026-09-30)` without asserting that anything was filed.

Acceptance test: `test/m1-primitives.test.ts` verifies that the structural `TaxPeriod` contains no status field.

## 3. §24.1 engine-contract checklist

Every present M1 engine-facing contract follows the v0.2 §24.1 checklist. These are contract attributes, not authorization for a later engine to post or calculate tax.

| §24.1 requirement | M1 contract evidence | Acceptance test / boundary |
|---|---|---|
| Input | `EngineRequest<T>`, `ConfirmPaidExpense`, `FinancialEvent`, `AccountingPeriod` and `TaxPeriod` DTOs use snake-case persisted fields. | Engine/event/period test suites. |
| Validation | Explicit factories and invariant functions enforce canonical money, enum, source/evidence, relationship, COA, and state-transition constraints. | `test/m1-*.test.ts`. |
| Authority / permissions | `ActorRef` is `USER | SERVICE`; `EngineActorRef` is a separate envelope context. Server authorization policy is not invented in M1. | Event confirmation rejects a service as the user confirmer. |
| Output | `EngineResponse<T>`, `ConfirmedPaidExpense`, and `ValidationResult` are versioned DTO contracts. | `m1-contracts` result tests. |
| Errors | `WendyError` and `WendyDomainError` carry canonical code, severity, message, trace, and optional field/rule data. | Error-path assertions in all suites. |
| Versioning | `contract_version`, `schema_version`, `rule_context_version`, `event_version`, `period_version`, `COAVersion`, and `VersionedRule` are explicit. | Event/period version conflict tests. |
| Idempotency | Engine mutation requests require `idempotency_key`; same key plus changed input hash yields `IDEMPOTENCY_CONFLICT`. Exact fingerprint canonicalization remains deferred to M2. | `m1-contracts` idempotency test. |
| Traceability | `request_id`, `trace_id`, source/evidence references, candidate hash, created/transition audit fields, and relationship IDs are contract fields. | Event provenance and lifecycle tests. |

## 4. Pending decisions and explicit non-decisions

| Topic | State | Required before change/use |
|---|---|---|
| Paid-expense posting rule | `PENDING/TBD` | Product Owner and accounting approval of `WENDY_PAID_EXPENSE_POSTING_RULE_DRAFT_v0.1.md`. |
| Exact event-fingerprint canonicalization | Deferred to M2 | Versioned idempotency contract. |
| Server authorization / role and separation-of-duties policy | `PENDING/TBD` | Organization policy and authorization implementation. |
| Tax filing lifecycle graph / status reconciliation | Deferred to M7 | Tax Filing Control design and owner decision; this is not an M1 or M2 implementation task. |
| Tax determination, VAT, WHT, CIT | Out of M1 | Approved Tax Engine capability and rule set. |

No decision in this draft authorizes accounting mapping, debit/credit construction, `JournalDraft`, period authorization, Ledger posting, tax determination, reconciliation, financial state, LINE, or AI integration.
