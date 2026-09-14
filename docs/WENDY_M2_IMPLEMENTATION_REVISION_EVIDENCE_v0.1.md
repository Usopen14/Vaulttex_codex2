# Wendy M2 — Implementation Revision Evidence v0.1

**Status:** `IMPLEMENTATION ACCEPTED WITH DEPLOYMENT CONDITION — M2 COMPLETE — PRODUCTION DEPLOYMENT NOT APPROVED`

**Scope:** PAID_EXPENSE v1 implementation review revisions only. This evidence does not alter any frozen Product, Accounting, T-01, Engineering, DTO, or test-contract semantics, and it does not authorize production deployment.

## 1. Trusted-decision boundary

`OriginalPostingCommand` and `CorrectionPostingCommand` carry opaque decision identifiers only. `LedgerPostingService` loads the referenced `TrustedAuthorizationDecisionRecord` and `TrustedTaxImpactEligibilityDecisionRecord` from a `TrustedDecisionAuthority`; it rejects request objects that smuggle embedded decision payloads.

Each authority record is immutable, integrity-hashed, capability/evidence backed, organization/effect/version bound, and may be superseded only by a new record plus immutable supersession link. The Ledger rechecks the exact requested operation, requester/originator, event ids and versions, FULFILLS relationship, economic group, source request, approval level, rule/policy version, reviewer/issuer capability evidence, and integrity hash before a post can continue.

For every committed Journal, `ConsumedDecisionProvenance` is written in the same transaction. It snapshots the exact authorization and T-01 identifiers, decisions, policy versions, evidence references, deciding/reviewer actors, capability evidence, decision integrity hashes, T-01 provenance hash, and posting transaction reference. Historical provenance cannot be changed by later supersession.

## 2. Release-blocking acceptance audit

No row below is `Partial`.

| Contract ID | Evidence | Result |
|---|---|---|
| BAL-01, BAL-02 | `test/m2-paid-expense.test.ts`, `test/m2-revision.test.ts` | `Exact / PASS` |
| MAP-01 through MAP-04 | Mapping unit/contract tests, including display-text, bank-name, and mutable-metadata-only negative cases | `Exact / PASS` |
| ORG-01 | Cross-organization posting/result non-disclosure test | `Exact / PASS` |
| EVT-01, EVT-02 | Canonical pair and AP/accrual/prepayment/refund/split/FX excluded-family tests | `Exact / PASS` |
| TAX-01 through TAX-03 | All non-eligible outcomes, authoritative binding/version/supersession, reviewer capability, and provenance tests | `Exact / PASS` |
| AUTH-01 through AUTH-06 | Trusted reference-only input, forged object/id/binding/provenance/capability tests; USER_CONFIRM, SOD, Owner Override, and Ledger writer tests | `Exact / PASS` |
| PER-01 through PER-04 | OPEN/CLOSED/LOCKED/race coverage; LOCKED cannot post | `Exact / PASS` |
| FP-01 through FP-03 | Canonical fingerprint and collision/preimage coverage | `Exact / PASS` |
| IDEMP-01 through IDEMP-04 | Same-key replay/conflict, duplicate effect, source collision coverage | `Exact / PASS` |
| CON-01 through CON-03 | Independent SQLite connections for same key/effect and competing corrections; in-progress original correction route | `Exact / PASS` |
| TX-01, TX-02 | Complete SQLite manifest, original and correction atomicity, and mandatory-write rollback coverage | `Exact / PASS` |
| RETRY-01, RETRY-02 | Terminal no-effect outcomes and canonical replay coverage | `Exact / PASS` |
| COR-01 through COR-03 | Exact reversal, original/reversal/replacement/provenance chain, period decisions, and rollback tests | `Exact / PASS` |
| IMM-01 | Direct SQLite UPDATE/DELETE rejection for posted Journal, packed Journal lines, consumed provenance, and audit facts | `Exact / PASS` |

## 3. SQLite schema/migration evidence

**Schema identifier:** `wendy_m2`

**Current schema version:** `2`

`SqliteLedgerStore` applies a deterministic transactional migration before accepting operations. Version 2 adds the schema metadata, trusted authorization/T-01 authority records, immutable supersession links, and immutable consumed-decision provenance tables/triggers to the existing pre-versioned M2 prototype tables.

- Clean database initialization creates version 2.
- A version-1 prototype metadata record upgrades transactionally to version 2 while preserving existing tables/data.
- Migration failure rolls the transaction back.
- A database reporting a version newer than 2 fails before M2 tables are created or changed (`M2_SCHEMA_VERSION_UNSUPPORTED`).

## 4. Independent-connection concurrency evidence

Two separately opened `SqliteLedgerStore` connections against one file were tested for the same idempotency key, the same financial effect under different keys, and competing corrections of one original Journal. Database uniqueness, foreign keys, immutable triggers, and `BEGIN IMMEDIATE` serialization — not a process-local lock — controlled the outcome.

The losing correction returns a deterministic no-effect result; only one original effect and one correction chain commit. A child process also held an SQLite write lock while a distinct connection posted. The post waited within the configured five-second bound and committed only after the lock released; no partial Journal remained.

## 5. Node SQLite deployment condition

**Classification:** `ACCEPT_WITH_DEPLOYMENT_CONDITION`

- Tested runtime: `Node.js v25.4.0`.
- Adapter: built-in `node:sqlite` `DatabaseSync`.
- Runtime status: Node emitted its experimental API warning for `node:sqlite`.
- No SQLite-specific runtime flag was required. `--experimental-strip-types` is used only by this repository's TypeScript test runner.
- Production condition: deploy only to an organization-approved Node runtime that provides the tested `DatabaseSync` API and has passed a target-environment smoke/migration/locking test; retain the deployment condition independently from financial-correctness acceptance.

## 6. Verification commands

```text
npm run verify
git diff --check
```

The current revision completed both commands successfully: type-check passed, all 40 tests passed, and `git diff --check` passed. Formal Product / Engineering acceptance is recorded separately as `ACCEPT_WITH_CONDITIONS` on 14 Sep 2026 under evidence reference `M2-IMPLEMENTATION-ACCEPT-v1.0`; see `WENDY_M2_IMPLEMENTATION_ACCEPTANCE_v1.md`. That acceptance leaves the target-runtime deployment condition in force and does not approve production deployment.
