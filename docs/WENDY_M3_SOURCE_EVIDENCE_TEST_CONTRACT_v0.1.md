# Wendy M3 — Source & Evidence Test Contract v0.1

**Product:** Vault  
**Engine:** Wendy  
**Status:** `FROZEN — NORMATIVE M3 RELEASE-BLOCKING TEST CONTRACT; IMPLEMENTATION READY / AUTHORIZED; NO PRODUCTION DEPLOYMENT`
**Companions:** `WENDY_M3_SOURCE_EVIDENCE_SPEC_v0.1.md`, `WENDY_M3_SOURCE_EVIDENCE_SCHEMA_v0.1.md`
**M3 frozen baseline commit:** `96b6d745151c06244bfdacf2cd3df8abbb7db906`
**Freeze record:** `WENDY_M3_SOURCE_EVIDENCE_CONTRACT_FREEZE_v1.md`
**Implementation authorization record:** `WENDY_M3_SOURCE_EVIDENCE_IMPLEMENTATION_AUTHORIZATION_v1.md`

## 1. Test-contract boundary

These are normative release-blocking M3 tests. They verify source/evidence immutability, provenance, organization isolation, and the non-authoritative candidate boundary. They do not authorize M3 code, alter M1/M2 tests, or test accounting/tax/Ledger outcomes as M3 behavior.

All fixture data must use two organizations, distinct authorized actors, immutable exact content bytes, and stable timestamps/identities. The test implementation must use independent repository/storage access paths for organization-isolation and immutable-history checks.

## 2. Normative release-blocking tests

