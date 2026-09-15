# Wendy M3 — Source & Evidence Implementation Evidence v0.1

**Status:** `M3 IMPLEMENTATION REVISION COMPLETE — PENDING FORMAL REVIEW; M3 NOT ACCEPTED / NOT COMPLETE; PRODUCTION DEPLOYMENT NOT APPROVED`

**Scope:** Implementation evidence for the frozen generic M3 Source & Evidence boundary only. This document records neither Product nor Engineering acceptance and does not alter M1, M2, or the frozen M3 contracts.

## 1. Governing frozen bundle

| Artifact | Frozen SHA-256 |
|---|---|
| `WENDY_M3_SOURCE_EVIDENCE_SPEC_v0.1.md` | `f5c3253fc6499ecc69aaaf3e1e3768ce38fc7424edb76787a667cd3fd110a835` |
| `WENDY_M3_SOURCE_EVIDENCE_SCHEMA_v0.1.md` | `97b5a87d250824d27999b3714ee2beb94dd3bba5134e9dc7431fef534c3ca98b` |
| `WENDY_M3_SOURCE_EVIDENCE_TEST_CONTRACT_v0.1.md` | `572cc657ab4464a20a15fd3936dd4c6e20bb0cb942179220962a4a406f0c2cf6` |

**Frozen baseline:** `96b6d745151c06244bfdacf2cd3df8abbb7db906`
**Freeze evidence:** `M3-SOURCE-EVIDENCE-FREEZE-v1.0`
**Implementation authorization:** `M3-SOURCE-EVIDENCE-IMPLEMENTATION-AUTH-v1.0`

**Implementation-revision supplement:** `WENDY_M3_AUTHORIZATION_LIFECYCLE_AMENDMENT_v0.1.md` (`wendy.m3.authorization-lifecycle/0.1.0`). Its frozen ID mapping governs `M3-AUTH-LC-01` through `M3-AUTH-LC-15`; the original frozen M3 hashes above remain unchanged.

## 2. Implemented modules

| Module | Responsibility |
|---|---|
| `src/m3/contracts.ts` | Generic Source, Artifact, SourceRecord, Evidence, normalization, candidate, confirmation, lineage, availability, plus v2 target-bound authorization, CreationIntent, lifecycle, consumption, and denial-audit contracts. |
| `src/m3/canonical.ts` | Versioned M3 canonical JSON and SHA-256 byte/content hashing, independent from M2 fingerprints. |
| `src/m3/admission.ts` | Injected MIME/type and size admission policy; no production allowlist is embedded in the domain. |
| `src/m3/authority.ts` | Immutable target-bound authorization and CreationIntent integrity, lifecycle outcome, exact-scope, and consumption-hash validation. |
| `src/m3/sqlite-source-evidence-store.ts` | Append-only M3 SQLite persistence, schema-v2 lifecycle tables, uniqueness constraints, immutable-history triggers, transactional migration, and reverse trace query support. |
| `src/m3/source-evidence-service.ts` | Source/evidence intake, exact duplicate/review result, target/intent-bound protected operations, lifecycle revalidation, immutable consumption/denial audit, correction/replacement, non-authoritative handoff, and trace services. |

`src/index.ts` exports the M3 public surface. No M1 or M2 source module was changed.

## 3. Persistence and integrity evidence

**Schema key:** `wendy_m3`
**Schema version:** `2`

The SQLite store enables foreign keys, runs setup and v1→v2 migration inside `BEGIN IMMEDIATE`, refuses a database version newer than 2, and owns only `wendy_m3_*` tables. It does not create, alter, or write M2 financial tables.

The following records are database append-only: Source, Artifact, raw artifact content, source/artifact links, SourceRecord, record identity keys, Evidence, trusted authorization, normalization run, candidate, confirmation, lineage, availability, candidate/event trace link, and event/Journal trace link. Direct update/delete attempts are rejected by SQLite triggers.

