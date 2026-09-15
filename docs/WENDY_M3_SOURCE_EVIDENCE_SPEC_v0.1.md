# Wendy M3 — Source & Evidence Contract Specification v0.1

**Product:** Vault  
**Engine:** Wendy  
**Status:** `FROZEN — M3 PRODUCT / ENGINEERING CONTRACT FREEZE COMPLETE / ACCEPTED; IMPLEMENTATION READY / AUTHORIZED; PRODUCTION DEPLOYMENT NOT AUTHORIZED`
**Scope:** Organization-scoped source and evidence provenance for the first `PAID_EXPENSE` workflow.  
**Baseline:** M1 `CLOSED / ACCEPTED`; M2 `COMPLETE — IMPLEMENTATION ACCEPTED WITH DEPLOYMENT CONDITION` at commit `0aea54a`.
**M3 frozen baseline commit:** `96b6d745151c06244bfdacf2cd3df8abbb7db906`
**Freeze record:** `WENDY_M3_SOURCE_EVIDENCE_CONTRACT_FREEZE_v1.md`
**Implementation authorization record:** `WENDY_M3_SOURCE_EVIDENCE_IMPLEMENTATION_AUTHORIZATION_v1.md`

## 1. Purpose and authority boundary

M3 preserves what an external or user-provided source says before any Financial Event is created or proposed. Its traceable chain is:

```text
external or user input
→ Source
→ SourceArtifact
→ SourceRecord
→ Evidence
→ normalized candidate observation
→ existing FinancialEvent confirmation path
→ existing M2 PAID_EXPENSE validation / Ledger path
```

M3 is **not** an accounting, tax, approval, Period, Financial Event, Journal, or Ledger authority. A source, evidence item, normalization output, confidence value, or candidate only expresses what the underlying evidence appears to say.

The governing principles are:

1. Evidence is immutable and append-only.
2. Provenance remains reversible from a later authorized result to exact source content and transformations.
3. An observation never becomes financial truth on its own.

## 2. Existing contracts reused without change

| Existing contract | Reuse in M3 | Boundary retained |
|---|---|---|
| M1 `OrganizationId`, `SourceId`, `SourceArtifactId`, `EvidenceId`, `CandidateId`, `ContentHash`, `TraceId`, `RequestId` | Identity, organization scope, hash, request, and trace references | M3 does not change their M1 formats or semantics. |
| M1 `SourceRef` | Event-to-source reference: `source_id`, `source_artifact_id`, optional `source_record_id`, and `content_hash` | M3 produces references compatible with this existing shape; it does not redefine it. |
| M1 `EvidenceRef` and `EvidenceType` | Exact evidence reference on candidates and later events | Existing types remain `SOURCE_ARTIFACT`, `DOCUMENT`, `USER_CONFIRMATION`, and `EXTERNAL_RECORD`; M3 adds no financial authority to them. |
| M1 `CandidateId`, `ConfirmPaidExpense`, and confirmation requirements | Non-authoritative candidate identity and later handoff | M3 does not confirm an event or bypass the required `USER_CONFIRM` evidence. |
| M1 Financial Event provenance and `TaxObservation.authority = OBSERVATION_ONLY` | Event source/evidence attachment and observation-only tax boundary | M3 does not create an authoritative tax result, treatment, or T-01 decision. |
| M2 event/effect fingerprints and source claim tuples | Later M2 consumes the unchanged source tuple `(source_id, source_artifact_id, source_record_id, content_hash)` | M3 deduplication is not an M2 accounting-duplicate decision and cannot write an M2 source claim. |
| M2 immutable Journal provenance | Existing JournalDraft carries source/evidence references into immutable Ledger history | M3 may be traced by a Journal, but cannot create, modify, reverse, or post one. |

`SourceRecordId` is a new M3 **opaque source-record identity**. It occupies the existing M1 `SourceRef.source_record_id: string | null` slot when available; this is a refinement of an already opaque string, not a modification of M1 behavior.

## 3. Narrow M3 source boundary

The proposed first M3 contract supports only these source types:

- `MANUAL_USER_INPUT`
- `FILE_UPLOAD`
- `BANK_RECORD_IMPORT`

`BANK_RECORD_IMPORT` means an explicitly supplied file or structured import. It does not authorize a live bank connector.

M3 does not include LINE integration, email ingestion, live bank connectors, OCR authority, AI autonomous ingestion, card networks, payment processors, Tax Engine behavior, Reconciliation, Financial State, accounting account selection, or Ledger posting. Metadata from future channels may be retained only as non-authoritative source metadata under a later approved contract.

