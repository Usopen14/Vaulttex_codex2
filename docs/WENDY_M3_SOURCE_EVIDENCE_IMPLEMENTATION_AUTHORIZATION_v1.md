# Wendy M3 — Source & Evidence Implementation Authorization v1

**Product:** Vault
**Engine:** Wendy
**Status:** `IMPLEMENTATION REVISION AUTHORIZED AGAINST COMBINED FROZEN CONTRACT SET; IMPLEMENTATION ACCEPTANCE NOT APPROVED`
**Production deployment:** `NOT AUTHORIZED`
**Authorized scope:** Frozen M3 Source & Evidence generic substrate only.

## 1. Product / Engineering authorization evidence

| Evidence field | Recorded value |
|---|---|
| Decision | `AUTHORIZE` |
| Product / Engineering Owner | `Dr. Masato` |
| Role | `Product Owner / Engineering Owner / CEO` |
| Decision date | `15 Sep 2026` |
| Evidence reference | `M3-SOURCE-EVIDENCE-IMPLEMENTATION-AUTH-v1.0` |

The Product / Engineering Owner explicitly authorizes implementation of the frozen M3 Source & Evidence generic substrate.

## 2. Authorized normative baseline

| Frozen document | Baseline SHA-256 at commit `96b6d74` |
|---|---|
| `WENDY_M3_SOURCE_EVIDENCE_SPEC_v0.1.md` | `f5c3253fc6499ecc69aaaf3e1e3768ce38fc7424edb76787a667cd3fd110a835` |
| `WENDY_M3_SOURCE_EVIDENCE_SCHEMA_v0.1.md` | `97b5a87d250824d27999b3714ee2beb94dd3bba5134e9dc7431fef534c3ca98b` |
| `WENDY_M3_SOURCE_EVIDENCE_TEST_CONTRACT_v0.1.md` | `572cc657ab4464a20a15fd3936dd4c6e20bb0cb942179220962a4a406f0c2cf6` |

| Gate | Status |
|---|---|
| M3 Product/Security decisions | `COMPLETE / APPROVED` |
| M3 Product/Engineering contract freeze | `COMPLETE / ACCEPTED` |
| M3-P01 through M3-P06 | `FROZEN` |
| M3 implementation | `READY / AUTHORIZED` |
| Production deployment | `NOT AUTHORIZED` |

## 3. Authorized implementation boundary

The authorized substrate is:

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

Implementation may create the frozen M3 source/evidence contracts, persistence, server-authorized raw-evidence access/correction, immutable lineage and availability history, admission-policy injection, deterministic source duplicate behavior, normalization/candidate provenance, `CandidateSourceFactConfirmation`, authorized traceability, and the frozen release-blocking tests.

## 4. Boundaries retained during implementation

`NormalizedCandidateObservation` remains `OBSERVATION_ONLY`. M3 must not establish accounting truth, authoritative GL accounts, accounting approval, T-01 eligibility, tax treatment, Period authorization, Ledger posting permission, or M2 financial-effect duplicate truth.

This authorization does not permit changes to M1 FinancialEvent semantics, the PAID_EXPENSE/v1 Accounting Rule, M2 fingerprint contracts, T-01, authorization/SOD, Period controls, Ledger Posting Service, or M2 correction/reversal. A required change to an accepted M1/M2 contract must stop the affected path and be reported.

LINE integration, LINE webhook/parsing/bot behavior, a LINE-specific source adapter, live bank connectors, and malware/content-scanning infrastructure are outside this implementation authorization.

## 5. Implementation gate

The authorized implementation must satisfy every frozen M3 release-blocking test and preserve all M1/M2 regression tests. It must use persistence-enforced organization integrity, immutability, duplicate identity, lineage, availability, and provenance where required by the frozen test contract; correctness must not rely only on process-local state.

This record authorizes implementation work only. It does not mark M3 complete or implementation accepted, and it does not approve production deployment.

## 6. Authorization Lifecycle Amendment synchronization

The original authorization evidence above remains intact. Following the approved amendment evidence `M3-AUTH-LIFECYCLE-AMENDMENT-v1.0`, its usable scope is the combined frozen contract set:

```text
Original frozen M3 Source & Evidence bundle v0.1
+ WENDY_M3_AUTHORIZATION_LIFECYCLE_AMENDMENT_v0.1.md
```

| Current field | Status |
|---|---|
| M3 Authorization Lifecycle Amendment | `COMPLETE / APPROVED / FROZEN` |
| M3 implementation | `REVISION REQUIRED` |
| Implementation revision | `AUTHORIZED AGAINST COMBINED FROZEN CONTRACT SET` |
| Implementation acceptance | `NOT APPROVED` |
| Production deployment | `NOT AUTHORIZED` |

This synchronization does not accept the existing implementation. It authorizes only the required implementation/test revision under the approved amendment.