Source artifact uniqueness is `(organization_id, content_hash)`. Source-record duplicate identity is limited to stable `source_system_ref + external_record_identity` or exact `artifact + record_locator`; missing or contradictory identity is `REVIEW_REQUIRED`. It is not an M2 accounting duplicate decision.

Schema v2 adds immutable `CreationIntent`, target-bound authorization, terminal lifecycle-fact, successful-consumption, and denied-security-audit tables. It preserves v1 history, permits at most one `SUPERSEDED` or `REVOKED` fact per decision, derives `EXPIRED` from one trusted clock timestamp, and rejects an incompatible newer schema.

## 4. Authority and financial boundary evidence

- The amendment-covered operations consume opaque v2 server records. Existing resources require exact organization, principal, operation, target type, target ID, and frozen content identity. Create/derived paths bind to one immutable server-authoritative CreationIntent. A caller's roles, organization claim, uploader identity, storage path, or embedded authorization object is not enough.
- Authorization integrity, issuer evidence, lifecycle fact, expiry, and exact scope are reloaded and revalidated at consumption time. State-changing correction and availability paths perform this check and the mutation under the same SQLite correctness transaction.
- Every allowed consumption writes immutable non-financial provenance. A denial writes a separate immutable, opaque security-audit record and never becomes a consumption or source/evidence truth.
- `NormalizedCandidateObservation.authority` is fixed to `OBSERVATION_ONLY`; unknown candidate command fields (including financial-authority fields) fail closed.
- `CandidateSourceFactConfirmation` accepts only the frozen source/business-fact field vocabulary, records an immutable confirmation Evidence item, and carries no accounting, T-01, tax, Period, approval, or Ledger authority.
- The M3 handoff returns the existing M1-compatible SourceRef tuple and EvidenceRefs plus exact USER_CONFIRM Evidence. It neither creates a FinancialEvent nor calls M2 validation, fingerprints, authorization, T-01, Period, Journal, or Ledger code.

## 5. Release-blocking test evidence

No release-blocking M3 row is `Partial`.

| Frozen test IDs | Test evidence | Result |
|---|---|---|
| `M3-ORG-01`, `M3-ORG-02` | Two-org server authorization, cross-org reference/read/duplicate non-disclosure | `PASS` |
| `M3-IMM-01` through `M3-IMM-04` | Direct Source, Artifact, Record, Evidence/raw-content mutation/deletion rejection | `PASS` |
| `M3-HASH-01` | Independently ordered canonical manual payload hash/preimage | `PASS` |
| `M3-DEDUP-01` through `M3-DEDUP-05` | Exact byte/source-record reuse; filename/content split; ambiguous similarity review; no M2 duplicate outcome | `PASS` |
| `M3-RAW-01`, `M3-NORM-01`, `M3-NORM-02` | Immutable raw inputs; provenance-rich derived candidate; independent normalization versions | `PASS` |
| `M3-LINEAGE-01` through `M3-LINEAGE-03` | Append-only `SUPERSEDES`, `REPLACES`, and unavailability facts with retained historical provenance | `PASS` |
| `M3-SEC-01`, `M3-SEC-02` | Server admission MIME/name/size/hash boundary and trusted raw/correction/availability authority | `PASS` |
| `M3-AUTH-01`, `M3-AUTH-02` | No Journal/Ledger surface; no authoritative account/tax/T-01/Period input accepted | `PASS` |
| `M3-HANDOFF-01` through `M3-HANDOFF-03` | Exact M1 tuple, mandatory USER_CONFIRM, confirmation scope refusal | `PASS` |
| `M3-SCOPE-01` | No LINE-specific adapter or direct financial path | `PASS` |
| `M3-TRACE-01`, `M3-TRACE-02` | Authorized candidate and Journal reverse trace through source/evidence, confirmation, lineage, and historical provenance | `PASS` |
| `M3-M2-01` | Existing source tuple shape retained; M3 has no M2 source-claim write surface | `PASS` |