LINE integration is explicitly deferred out of M3. A later LINE milestone must use this M3 `Source → SourceArtifact → SourceRecord → Evidence → NormalizedCandidateObservation` boundary and must not obtain a direct path to FinancialEvent, Accounting Engine, T-01, Period, or Ledger.

## 4. Proposed source and evidence model

### 4.1 Source — immutable intake envelope

A `Source` represents one organization-scoped intake envelope. It records the origin and receipt of a delivery; a retry using the same idempotency scope returns the established canonical intake rather than rewriting it.

Its immutable identity/provenance includes source type, provider/source-system reference when applicable, original external reference when supplied, receiving request/actor, received timestamp, and artifact links. Display labels, filenames, merchant names, amount, dates, and free text are not source identities.

When an artifact is re-delivered with identical bytes, a new Source intake may link to the already canonical artifact. This preserves the second delivery without duplicating or mutating the content object.

### 4.2 SourceArtifact — immutable original content identity

A `SourceArtifact` is the canonical stored representation of exact raw bytes or a canonical raw manual-input payload. Its `content_hash` is SHA-256 over those exact bytes. Filename, declared MIME type, and storage location are descriptive/provenance fields, not content identity.

The first source that established the artifact is retained as its originating source. Later deliveries point to the same canonical artifact when they have the same organization-scoped content identity. An artifact cannot have its content, hash, source origin, byte size, or storage-content reference rewritten.

### 4.3 SourceRecord — immutable record observed within content

A `SourceRecord` is an immutable, traceable record extracted from one canonical SourceArtifact, such as a structured manual submission or a row in an uploaded bank import. It retains an optional stable provider/record locator, the applicable source-system scope, an exact canonical raw-record hash, source timestamp where supplied, and an opaque reference to raw record fields.

The record hash is not a financial-event fingerprint. Its sole purpose is to identify the exact source-record representation under its declared canonicalization version. The proposed `wendy.m3.source-record-canonical/0.1.0` contract uses a UTF-8 canonical JSON representation with lexically sorted object keys, no undefined values, only finite safe-integer JSON numbers, and decimal amounts represented as strings; SHA-256 is computed over those UTF-8 bytes. File Artifact hashes always remain SHA-256 over original bytes, not normalized text.

### 4.4 Evidence — immutable reference to exact support

An `Evidence` item is an organization-scoped immutable reference to one exact SourceArtifact and, where applicable, SourceRecord. It retains the evidence type, content hash, transformation/extraction provenance, and creation time. Evidence cannot be edited to point to replacement content.

The existing M1 `EvidenceRef` is the portable reference used by candidates and later Financial Events. A confirmation is distinct evidence of a human decision; it never replaces raw SourceArtifact or SourceRecord evidence.

### 4.5 Normalized candidate observation — non-authoritative interpretation

A `NormalizedCandidateObservation` is a new derived representation, not an update to raw evidence. It contains only observed/proposed values, its input Evidence references, normalizer identity/version, transformation provenance, timestamp, and an optional confidence value.

It may contain observed amount/currency, relevant dates, merchant/counterparty observation, payment-source observation, semantic-category proposal, and a candidate kind for the PAID_EXPENSE workflow. It must never contain authoritative account selection, accounting treatment, tax treatment, Period permission, approval decision, or Ledger result.

## 5. Raw, normalized, candidate, event, and Ledger layers

| Layer | What it means | May not do |
|---|---|---|
| Raw source evidence | Exact supplied bytes or canonical raw manual payload | Be overwritten by extraction, normalization, confirmation, or correction. |
| SourceRecord | Exact record/row observed within raw content | Claim a business or accounting fact merely because it was parsed. |
| Normalized candidate observation | Versioned interpretation of what evidence appears to say | Post, select an account, authorize T-01/Period, approve accounting/tax, or become a Financial Event automatically. |
| Financial Event candidate confirmation path | Existing M1 confirmation and validation boundary | Bypass `USER_CONFIRM`, required review, source/evidence references, or M2 controls. |
| Posted Journal / Ledger | Existing M2 accounting authority | Be created or changed by M3. |

Raw evidence remains available after normalization. A later normalization or a user correction creates a new derived representation and relationship; it does not rewrite previous evidence, candidates, events, or posted Journals.

## 6. Source identity and duplicate-input design

### 6.1 Separate identity dimensions

| Dimension | Canonical basis | Explicit non-basis |
|---|---|---|
| Source intake identity | Server-issued `source_id`; organization scope; source type; immutable receipt/request provenance | Display label, merchant name, amount, date, or free text. |
| Artifact content identity | Organization scope plus SHA-256 of exact raw bytes | Filename, MIME label, storage path, or upload time. |
| SourceRecord identity | Organization scope plus stable provider/record locator when present, otherwise exact artifact identity plus canonical record locator/hash under a declared version | Amount/date/merchant text alone or fuzzy text similarity. |
| Candidate identity | Server-issued `candidate_id` and immutable candidate content hash | Accounting account, Journal, effect fingerprint, or confidence score. |
| M2 financial effect identity | Existing M2 versioned event/effect fingerprint | Any M3 source deduplication result. |

