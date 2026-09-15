# Wendy M3 — Formal Implementation Review v0.1

**Review status:** `ORIGINAL REVIEW COMPLETE — REVISION REQUIRED; AUTHORIZATION AMENDMENT APPROVED; IMPLEMENTATION REVISION COMPLETE — PENDING FORMAL RE-REVIEW`

**Scope:** Review of the actual M3 working-tree implementation against the frozen baseline `96b6d74`. This is a review record, not implementation acceptance. It does not mark M3 complete, accepted, or production-deployment-approved.

## 1. Baseline and verification

| Frozen artifact | SHA-256 reviewed |
|---|---|
| `WENDY_M3_SOURCE_EVIDENCE_SPEC_v0.1.md` | `f5c3253fc6499ecc69aaaf3e1e3768ce38fc7424edb76787a667cd3fd110a835` |
| `WENDY_M3_SOURCE_EVIDENCE_SCHEMA_v0.1.md` | `97b5a87d250824d27999b3714ee2beb94dd3bba5134e9dc7431fef534c3ca98b` |
| `WENDY_M3_SOURCE_EVIDENCE_TEST_CONTRACT_v0.1.md` | `572cc657ab4464a20a15fd3936dd4c6e20bb0cb942179220962a4a406f0c2cf6` |

Reviewed implementation surface: `src/m3/*`, `src/index.ts`, `test/m3-fixtures.ts`, `test/m3-source-evidence.test.ts`, M3 status records, and implementation evidence. No M1/M2 implementation source or package configuration changed.

```text
npm run verify  → PASS: type-check; 52/52 executable tests passed
git diff --check → PASS
```

## 2. Test-count reconciliation

There are **29 frozen M3 test IDs**, **12 executable M3 `test()` blocks**, and **52 executable tests in the complete repository suite**. These are intentionally different measures:

```text
29 frozen M3 IDs
  └─ asserted by 10 grouped M3 executable blocks
     + 2 additional M3 SQLite support blocks
     = 12 M3 executable tests

12 M1 regression tests + 28 M2 regression tests + 12 M3 tests
  = 52 executable tests
```

The apparent **17-test difference** (`29 IDs − 12 M3 test blocks`) is not a loss of coverage: one executable test may contain independently named/asserted contract cases that share a fixture. The **52 total** includes all M1/M2 regression and the two M3 persistence-support tests, so it must not be compared directly with the 29 M3-only contract IDs.

## 3. Complete frozen test-ID audit

Every row below maps one frozen ID to an executable test name in `test/m3-source-evidence.test.ts`. `Exact / PASS` means the identified assertion is present and passed in the review run.

