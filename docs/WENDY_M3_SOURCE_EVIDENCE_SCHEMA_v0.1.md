# Wendy M3 — Source & Evidence Schema v0.1

**Product:** Vault  
**Engine:** Wendy  
**Status:** `PRODUCT / SECURITY DECISIONS FROZEN — PENDING PRODUCT / ENGINEERING CONTRACT FREEZE; NO PRODUCTION CODE`  
**Companion:** `WENDY_M3_SOURCE_EVIDENCE_SPEC_v0.1.md`

## 1. Contract conventions

- This is a proposed M3 provider-neutral schema, not a database migration or API implementation.
- It reuses accepted M1 identities and `ContentHash` semantics. `content_hash` is a lowercase SHA-256 hash; no binary floating point is used for source amount observations.
- Every record has `organization_id`; the server derives access scope.
- All records below are append-only. A later correction, normalization, availability change, or replacement creates a later record.
- Fields described as opaque references are not filenames, file paths, or authority tokens.
- `status` fields whose lifecycle is not approved remain opaque, policy-owned strings. This schema does not invent status workflows.

```ts
type SourceRecordId = string // proposed opaque, stable M3 identity
type SourceSystemRef = string // proposed opaque provider/system identity
type OpaqueStorageRef = string
type OpaqueLocator = string
type TransformationProvenanceRef = string
type ContentCanonicalizationVersion = string

const MANUAL_INPUT_ARTIFACT_CANONICALIZATION_VERSION =
  "wendy.m3.manual-input-artifact-canonical/0.1.0"
const SOURCE_RECORD_CANONICALIZATION_VERSION =
  "wendy.m3.source-record-canonical/0.1.0"
```

For `MANUAL_INPUT_PAYLOAD` and `SourceRecord` canonical representations, the proposed version serializes UTF-8 canonical JSON with lexically sorted object keys, no undefined values, only finite safe-integer JSON numbers, and decimal quantities represented as strings. `content_hash` / `canonical_content_hash` is SHA-256 of those UTF-8 bytes. A file Artifact hash is SHA-256 of its original byte stream; parsing or MIME detection must not change it.

## 2. Identity and source input records

```ts
type M3SourceType =
  | "MANUAL_USER_INPUT"
  | "FILE_UPLOAD"
  | "BANK_RECORD_IMPORT"

type ArtifactType = "MANUAL_INPUT_PAYLOAD" | "FILE" | "BANK_IMPORT"

type ExistingEvidenceType =
  | "SOURCE_ARTIFACT"
  | "DOCUMENT"
  | "USER_CONFIRMATION"
  | "EXTERNAL_RECORD"

SourceArtifactLink {
  source_artifact_id: SourceArtifactId
  link_kind: "ORIGINATED" | "REDELIVERED"
  linked_at: datetime
}

Source {
  source_id: SourceId
  organization_id: OrganizationId
  source_type: M3SourceType
  source_system_ref?: SourceSystemRef
  original_external_reference?: string
  status: string

  received_at: datetime
  captured_at?: datetime
  ingestion_request_id: RequestId
  received_by: ActorRef
  idempotency_key: IdempotencyKey
  trace_id: TraceId

  artifact_links: SourceArtifactLink[]
  allowlisted_metadata?: object
  created_at: datetime
}

SourceArtifact {
  source_artifact_id: SourceArtifactId
  organization_id: OrganizationId
  source_id: SourceId
  artifact_type: ArtifactType

  original_name?: string
  declared_content_type?: string
  detected_content_type?: string
  content_hash: ContentHash // SHA-256 of exact raw bytes / canonical manual payload bytes
  byte_size?: positive_integer
  content_admission_policy_ref: string // trusted server MIME/size policy version/reference
  received_at: datetime
  storage_content_ref: OpaqueStorageRef
  created_at: datetime
  created_by: ActorRef
  immutable_provenance_ref: string
}

SourceRecord {
  source_record_id: SourceRecordId
  organization_id: OrganizationId
  source_id: SourceId
  source_artifact_id: SourceArtifactId

  source_system_ref?: SourceSystemRef
  record_locator?: OpaqueLocator
  external_record_identity?: string
  observed_at?: datetime
  source_timestamp?: datetime

  canonicalization_version: typeof SOURCE_RECORD_CANONICALIZATION_VERSION
  canonical_content_hash: ContentHash
  raw_record_content_ref: OpaqueStorageRef
  created_at: datetime
  immutable_provenance_ref: string
}

Evidence {
  evidence_id: EvidenceId
  organization_id: OrganizationId
  evidence_type: ExistingEvidenceType
  source_id: SourceId
  source_artifact_id: SourceArtifactId
  source_record_id?: SourceRecordId
  content_hash: ContentHash
  extraction_or_normalization_provenance_ref?: TransformationProvenanceRef
  created_at: datetime
  created_by: ActorRef
  immutable_provenance_ref: string
}
```