### 6.2 Deterministic duplicate outcomes

M3 must distinguish these results without deciding whether an accounting effect is a duplicate:

| Situation | M3 behavior |
|---|---|
| Same artifact delivered twice | Link the later Source intake to the canonical existing artifact; return the canonical artifact reference and preserve the later intake provenance. |
| Same source record delivered twice | Resolve to the canonical SourceRecord only when an exact stable record identity or an identical artifact-plus-record-locator identity proves equivalence. |
| Same content under different filenames | Treat as the same canonical artifact; preserve both names only as non-authoritative intake metadata. |
| Same filename with different content | Create distinct artifacts because byte hashes differ. |
| Different records with similar text | Preserve as distinct; do not collapse or infer duplication from free-text similarity, merchant name, amount, or date. |
| Corrected/replaced content | Create a new artifact/record/evidence and append explicit lineage; do not overwrite the original. |
| No stable record identity and a content collision is plausible | Preserve both records and route the duplicate classification for review if a product workflow needs a decision. |

The M3 duplicate result may prevent redundant ingestion storage, but it cannot create a `DUPLICATE` M2 posting result or prevent the existing M2 event/effect fingerprint, validation, authorization, T-01, Period, idempotency, and Ledger controls from running.

## 7. Immutability, availability, correction, and lineage

### 7.1 Append-only rules

- Source identity and receipt provenance are immutable once recorded.
- A canonical artifact's bytes, SHA-256 content hash, size, origin reference, and storage-content reference are immutable.
- A SourceRecord's raw-record hash, locator, source/artifact references, and raw-field reference are immutable.
- Evidence, normalization runs, and candidates are immutable once created.
- Corrected values create a new candidate or record; they do not mutate a predecessor.
- A source/evidence object referenced by a confirmed event or posted Journal must remain identifiable by its original IDs and hashes indefinitely.
- Raw evidence consumed by a posted Journal must not be destructively deleted by normal application behavior.

### 7.2 Minimal, separate source-lineage relationships

M3 uses source-lineage relationships only; it does not reuse Financial Event correction relations such as `REVERSES` or event `SUPERSEDES` semantics.

| Relationship | Valid direction | Meaning |
|---|---|---|
| `DERIVED_FROM` | Normalized candidate or normalization run → Evidence / SourceRecord | Declares immutable input provenance; it does not claim the interpretation is true. |
| `SUPERSEDES` | Later SourceRecord → prior SourceRecord | A known corrected representation of the same logical external record. Both records remain intact. |
| `REPLACES` | Later SourceArtifact → prior SourceArtifact | A supplied replacement artifact is known to replace earlier content. Both artifacts and their hashes remain intact. |

Containment is expressed by immutable references (`SourceArtifact → Source`, `SourceRecord → SourceArtifact`, `Evidence → SourceArtifact/SourceRecord`) and does not require a generic relationship table.

### 7.3 Unavailable original content

If original bytes become unavailable because of an approved retention, security, or infrastructure event, the system must append an `ArtifactAvailabilityRecord`. It records the affected artifact ID, organization, original content hash, MIME/type and known byte-size metadata, source locator/reference, lineage, availability state, reason, authorized actor/service, timestamp, and historical FinancialEvent/Journal references. It must not change the artifact, evidence, candidate, event, or Journal.

An unavailable artifact therefore remains traceable by identity and hash. Unavailability is not deletion or provenance rewriting. Only a trusted server authorization under approved retention/security policy may create the availability fact; it cannot erase historical content identity or references.

## 8. Organization isolation and source security boundary

Every Source, SourceArtifact, SourceRecord, Evidence, normalization run, candidate, duplicate-result record, lineage record, and availability record is organization-scoped. The server derives permitted organization scope from authenticated membership or service authority; a client-supplied `organization_id` is never sufficient authority.

Required controls:

- all reads, writes, and duplicate lookups are organization-scoped;
- cross-organization reference attachment, candidate creation, and result disclosure fail closed;
- storage content references are opaque and are not filesystem paths or direct authority tokens;
- filename and display metadata are non-authoritative;
- declared and detected MIME/content type are validated against an organization/configuration policy before content is accepted;
- byte-size limits are configuration policy, not hard-coded M3 accounting policy;
- no content is trusted as executable and no storage path is constructed from user input;
- access to raw content is separately authorized and audited.

Raw-evidence read, correction, replacement, and unavailability operations require a trusted server authorization decision and capability reference. They must not be inferred from client role claims, display role names, client-supplied organization IDs, or uploader identity alone.

