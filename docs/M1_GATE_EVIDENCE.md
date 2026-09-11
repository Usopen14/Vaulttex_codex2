# Wendy M1 Gate Evidence

**Evidence date:** 2026-09-11
**Scope:** M1 domain-contract foundation only
**Overall M1 gate verdict:** `PASS — M1 technical verification accepted; M2 remains NOT READY`

## 1. Normative inputs applied

1. `docs/WENDY_TECHNICAL_SPEC_v0.2.md`
2. `Artifact/WENDY_DOMAIN_TYPES_v0.1.md`
3. `Artifact/WENDY_COA_SEED_v0.1.md`
4. `Artifact/WENDY_FIRST_EVENT_SCHEMA_v0.1.md`
5. Product-owner directions recorded in `docs/WENDY_PRODUCT_DECISIONS_v0.1.md`

The companion artifacts in `Artifact/` were updated to carry the supplied canonical `approval_level`, `event_domain`, `economic_group_id`, and TaxPeriod decisions. The v0.2 `TaxFilingSnapshot.status` enum was deliberately left unreconciled because that design is deferred to M7.

## 2. M1 coverage matrix

| M1 requirement | Contract / implementation evidence | Test evidence | Result |
|---|---|---|---|
| Compile/type-check foundation | `tsconfig.json`, source/import organization, public exports | `npm run typecheck` | PASS |
| IDs, serialization, exact money | `common/ids.ts`, `common/time.ts`, `common/money.ts` | `m1-primitives` UUID/date/money tests | PASS |
| Organization boundary and actor contract | `organizations/organization.ts` | actor, membership, same-organization tests | PASS |
| AccountingProfile and TaxProfile | `accounting/profiles.ts` | profile boundary test | PASS |
| AccountingPeriod state machine | `periods/periods.ts` | legal sequence and illegal transition test | PASS |
| TaxPeriod separation | structural `TaxPeriod` only; no TaxPeriod status/transition module | TaxPeriod key-set test | PASS |
| Versioned COA and minimum seed | `accounting/coa.ts`, exact `MINIMUM_COA_SEED` | seed, code/tag/control/path/uniqueness tests | PASS |
| Versioned rule foundations | `rules/rules.ts` | type-check coverage; no rule execution | PASS |
| §24.1 Engine contracts/errors/idempotency | `contracts/engine.ts`, `common/errors.ts` | request, actor-envelope, unknown-field, idempotency tests | PASS |
| Canonical FinancialEvent and relationship primitives | `events/financial-event.ts` | canonical field, status, provenance, pair/link tests | PASS |
| Approval/source/evidence/audit fields | FinancialEvent approval/provenance fields and transition DTO | human confirmation lifecycle test | PASS |
| Observation-only tax | `TaxObservation.authority: OBSERVATION_ONLY` | authoritative-tax value rejection test | PASS |
| Explicit M1 scope exclusion | no posting/ledger/tax/reconciliation/financial-state/LINE/AI exports | public-surface negative test | PASS |
| Product decision register | `WENDY_PRODUCT_DECISIONS_v0.1.md` | Product Owner evidence and decision dates recorded 2026-09-11 | PASS |
| Versioned PAID_EXPENSE posting-rule review target | `WENDY_PAID_EXPENSE_POSTING_RULE_DRAFT_v0.1.md` | product/accounting approval required | PENDING/TBD |

## 3. Conflict ledger

| Topic | Resolution applied | Remaining state |
|---|---|---|
| Money canonicalization / precision | Canonical unsigned THB strings, max two fractional digits, no silent rounding; equal decimal values compare without binary floating point. | Resolved for M1. |
| Event family vs domain | Canonical persisted field is `event_domain`; `event_family` is only optional/derived taxonomy metadata. | Resolved for M1. |
| Business transaction identity | Canonical Wendy grouping identity is `economic_group_id`; external/business IDs cannot replace it. | Resolved for M1. |
| Approval terminology | Persisted `approval_level` uses exactly `AUTO_POST`, `USER_CONFIRM`, `ACCOUNTANT_OR_ADMIN_APPROVAL`; other controls are separate future axis. | Resolved for M1. |
| ActorRef scope | Domain `ActorRef` remains `USER | SERVICE`; broader `EngineActorRef` is envelope context, not a replacement. | Resolved for M1. |
| Source/evidence references | Canonical `SourceRef` and `EvidenceRef`; source is required and confirmation requires user evidence. | Resolved for M1. |
| Idempotency/fingerprint | Envelope and changed-input conflict are implemented; exact fingerprint algorithm is explicitly deferred to M2. | M2 decision pending. |
| Audit fields / revisions | Created and transition audit DTOs plus version checks are present; persistence/append implementation is outside the M1 contract layer. | M2+ storage design pending. |
| Relationship invariant | Pair requires exactly one `PaymentMade --FULFILLS--> ExpenseRecognized` in the same organization/economic group. | Resolved for M1. |
| TaxPeriod statuses | TaxPeriod is structural only; deferred filing workflow values belong to Tax Filing Control. | M7 filing-graph and snapshot-status design pending. |

## 4. Commands run and actual result

```text
npm run verify
  npm run typecheck
    tsc --noEmit -p tsconfig.json
    PASS (exit 0)
  npm test
    node --experimental-strip-types --test test/*.test.ts
    12 tests: 12 pass, 0 fail, 0 skipped, 0 todo

git diff --check
  PASS (exit 0; no whitespace errors)
```

## 5. M1 boundary confirmation

M1 contains contracts, validation functions, immutable value objects, state-machine transition validation, seed data, tests, and review documents. It does **not** implement:

- Accounting Engine, account mapping, `JournalDraft`, debit/credit construction, or balancing
- Period authorization or Ledger posting
- Authoritative VAT/WHT/CIT calculation, tax events/position, filing, amendment, acknowledgement, or filing lock
- Reconciliation or Financial State
- LINE or AI integration / auto-confirmation

## 6. Gate decision

The M1 engineering verification and resolved M1 Product Owner decisions are **PASS**. M2 is **NOT READY**. Its remaining blockers are:

1. Product Owner **and Accounting** review/approval for the versioned `PAID_EXPENSE` posting-rule contract, which remains `DRAFT/PENDING`.
2. The approved rule must freeze the category-to-account mapping, payment-source-to-account mapping, permitted fallback/review behavior, and debit/credit/balancing construction; no silent suspense route is permitted.
3. The M2 idempotency contract must freeze exact event-fingerprint canonicalization and its operation scope.
4. Server-side authorization/separation-of-duties policy, explicit Period Engine authorization integration, and Ledger Posting Service atomic/idempotent contract must be specified and approved for M2.
5. Tax Filing workflow remains explicitly deferred to M7. It is not a blocker to closing M1, but it must not be pulled into M2 without a separate Tax Filing Control decision.

No implementation action may treat the draft posting-rule document as approved.