`SourceArtifact.source_id` identifies the first intake that established canonical content. A re-delivered Source adds an immutable `REDELIVERED` link to the same artifact; it does not replace content or falsify receipt history.

`SourceRecord.canonical_content_hash` is a hash under `canonicalization_version` of the exact raw record representation. It is not an M2 Financial Event or financial-effect fingerprint.

## 3. Derived normalization and candidate records

```ts
NormalizationRun {
  normalization_run_id: string
  organization_id: OrganizationId
  normalizer: ActorRef
  normalizer_version: string
  transformation_provenance_ref: TransformationProvenanceRef
  input_evidence_refs: EvidenceRef[]
  started_at: datetime
  completed_at: datetime
  immutable_output_hash: ContentHash
}

ObservedMoney {
  value: decimal_string
  currency: string
}

NormalizedCandidateObservation {
  candidate_id: CandidateId
  organization_id: OrganizationId
  candidate_version: positive_integer
  candidate_hash: ContentHash
  candidate_kind: "PAID_EXPENSE_OBSERVATION"
  authority: "OBSERVATION_ONLY"

  evidence_refs: EvidenceRef[]
  source_refs: SourceRef[]
  normalization_run_id: string
  normalization_version: string
  normalizer: ActorRef
  normalized_at: datetime
  transformation_provenance_ref: TransformationProvenanceRef

  observed_amount?: ObservedMoney
  observed_effective_date?: date
  observed_payment_date?: date
  observed_counterparty?: {
    display_name?: string
    external_reference?: string
  }
  observed_payment_source?: {
    display_label?: string
    external_reference?: string
  }
  semantic_category_proposal?: string
  unresolved_fields: string[]
  confidence?: number // metadata only; it grants no authority

  created_at: datetime
  immutable_provenance_ref: string
}
```

The candidate's observed money is not M1 `Money` and does not authorize THB posting. It is source observation only. Candidate confidence must be in the range 0 through 1 if present, but no confidence value may create a Financial Event, confirmation, account mapping, tax decision, Period authorization, or Journal.

## 4. Immutability and source-lineage records