Malware scanning architecture is not designed by this contract. Its availability and placement are a deployment/security dependency before production file upload is enabled.

## 9. Candidate integration with the accepted PAID_EXPENSE path

M3 does not change M2 request DTOs, fingerprints, mapping, T-01, authorization/SOD, Period authorization, Journal construction, posting transaction, or correction behavior.

```text
manual input / uploaded file / bank-record import
→ immutable Source + SourceArtifact + SourceRecord + Evidence
→ versioned normalized candidate observation
→ existing user confirmation and Financial Event creation boundary
→ ExpenseRecognized + PaymentMade
→ PaymentMade --FULFILLS--> ExpenseRecognized
→ existing M2 validation, trusted decisions, Period authorization
→ existing M2 Journal / Ledger
```

When a later authorized service creates M1 Financial Events from a candidate, it must attach compatible existing `SourceRef` and `EvidenceRef` values. The event's source tuple continues to be the input to M2's accepted fingerprint/source-claim model. M3 neither changes that tuple nor declares financial duplicate truth.

## 10. Required traceability

For an authorized organization, the forward and reverse chain must support:

```text
Source
→ SourceArtifact
→ SourceRecord
→ Evidence
→ NormalizedCandidateObservation
→ FinancialEvent
→ Journal
```

The trace must answer: where a fact originated, exact supporting content hash, normalization version/actor/input, confirmation or review evidence, later source supersession/replacement, and which posted Journal consumed the resulting events. A later source correction must append to this graph without changing historical Journal provenance.

## 11. Product / Security decision freeze and remaining engineering inputs

### 11.1 Recorded Product / Security decision freeze

| Decision | Recorded outcome |
|---|---|
| `M3-P01 — LINE scope / ownership` | `DEFER LINE INTEGRATION OUT OF M3`. The v0.2 LINE text sequence is superseded for milestone sequencing only. A later LINE adapter must enter through the M3 source/evidence boundary. |
| `M3-P02 — Evidence retention / unavailability` | Evidence/provenance supporting a confirmed FinancialEvent or posted Journal is immutable. Raw bytes may become unavailable only through approved retention/security policy; normal application behavior must not destructively delete raw content consumed by a posted Journal. |
| `M3-P03 — Raw evidence access and correction` | Raw read and correction/replacement require trusted server-authorized capabilities. Corrections create new immutable objects with source lineage; historical objects remain queryable where authorized. |
| `M3-P04 — Duplicate / ambiguous duplicate UX` | Exact duplicate identity reuses canonical source/evidence references without a second equivalent SourceRecord. Ambiguous similarity is `REVIEW_REQUIRED` (or equivalent non-authoritative review state) and never auto-merges. |
| `M3-P05 — MIME / size security policy` | MIME/type allowlist and maximum artifact size are server-controlled deployment/configuration policy. Unsupported input fails closed; filenames are non-authoritative, hashes are required, storage references are opaque, and content has no executable trust. |
| `M3-P06 — Candidate confirmation` | `NormalizedCandidateObservation` remains `OBSERVATION_ONLY`. `USER_CONFIRM` may confirm source/business facts and source linkage only; it never selects accounts or supplies Accounting, T-01, tax, Period, or Ledger authority. |

These decisions are recorded from the supplied Product / Security Decision Freeze. No approver identity, date, or additional evidence reference was supplied, so none is invented here.

### 11.2 Remaining decisions

No Product or Security policy decision remains open for this M3 contract boundary. The following are engineering-freeze and deployment/configuration inputs, not unresolved Product/Security outcomes:

| Input | Owner | Boundary |
|---|---|---|
| Acceptance of the proposed canonical record/manual-payload serialization versions | Engineering | Required before implementation so independently executed hashes are deterministic. |
| Concrete server capability keys, authorization-decision storage, and audit adapter | Engineering | Must implement the approved server-authority boundary without inferring client roles. |
| Initial MIME/type allowlist, size limit, and malware/content scanning placement | Security/Engineering deployment | Configuration/deployment values; they do not change financial-domain semantics. |

## 12. Freeze recommendation

The Product/Security decision prerequisites are resolved. The reused M1/M2 provenance and authority boundaries remain compatible, and no accepted M1/M2 financial semantics changed.

**Freeze status:** `COMPLETE / ACCEPTED` under `M3-SOURCE-EVIDENCE-FREEZE-v1.0`. M3 implementation is `READY / AUTHORIZED` under `M3-SOURCE-EVIDENCE-IMPLEMENTATION-AUTH-v1.0`; production deployment remains not authorized. The deployment/security configuration dependencies recorded above do not change this frozen domain contract.