Additional persistence tests prove independent SQLite-handle exact artifact reuse plus clean schema initialization and newer-schema refusal.

### Authorization-lifecycle amendment test evidence

| Frozen ID | Executable test | Result |
|---|---|---|
| `M3-AUTH-LC-01` | exact target and CreationIntent binding | `PASS` |
| `M3-AUTH-LC-02` | wrong target/type | `PASS` |
| `M3-AUTH-LC-03` | wrong content identity/version | `PASS` |
| `M3-AUTH-LC-04` | wrong operation | `PASS` |
| `M3-AUTH-LC-05` | nonexistent / forged decision | `PASS` |
| `M3-AUTH-LC-06` | wrong organization / principal | `PASS` |
| `M3-AUTH-LC-07` | integrity / policy / issuer validation | `PASS` |
| `M3-AUTH-LC-08` | revoked decision | `PASS` |
| `M3-AUTH-LC-09` | superseded decision | `PASS` |
| `M3-AUTH-LC-10` | expiry and null expiry | `PASS` |
| `M3-AUTH-LC-11` | replacement exact scope | `PASS` |
| `M3-AUTH-LC-12` | stale validation invalidated by lifecycle | `PASS` |
| `M3-AUTH-LC-13` | independent-connection lifecycle/correction race boundary | `PASS` |
| `M3-AUTH-LC-14` | independent-connection lifecycle/availability race boundary | `PASS` |
| `M3-AUTH-LC-15` | immutable consumption after later lifecycle change | `PASS` |

## 6. Verification record

The final implementation review must re-run:

```text
npm run verify
git diff --check
```

The implementation-revision run recorded type-check success and a passing 67-test suite (M1, M2, original M3, and lifecycle amendment). This evidence is not an acceptance decision.

### Test-count reconciliation

The following counts measure different things and must not be compared as if they were one denominator:

| Measure | Count | Meaning |
|---|---:|---|
| Frozen M3 contract IDs | 29 | Independent normative assertions in `WENDY_M3_SOURCE_EVIDENCE_TEST_CONTRACT_v0.1.md`. |
| M3 executable `test()` blocks | 12 | Ten blocks exercise the 29 frozen IDs; two additional blocks exercise SQLite independent-handle concurrency and schema-version refusal. |
| Frozen lifecycle-amendment IDs | 15 | Independent additional assertions in `WENDY_M3_AUTHORIZATION_LIFECYCLE_AMENDMENT_v0.1.md`. |
| Lifecycle executable `test()` blocks | 15 | One explicit executable test per frozen amendment ID. |
| M1 executable tests | 12 | Accepted M1 regression suite. |
| M2 executable tests | 28 | Accepted M2 regression suite. |
| Full executable suite | 67 | `12 M1 + 28 M2 + 12 original-M3 + 15 lifecycle`. |

The difference between 29 frozen original-M3 IDs and 12 original-M3 executable blocks is **17**, not missing tests: multiple independent frozen IDs are named in, and asserted by, one deliberately grouped executable test where they share one fixture and boundary. The 15 lifecycle IDs deliberately map one-to-one to 15 executable tests. The 67 total includes M1/M2 regression and M3 support tests; it is not a count of M3 IDs.

## 7. Outstanding deployment/security inputs

These do not change the frozen domain behavior but block a production-file-upload rollout until selected and evidenced by the responsible owners:

- production server identity/membership and trusted-decision issuance adapter;
- approved production MIME/type allowlist, per-artifact byte limit, and malware/content-scanning placement;
- target Node/SQLite runtime smoke test covering `DatabaseSync`, schema initialization, rollback, file locking, cross-process contention, and restart recovery; and
- retention/security process that may authorize immutable `UNAVAILABLE` availability facts.

## 8. Review recommendation

Submit this implementation revision with the combined frozen contract set for formal Product / Engineering implementation review. Verify the stated deployment configuration separately. Do not mark M3 complete, accepted, or production-deployment-approved until an authorized reviewer records that decision.