```ts
type SourceLineageRelationType = "DERIVED_FROM" | "SUPERSEDES" | "REPLACES"

SourceLineageRelation {
  source_lineage_relation_id: string
  organization_id: OrganizationId
  relation_type: SourceLineageRelationType
  from_object_type: "NORMALIZATION_RUN" | "NORMALIZED_CANDIDATE" | "SOURCE_RECORD" | "SOURCE_ARTIFACT"
  from_object_id: string
  to_object_type: "EVIDENCE" | "SOURCE_RECORD" | "SOURCE_ARTIFACT"
  to_object_id: string
  reason_ref?: string
  created_at: datetime
  created_by: ActorRef
  immutable_provenance_ref: string
}

ArtifactAvailabilityRecord {
  artifact_availability_record_id: string
  organization_id: OrganizationId
  source_artifact_id: SourceArtifactId
  original_content_hash: ContentHash
  original_declared_content_type?: string
  original_detected_content_type?: string
  original_byte_size?: positive_integer
  original_source_locator_or_reference?: string
  availability: "AVAILABLE" | "UNAVAILABLE"
  authorized_at: datetime
  reason_ref: string
  authorized_by: ActorRef
  authorization_decision_ref: string
  authorization_capability_ref: string
  historical_financial_event_refs: {
    event_id: FinancialEventId
    event_version: positive_integer
  }[]
  historical_journal_entry_refs: string[]
  immutable_provenance_ref: string
}

SourceEvidenceAuthorizationDecision {
  authorization_decision_id: string
  organization_id: OrganizationId
  actor: ActorRef
  requested_capability_ref: string
  decision: "ALLOWED" | "DENIED"
  evaluated_at: datetime
  decision_provenance_ref: string
}
```

Constraints:

- `DERIVED_FROM` may only point from a normalization run/candidate to its immutable Evidence or SourceRecord input.
- `SUPERSEDES` may only point from a later SourceRecord to a prior SourceRecord in the same organization.
- `REPLACES` may only point from a later SourceArtifact to a prior SourceArtifact in the same organization.
- All source-lineage records are append-only and cannot use M1 Financial Event relationships. In particular, they cannot denote a Journal reversal or Financial Event correction.
- An availability record describes later access availability; it never changes an artifact's original hash, content reference, evidence, or provenance.
- An `UNAVAILABLE` availability record requires a trusted server `ALLOWED` authorization decision with a capability reference. It cannot be created by normal application deletion behavior when the artifact supports a posted Journal.
- Raw-content access, source correction, artifact replacement, and availability changes must consume a trusted server authorization decision. Client role claims, client organization IDs, display roles, and uploader identity are insufficient.

## 5. Deterministic content and duplicate-detection contracts

```ts
ArtifactDuplicateResult {
  organization_id: OrganizationId
  submitted_source_id: SourceId
  submitted_content_hash: ContentHash
  canonical_source_artifact_id: SourceArtifactId
  resolution: "NEW_ARTIFACT" | "DUPLICATE_ARTIFACT"
  evaluated_at: datetime
  provenance_ref: string
}

SourceRecordDuplicateResult {
  organization_id: OrganizationId
  submitted_source_id: SourceId
  submitted_source_artifact_id: SourceArtifactId
  submitted_record_locator?: OpaqueLocator
  submitted_external_record_identity?: string
  submitted_canonical_content_hash: ContentHash
  source_record_id?: SourceRecordId // present only when a new distinct record is created
  canonical_source_record_id?: SourceRecordId
  resolution:
    | "NEW_RECORD"
    | "DUPLICATE_RECORD"
    | "DISTINCT_RECORD"
    | "REVIEW_REQUIRED"
  identity_basis:
    | "STABLE_EXTERNAL_RECORD_IDENTITY"
    | "ARTIFACT_AND_RECORD_LOCATOR"
    | "NONE"
  evaluated_at: datetime
  provenance_ref: string
}
```

Constraints:

- Artifact equivalence is exactly `(organization_id, content_hash)`. Different filename, MIME label, upload time, or storage reference cannot make different canonical content.
- A source record can be `DUPLICATE_RECORD` only from a stable external-record identity within a stable source-system scope, or from the same canonical artifact plus the same record locator under the same canonicalization version.
- Similar values, text, merchant, amount, date, or a matching canonical record-content hash without the required stable basis must never automatically collapse records; `REVIEW_REQUIRED` preserves uncertainty.
- Every duplicate result records its identity basis and provenance.
- An exact `DUPLICATE_RECORD` reuses the existing canonical SourceRecord and must not create a second equivalent SourceRecord. `REVIEW_REQUIRED` is the mandatory disposition for ambiguous similarity.
- Neither duplicate result is an M2 event/effect duplicate determination or a posting disposition.