| Test ID | Required assertion | Expected result |
|---|---|---|
| `M3-ORG-01` | A server-authorized request can create/read Source, artifact, record, Evidence, normalization run, candidate, lineage, and availability records only in its organization. | Cross-organization creation and access fail closed. |
| `M3-ORG-02` | A caller cannot attach another organization's Evidence or SourceRef to a candidate, or discover its canonical IDs through a duplicate lookup. | `REJECTED`/authorization failure with no foreign reference disclosure. |
| `M3-IMM-01` | Source immutable identity/receipt fields cannot be changed after creation. | Direct or API mutation fails; original value remains. |
| `M3-IMM-02` | Artifact bytes, hash, original name provenance, byte size, source origin, and storage reference cannot be changed. | Mutation fails; original hash and provenance remain. |
| `M3-IMM-03` | SourceRecord raw hash/locator/reference and Evidence reference/hash/type cannot be changed. | Mutation fails; original records remain traceable. |
| `M3-IMM-04` | Raw evidence that supports an event consumed by a posted Journal is submitted to normal application deletion behavior. | Destructive deletion is rejected; immutable evidence/provenance and Journal references remain. |
| `M3-HASH-01` | The same valid manual payload or source record reaches canonical content hashing through independent runs. | The declared M3 canonicalization version yields the same UTF-8 preimage/hash; different raw bytes or record locators do not silently share an Artifact identity. |
| `M3-DEDUP-01` | Same exact artifact bytes delivered twice to one organization, including a different filename. | One canonical artifact; later Source intake is retained and linked as redelivery. |
| `M3-DEDUP-02` | Same filename with different bytes is delivered. | Distinct artifacts; no filename-based deduplication. |
| `M3-DEDUP-03` | A record is delivered twice with the same stable provider identity, source-system scope, and external record identity. | Canonical SourceRecord is returned as `DUPLICATE_RECORD`; no second equivalent SourceRecord is created. |
| `M3-DEDUP-04` | Two records have similar/free-text-equivalent merchant, amount, date, semantic category, or AI confidence but lack exact stable identity equivalence. | They route `REVIEW_REQUIRED`; no automatic collapse or M2 duplicate claim occurs. |
| `M3-DEDUP-05` | A duplicate artifact/source record has already contributed to a later event candidate. | M3 returns only source-level duplicate identity and never emits an M2 accounting duplicate result. |
| `M3-RAW-01` | Normalization produces a candidate from raw Evidence. | Raw artifact/record/evidence bytes and hashes remain unchanged; candidate uses new derived provenance. |
| `M3-NORM-01` | A candidate contains an observed value, normalizer identity/version, timestamp, transformation provenance, SourceRef, EvidenceRef, and candidate hash. | Missing any required provenance fails closed. |
| `M3-NORM-02` | Two normalization versions interpret the same Evidence differently. | Both derived outputs remain traceable; neither rewrites the other or raw evidence. |
| `M3-LINEAGE-01` | An authorized source correction supersedes an earlier record. | New SourceRecord/Evidence plus immutable `SUPERSEDES`; predecessor remains readable by authorized trace. |
| `M3-LINEAGE-02` | An authorized supplied replacement artifact replaces earlier content. | New artifact/Evidence with a distinct content hash plus immutable `REPLACES`; predecessor remains intact. |
| `M3-LINEAGE-03` | Original content becomes unavailable under trusted retention/security authority. | Availability fact preserves identity, hash, MIME/type, known size, locator, lineage, actor/process, timestamp, and event/Journal refs; prior provenance remains unchanged. |
| `M3-SEC-01` | Uploaded content has a disallowed MIME/type, mismatched detected type, invalid content hash, invalid size, unsafe storage reference, or path-like user filename. | Content is rejected before canonical artifact acceptance; no executable/path trust is granted. |
| `M3-SEC-02` | A caller without a trusted server authorization requests raw artifact/evidence access, correction, replacement, or unavailability. | Access/action fails closed; client roles, client organization IDs, and uploader identity do not grant authority. |
| `M3-AUTH-01` | A candidate/normalization request attempts a Journal, Ledger, or posted-record write. | Operation is absent or rejected; no Ledger mutation occurs. |
| `M3-AUTH-02` | A candidate attempts to choose an authoritative account, assert tax treatment/T-01, grant approval, or authorize Period posting. | Request is rejected; no trusted M2 decision or authority record is created. |
| `M3-HANDOFF-01` | An authorized candidate handoff carries candidate version/hash plus exact existing M1 SourceRefs/EvidenceRefs. | The handoff remains non-authoritative and preserves accepted M1/M2 tuple shape. |
| `M3-HANDOFF-02` | A candidate lacks `USER_CONFIRM` and tries to become a confirmed PAID_EXPENSE Financial Event. | Existing M1 confirmation invariant rejects it; M3 does not bypass it. |
| `M3-HANDOFF-03` | `USER_CONFIRM` attempts to supply authoritative account, T-01, tax, Period, accounting-approval, or Ledger data. | Confirmation is limited to approved source/business fields; authoritative values are rejected/ignored and no M2 authority record is created. |
| `M3-SCOPE-01` | M3 production surface is inspected for a LINE-specific ingestion adapter or direct adapter path to FinancialEvent, Accounting, T-01, Period, or Ledger. | No LINE-specific M3 ingestion surface exists; future adapters can enter only through Source/Evidence/Candidate. |
| `M3-TRACE-01` | A posted Journal created later from events sourced by a candidate is queried in reverse. | Authorized trace resolves `Journal → Events → Candidate → Evidence → SourceRecord → SourceArtifact → Source` with exact hashes/versions. |
| `M3-TRACE-02` | A source record/artifact is superseded after a later Journal is posted. | Historical Journal provenance remains unchanged; later lineage is visible without rewriting it. |
| `M3-M2-01` | M3 source references are supplied to the accepted M2 pair boundary. | M2 source tuple/fingerprint behavior remains unchanged; M3 cannot write an M2 source claim directly. |

## 3. Test acceptance conditions

M3 cannot pass its release gate if any test demonstrates one of the following:

- raw evidence can be overwritten, silently replaced, or lose its historical hash;
- a candidate, confidence value, or source duplicate result becomes financial, tax, approval, Period, account-mapping, or Ledger authority;
- cross-organization source/evidence visibility or attachment succeeds;
- filename, free text, merchant, amount, date, or display metadata is used as authoritative source identity;
- source correction/replacement alters evidence used by a posted Journal;
- traceability from a later Journal to exact source content/provenance is missing; or
- M3 changes the accepted M2 fingerprint, T-01, authorization/SOD, Period, accounting-rule, or Ledger contracts.

## 4. Engineering and deployment test inputs

The following require Engineering freeze or deployment configuration before tests can become fully executable. They do not reopen the frozen Product/Security decisions:

| Input | Blocking owner |
|---|---|
| Named supported MIME/type policy and configurable byte limits | Security/Engineering with Product input |
| Concrete server authorization capability keys and decision-store adapter | Engineering freeze |
| Initial MIME/type allowlist, maximum size, and malware/content scanning placement | Security/Engineering deployment |
| Acceptance of proposed canonical serialization versions | Engineering freeze |

The test contract is frozen with the M3 schema/spec. These engineering/deployment inputs must be selected and evidenced before an implementation or deployment uses the relevant adapter/configuration; they do not change the frozen test requirements.