| Frozen ID | Executable test name | Reviewed requirement | Result |
|---|---|---|---|
| `M3-ORG-01` | `M3-ORG-01, M3-ORG-02: server authority and every reference remain organization-scoped` | Organization-scoped creation/read and cross-org fail-closed | `Exact / PASS` |
| `M3-ORG-02` | Same block | Foreign evidence/reference and duplicate non-disclosure | `Exact / PASS` |
| `M3-IMM-01` | `M3-IMM-01 through M3-IMM-04: database constraints prohibit rewrites and destructive evidence deletion` | Source immutable identity/receipt | `Exact / PASS` |
| `M3-IMM-02` | Same block | Artifact hash/content/origin/storage immutability | `Exact / PASS` |
| `M3-IMM-03` | Same block | SourceRecord/Evidence immutable references | `Exact / PASS` |
| `M3-IMM-04` | Same block | Raw content deletion rejected | `Exact / PASS` |
| `M3-HASH-01` | `M3-HASH-01, M3-DEDUP-01, M3-DEDUP-02: byte-hash canonical content identity ignores filename but not content` | Stable canonical manual payload preimage/hash | `Exact / PASS` |
| `M3-DEDUP-01` | Same block | Same bytes/redelivery canonical artifact | `Exact / PASS` |
| `M3-DEDUP-02` | Same block | Same filename/different bytes remain distinct | `Exact / PASS` |
| `M3-DEDUP-03` | `M3-DEDUP-03 through M3-DEDUP-05: only exact record identities deduplicate; similarity routes review` | Stable external record identity reuse | `Exact / PASS` |
| `M3-DEDUP-04` | Same block | Similar free text does not auto-merge | `Exact / PASS` |
| `M3-DEDUP-05` | Same block | M3 result is not M2 financial duplicate truth | `Exact / PASS` |
| `M3-RAW-01` | `M3-RAW-01, M3-NORM-01, M3-NORM-02: normalized candidates are derived immutable observations` | Normalization preserves raw artifact/evidence | `Exact / PASS` |
| `M3-NORM-01` | Same block | Candidate provenance and observation-only fields | `Exact / PASS` |
| `M3-NORM-02` | Same block | Two normalization versions coexist traceably | `Exact / PASS` |
| `M3-LINEAGE-01` | `M3-LINEAGE-01 through M3-LINEAGE-03: correction/replacement/unavailability append lineage without rewriting history` | Corrected record `SUPERSEDES` predecessor | `Exact / PASS` |
| `M3-LINEAGE-02` | Same block | Replacement artifact `REPLACES` predecessor | `Exact / PASS` |
| `M3-LINEAGE-03` | Same block | Unavailability retains provenance and Journal references | `Exact / PASS` |
| `M3-SEC-01` | `M3-SEC-01 and M3-SEC-02: admission and raw/correction authority fail closed` | MIME/name/size admission rejects unsafe input | `Exact / PASS` |
| `M3-SEC-02` | Same block | Missing trusted raw authority fails closed | `Exact / PASS` |
| `M3-AUTH-01` | `M3-HANDOFF-01 through M3-HANDOFF-03 and M3-AUTH-01/02: handoff is source-facts-only and cannot write financial authority` | No Journal/Ledger write surface | `Exact / PASS` |
| `M3-AUTH-02` | Same block | Candidate cannot supply account/T-01/Period authority | `Exact / PASS` |
| `M3-HANDOFF-01` | Same block | M1-compatible candidate version/hash/source/evidence handoff | `Exact / PASS` |
| `M3-HANDOFF-02` | Same block | USER_CONFIRM required before handoff | `Exact / PASS` |
| `M3-HANDOFF-03` | Same block | USER_CONFIRM authority escalation rejected | `Exact / PASS` |
| `M3-SCOPE-01` | `M3-SCOPE-01: generic M3 surface contains no channel adapter or Ledger mutation entrypoint` | No LINE/direct financial adapter | `Exact / PASS` |
| `M3-TRACE-01` | `M3-TRACE-01, M3-TRACE-02, M3-M2-01: trace is reversible and source tuple stays M1/M2-compatible` | Journal-to-source reverse trace | `Exact / PASS` |
| `M3-TRACE-02` | Same block | Supersession does not rewrite historical provenance | `Exact / PASS` |
| `M3-M2-01` | Same block | M2 tuple unchanged; no M2 source-claim write | `Exact / PASS` |

Supporting non-contract-ID M3 tests: independent SQLite-handle duplicate serialization, plus clean schema initialization/newer-schema refusal. They account for the two M3 blocks beyond the ten grouped blocks above.

## 4. Review findings

### A. Contract behavior verified

- Source, Artifact, SourceRecord, Evidence, candidate, confirmation, lineage, availability, and trace records are organization-scoped; foreign-key/unique constraints cover the core containment identities and service reads/writes scope all lookups by organization.
- SHA-256 exact-byte Artifact hashing, canonical manual/record hashing, opaque generated storage references, non-authoritative filenames, exact duplicate reuse, and `REVIEW_REQUIRED` ambiguity are implemented.
- `wendy_m3` version 1 initializes under `BEGIN IMMEDIATE`, rejects a newer version, and uses SQLite immutable-history triggers. M2 tables and code are not modified.
- Candidate input is runtime-rejected when it supplies unapproved authority-bearing fields; confirmation is restricted to the frozen source/business field vocabulary.
- M3 has no import or write path to Ledger, M2 Posting, Tax, Period, T-01, mapping, or financial fingerprints. Its M1-compatible handoff remains non-authoritative.