## 6. Candidate-to-event boundary

```ts
CandidateToFinancialEventHandoff {
  organization_id: OrganizationId
  candidate_id: CandidateId
  expected_candidate_version: positive_integer
  expected_candidate_hash: ContentHash
  source_refs: SourceRef[]
  evidence_refs: EvidenceRef[]
  requested_by: ActorRef
  request_id: RequestId
  trace_id: TraceId
}

CandidateSourceFactConfirmation {
  confirmation_id: string
  organization_id: OrganizationId
  candidate_id: CandidateId
  expected_candidate_version: positive_integer
  expected_candidate_hash: ContentHash
  confirmed_by: ActorRef // USER_CONFIRM source/business-fact confirmation only
  confirmed_at: datetime
  confirmation_evidence_ref: EvidenceRef // existing USER_CONFIRMATION evidence type
  confirmed_field_keys: (
    | "amount"
    | "currency"
    | "effective_or_business_date"
    | "payment_source_observation"
    | "counterparty_or_merchant_observation"
    | "semantic_category_proposal"
    | "source_evidence_linkage"
  )[]
  authority: "SOURCE_BUSINESS_FACTS_ONLY"
}
```

This handoff carries provenance into the existing M1/M2 event boundary. `CandidateSourceFactConfirmation` may confirm only the listed source/business fact fields. Neither object is a Financial Event creation command and neither has fields for account IDs, tax outcome, T-01 decision, accounting approval, Period result, JournalDraft, or Ledger output. Any later event creation must satisfy existing M1 confirmation and event invariants; any later posting must satisfy unchanged M2 controls.

## 7. Required schema invariants

1. Every referenced object has the same `organization_id`; server-side authorization is mandatory before any lookup or result disclosure.
2. `SourceArtifact.content_hash` identifies exact bytes; `byte_size`, when supplied, is positive and must match stored content.
3. Artifact admission evaluates a server-controlled MIME/content policy and maximum size through `content_admission_policy_ref`; unsupported content fails closed. Filenames and client paths are never trusted storage identities.
4. `original_name`, `display_label`, merchant text, and storage reference are never identity or authority fields.
5. SourceRecord `record_locator` and `external_record_identity` are opaque and non-empty when present.
6. Evidence's `content_hash` must equal its referenced SourceArtifact hash, or the declared canonical SourceRecord hash when the evidence type is an external record representation; the exact choice is recorded in immutable provenance.
7. Every candidate `SourceRef.content_hash` equals the referenced SourceArtifact `content_hash`; M2 continues to consume this accepted source tuple unchanged.
8. A candidate must have at least one SourceRef and one EvidenceRef and must identify one immutable normalization run/version.
9. Normalization cannot update raw SourceArtifact, SourceRecord, or Evidence fields.
10. Any correction/replacement requires a new object plus valid source-lineage relation and trusted server authorization; it cannot update a predecessor or historical Journal provenance.
11. Candidate records have no Ledger-write capability and cannot supply trusted M2 Authorization, T-01, mapping, accounting, tax, or Period decisions. `USER_CONFIRM` is limited to `CandidateSourceFactConfirmation`.
12. A future M2 event source tuple remains exactly the accepted M1 tuple. M3 must not change M2 fingerprint versions or financial-effect identity.

## 8. Frozen Product / Security alignment

- LINE integration is deferred from M3. A future adapter may use only the Source/Evidence/Candidate boundary.
- Evidence supporting a confirmed FinancialEvent or posted Journal is immutable; raw content cannot be destructively deleted by normal application behavior once consumed by a posted Journal.
- Exact duplicate identity reuses the canonical object; ambiguity is `REVIEW_REQUIRED` and does not auto-merge.
- MIME allowlists and size limits are trusted deployment/configuration policy, not financial-domain constants.
- `USER_CONFIRM` confirms source/business facts only and cannot create M2 authority.
