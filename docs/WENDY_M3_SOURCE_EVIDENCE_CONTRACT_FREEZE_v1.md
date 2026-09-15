# Wendy M3 — Source & Evidence Contract Freeze v1

**Product:** Vault
**Engine:** Wendy
**Status:** `M3 PRODUCT / ENGINEERING CONTRACT FREEZE COMPLETE / ACCEPTED`
**M3 implementation:** `READY / AUTHORIZED`
**Production deployment:** `NOT AUTHORIZED`

## 1. Verified committed baseline

The normative M3 baseline was verified from commit `96b6d745151c06244bfdacf2cd3df8abbb7db906` (`96b6d74 docs: prepare M3 source evidence contracts`) on `master`. The verification read Git objects at that commit, not a working-tree copy.

| Frozen document | SHA-256 of exact committed file |
|---|---|
| `WENDY_M3_SOURCE_EVIDENCE_SPEC_v0.1.md` | `f5c3253fc6499ecc69aaaf3e1e3768ce38fc7424edb76787a667cd3fd110a835` |
| `WENDY_M3_SOURCE_EVIDENCE_SCHEMA_v0.1.md` | `97b5a87d250824d27999b3714ee2beb94dd3bba5134e9dc7431fef534c3ca98b` |
| `WENDY_M3_SOURCE_EVIDENCE_TEST_CONTRACT_v0.1.md` | `572cc657ab4464a20a15fd3936dd4c6e20bb0cb942179220962a4a406f0c2cf6` |

## 2. Authorized Product / Engineering decision

| Evidence field | Recorded value |
|---|---|
| Decision | `APPROVE / FREEZE` |
| Product / Engineering Owner | `Dr. Masato` |
| Role | `Product Owner / Engineering Owner / CEO` |
| Decision date | `15 Sep 2026` |
| Evidence reference | `M3-SOURCE-EVIDENCE-FREEZE-v1.0` |
| Approved baseline commit | `96b6d74` |
| Scope | `M3 Source & Evidence generic substrate only` |

## 3. Frozen Product / Security decisions

| Decision | Frozen outcome |
|---|---|
| `M3-P01` | LINE integration is deferred out of M3. A future LINE adapter must enter through the M3 Source/Evidence/Candidate boundary and has no direct path to FinancialEvent, Accounting Engine, T-01, Period, or Ledger. |
| `M3-P02` | Evidence/provenance associated with FinancialEvents or Journals is immutable. Raw-content unavailability preserves historical provenance and cannot erase it. |
| `M3-P03` | Raw-evidence access/correction requires trusted server authority. Correction appends immutable evidence/artifacts and source lineage. |
| `M3-P04` | Exact authoritative duplicates may reuse canonical source/evidence identity. Ambiguous similarity is `REVIEW_REQUIRED` and never auto-merges. |
| `M3-P05` | MIME allowlist and artifact-size limits are server-controlled deployment/security configuration; unsupported inputs fail closed. |
| `M3-P06` | `NormalizedCandidateObservation` remains `OBSERVATION_ONLY`; `USER_CONFIRM` confirms source/business facts only. |

## 4. Frozen authority and lineage boundary

```text
Source
→ SourceArtifact
→ SourceRecord
→ Evidence
→ NormalizedCandidateObservation
→ authorized source/business confirmation
→ FinancialEvent
→ accepted M2 controls
→ Journal / Ledger
```

M3 does not establish accounting truth, authoritative GL accounts, T-01 eligibility, tax treatment, Period authorization, Ledger-posting authority, or M2 financial-effect duplicate truth. Confidence and normalization output grant no financial authority.

Exact artifact/record identity, content hashing, immutable artifact/evidence/availability history, candidate provenance, exact duplicate reuse, `REVIEW_REQUIRED` ambiguity, and `DERIVED_FROM` / `SUPERSEDES` / `REPLACES` are frozen as committed. M3 source lineage remains separate from M2 FinancialEvent correction/reversal semantics, and M2 fingerprint algorithms remain unchanged.

## 5. Normative test contract and remaining dependencies

`WENDY_M3_SOURCE_EVIDENCE_TEST_CONTRACT_v0.1.md` is a normative release-blocking M3 test contract. It includes organization isolation, immutable historical evidence, exact/ambiguous duplicate behavior, authorized access/correction, MIME/size admission, candidate authority limits, future-adapter boundary, end-to-end traceability, and non-rewrite of provenance after supersession.

The following are deployment/security configuration dependencies, not remaining M3 contract blockers:

- concrete MIME/type allowlist;
- concrete maximum artifact size; and
- malware/content scanning deployment placement.

## 6. Freeze gate result

| Gate | Status |
|---|---|
| M3 Product/Security decisions | `COMPLETE / APPROVED` |
| M3 Product/Engineering contract freeze | `COMPLETE / ACCEPTED` |
| Remaining contract blockers | `NONE` |
| M3 implementation | `READY / AUTHORIZED` |
| Production deployment | `NOT AUTHORIZED` |

The freeze does not implement M3 production code, alter M1/M2 accepted behavior, reopen M2, or authorize production deployment. M3 implementation authorization is recorded separately in `WENDY_M3_SOURCE_EVIDENCE_IMPLEMENTATION_AUTHORIZATION_v1.md`.

## 7. Implementation authorization synchronization

| Evidence field | Recorded value |
|---|---|
| Decision | `AUTHORIZE` |
| Product / Engineering Owner | `Dr. Masato` |
| Role | `Product Owner / Engineering Owner / CEO` |
| Decision date | `15 Sep 2026` |
| Evidence reference | `M3-SOURCE-EVIDENCE-IMPLEMENTATION-AUTH-v1.0` |
| Authorized baseline | `96b6d74` |
| M3 implementation | `READY / AUTHORIZED` |
| Production deployment | `NOT AUTHORIZED` |

This authorization permits only the frozen M3 Source & Evidence generic substrate. It does not mark M3 complete, implementation accepted, or production deployment approved.