### B. Historical release-blocking review finding — trusted authorization was not sufficiently target/lifecycle bound

The frozen authorization record is validated when registered, but a later service action loads it and checks only organization, actor, and capability. The implementation does not define or enforce:

- resource/target scope for an authorization decision (for example, one specified Artifact, Evidence, correction predecessor, or availability target);
- expiry, revocation, or supersession state; or
- revalidation of the authorization-record integrity hash and issuer capability at consumption time.

Consequently, the requested forged-input audit cases for a wrong target, stale/superseded decision, and altered stored authorization provenance were not represented in the original review run. The required policy is supplied by `WENDY_M3_AUTHORIZATION_LIFECYCLE_AMENDMENT_v0.1.md` under `M3-AUTH-LIFECYCLE-AMENDMENT-v1.0`.

### C. Revision verification package — pending formal re-review

The implementation revision adds schema v2, immutable server-authoritative CreationIntent, exact target-bound decisions, terminal lifecycle facts, trusted-clock expiry, consumption-time integrity/issuer/lifecycle revalidation, immutable allowed-consumption provenance, and a separate denied security-audit record. It adds one passing executable test for every frozen `M3-AUTH-LC-01` through `M3-AUTH-LC-15`, while retaining the original 29-ID M3 regression coverage.

```text
npm run verify  → PASS: type-check; 67/67 executable tests passed
git diff --check → PASS
```

This records implementation evidence only. It is not a new acceptance decision and must be assessed in a formal re-review against the combined frozen contract set.

## 5. Verdicts

| Review area | Verdict |
|---|---|
| Contract deviations | No financial-domain deviation found; authorization target/lifecycle remains underspecified for the requested review cases. |
| Organization isolation | `PASS` for implemented source/evidence operations and tested persistence boundaries. |
| Trusted authorization | `IMPLEMENTATION REVISION COMPLETE — PENDING FORMAL RE-REVIEW` |
| Immutability / availability | `PASS` — append-only SQLite records/triggers and retained provenance. |
| Candidate / USER_CONFIRM authority | `PASS` — observation-only and source-facts-only runtime validation. |
| Duplicate / lineage | `PASS` — exact identity only, ambiguity review, separate append-only lineage. |
| Traceability | `PASS` for implemented authorized candidate/Journal trace. |
| SQLite / persistence | `PASS` for schema, transaction, version refusal, constraints, and immutable history. |
| M1 regression | `12/12 PASS` |
| M2 regression | `28/28 PASS`; accepted PAID_EXPENSE behavior unchanged. |
| M3 frozen-ID audit | `29/29 Exact / PASS` |
| Full executable suite | `67/67 PASS` |
| Excluded scope | `PASS` — no LINE, Tax, Reconciliation, State, Payroll, FinancialObligation, or direct M3 Ledger posting. |

## 6. Remaining conditions

**Implementation-correctness review gate:** formal re-review of the implemented authorization-lifecycle amendment is required. This document does not self-accept the revision.

**Deployment-only conditions:** approved production identity/authorization adapter; MIME/type allowlist and size limit; malware/content-scanning placement; Node/SQLite startup/migration/rollback/locking/restart smoke test; and retention/security operating process for `UNAVAILABLE` artifacts.

## 7. Review recommendation

**PENDING FORMAL RE-REVIEW.** The implementation revision is complete against the approved amendment evidence, but M3 must not be marked accepted, complete, production-deployment-authorized, committed, or pushed until an authorized reviewer records the next decision.
