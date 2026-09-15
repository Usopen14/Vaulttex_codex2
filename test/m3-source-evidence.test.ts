import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  M3_CAPABILITIES,
  M3ContractError,
  canonicalManualArtifactBytes,
  canonicalJson,
  artifactCreationScope,
  correctionCreationScope,
  creationPayloadHash,
  evidenceCreationScope,
  newM3Uuid,
  sha256Canonical,
  sourceCreationScope,
  sourceRecordCreationScope,
  SqliteSourceEvidenceStore,
  type M3CanonicalValue,
  type SourceArtifact,
} from "../src/m3/index.ts";
import type { IdempotencyKey, RequestId, TraceId } from "../src/index.ts";
import { M3Runtime, admissionPolicy, m3Ids, m3OtherUser, m3User } from "./m3-fixtures.ts";

function request(): RequestId { return newM3Uuid() as RequestId; }
function trace(): TraceId { return newM3Uuid() as TraceId; }
function idempotency(): IdempotencyKey { return `m3-${newM3Uuid()}` as IdempotencyKey; }

function authorizationForArtifact(runtime: M3Runtime, operation: "READ_RAW_ARTIFACT" | "MARK_ARTIFACT_UNAVAILABLE", artifact: SourceArtifact): ReturnType<M3Runtime["targetAuthorization"]>["authorization_decision_id"] {
  return runtime.targetAuthorization({ operation, target: { target_type: "SOURCE_ARTIFACT", target_id: artifact.source_artifact_id, target_content_identity: artifact.content_hash } }).authorization_decision_id;
}

function authorizationForRecord(runtime: M3Runtime, record: { readonly source_record_id: string; readonly canonical_content_hash: ReturnType<typeof sha256Canonical>["hash"] }): ReturnType<M3Runtime["targetAuthorization"]>["authorization_decision_id"] {
  return runtime.targetAuthorization({ operation: "CORRECT_SOURCE_RECORD", target: { target_type: "SOURCE_RECORD", target_id: record.source_record_id, target_content_identity: record.canonical_content_hash } }).authorization_decision_id;
}

function createSource(runtime: M3Runtime, overrides: Partial<Parameters<M3Runtime["service"]["createSource"]>[0]> = {}) {
  const command: Parameters<M3Runtime["service"]["createSource"]>[0] = {
    organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: newM3Uuid(),
    source_type: "MANUAL_USER_INPUT", source_system_ref: "manual-client", original_external_reference: "receipt-001",
    received_at: m3Ids.timestamp, ingestion_request_id: request(), idempotency_key: idempotency(), trace_id: trace(),
    ...overrides,
  };
  const intent = runtime.creationIntent({ operation: "CREATE_SOURCE", proposed_target_resource_type: "SOURCE", creation_payload_hash: creationPayloadHash(sourceCreationScope(command)), parent_resource_identity: null, content_hash: null });
  const authorization = runtime.targetAuthorization({ operation: "CREATE_SOURCE", creation_intent_id: intent.creation_intent_id });
  return runtime.service.createSource({ ...command, authorization_decision_id: authorization.authorization_decision_id, creation_intent_id: intent.creation_intent_id });
}

function ingest(runtime: M3Runtime, source_id: ReturnType<typeof createSource>["source_id"], payload: M3CanonicalValue = { amount: "3500.00", currency: "THB" }) {
  const bytes = canonicalManualArtifactBytes(payload);
  const command: Parameters<M3Runtime["service"]["ingestArtifact"]>[0] = {
    organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: newM3Uuid(), source_id,
    artifact_type: "MANUAL_INPUT_PAYLOAD", bytes, original_name: "receipt.json", declared_content_type: "application/json",
    detected_content_type: "application/json", admission_policy: admissionPolicy, received_at: m3Ids.timestamp,
  };
  const content = sha256Canonical(payload).hash;
  const intent = runtime.creationIntent({ operation: "CREATE_ARTIFACT", proposed_target_resource_type: "SOURCE_ARTIFACT", creation_payload_hash: creationPayloadHash(artifactCreationScope(command, content)), parent_resource_identity: source_id, content_hash: content });
  const authorization = runtime.targetAuthorization({ operation: "CREATE_ARTIFACT", creation_intent_id: intent.creation_intent_id });
  return runtime.service.ingestArtifact({ ...command, authorization_decision_id: authorization.authorization_decision_id, creation_intent_id: intent.creation_intent_id });
}

function registerRecord(runtime: M3Runtime, source_id: ReturnType<typeof createSource>["source_id"], source_artifact_id: SourceArtifact["source_artifact_id"], external = `bank-record-${newM3Uuid()}`, locator = `row:${newM3Uuid()}`) {
  const command: Parameters<M3Runtime["service"]["registerSourceRecord"]>[0] = {
    organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: newM3Uuid(), source_id, source_artifact_id,
    source_system_ref: "bank-import-v1", external_record_identity: external, record_locator: locator,
    raw_record: { amount: "3500.00", currency: "THB", merchant: "Coffee Shop" }, created_at: m3Ids.timestamp,
  };
  const content = sha256Canonical(command.raw_record).hash;
  const intent = runtime.creationIntent({ operation: "CREATE_SOURCE_RECORD", proposed_target_resource_type: "SOURCE_RECORD", creation_payload_hash: creationPayloadHash(sourceRecordCreationScope(command, content)), parent_resource_identity: source_artifact_id, content_hash: content });
  const authorization = runtime.targetAuthorization({ operation: "CREATE_SOURCE_RECORD", creation_intent_id: intent.creation_intent_id });
  return runtime.service.registerSourceRecord({ ...command, authorization_decision_id: authorization.authorization_decision_id, creation_intent_id: intent.creation_intent_id });
}

function evidenceAndCandidate(runtime: M3Runtime) {
  const source = createSource(runtime);
  const artifactResult = ingest(runtime, source.source_id);
  const recordResult = registerRecord(runtime, source.source_id, artifactResult.artifact.source_artifact_id);
  const record = recordResult.record!;
  const evidenceCommand = {
    organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: newM3Uuid(),
    evidence_type: "EXTERNAL_RECORD", source_id: source.source_id, source_artifact_id: artifactResult.artifact.source_artifact_id,
    source_record_id: record.source_record_id, created_at: m3Ids.timestamp,
  } as const;
  const evidenceIntent = runtime.creationIntent({ operation: "CREATE_EVIDENCE", proposed_target_resource_type: "EVIDENCE", creation_payload_hash: creationPayloadHash(evidenceCreationScope(evidenceCommand, record.canonical_content_hash)), parent_resource_identity: artifactResult.artifact.source_artifact_id, content_hash: record.canonical_content_hash });
  const evidenceAuthorization = runtime.targetAuthorization({ operation: "CREATE_EVIDENCE", creation_intent_id: evidenceIntent.creation_intent_id });
  const evidence = runtime.service.createEvidence({ ...evidenceCommand, authorization_decision_id: evidenceAuthorization.authorization_decision_id, creation_intent_id: evidenceIntent.creation_intent_id });
  const candidate = runtime.service.normalizeCandidate({
    organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.normalize),
    evidence_ids: [evidence.evidence_id], normalization_version: "normalizer/1.0.0", transformation_provenance_ref: "normalizer-run:1",
    started_at: m3Ids.timestamp, completed_at: m3Ids.laterTimestamp, observed_amount: { value: "3500.00", currency: "THB" },
    observed_effective_date: "2026-09-15", observed_counterparty: { display_name: "Coffee Shop" },
    observed_payment_source: { display_label: "Operating bank" }, semantic_category_proposal: "GENERAL", unresolved_fields: [], confidence: 0.9,
  });
  return { source, artifact: artifactResult.artifact, record, evidence, candidate };
}

function correctSourceRecord(runtime: M3Runtime, command: Omit<Parameters<M3Runtime["service"]["correctSourceRecord"]>[0], "authorization_decision_id" | "creation_intent_id">) {
  const artifactHash = sha256Canonical(JSON.parse(new TextDecoder().decode(command.artifact.bytes)) as M3CanonicalValue).hash;
  const recordHash = sha256Canonical(command.record.raw_record).hash;
  const intent = runtime.creationIntent({ operation: "CORRECT_SOURCE_RECORD", proposed_target_resource_type: "SOURCE_RECORD", creation_payload_hash: creationPayloadHash(correctionCreationScope({ ...command, authorization_decision_id: newM3Uuid() }, artifactHash, recordHash)), parent_resource_identity: command.previous_source_record_id, content_hash: artifactHash });
  const authorization = runtime.targetAuthorization({ operation: "CORRECT_SOURCE_RECORD", creation_intent_id: intent.creation_intent_id });
  return runtime.service.correctSourceRecord({ ...command, authorization_decision_id: authorization.authorization_decision_id, creation_intent_id: intent.creation_intent_id });
}

test("M3-ORG-01, M3-ORG-02: server authority and every reference remain organization-scoped", () => {
  const runtime = new M3Runtime();
  try {
    const fixture = evidenceAndCandidate(runtime);
    const otherAuthorization = runtime.authorization(M3_CAPABILITIES.trace, m3Ids.otherOrganization, m3OtherUser);
    assert.throws(() => runtime.service.traceCandidate({ organization_id: m3Ids.otherOrganization, actor: m3OtherUser, authorization_decision_id: otherAuthorization, candidate_id: fixture.candidate.candidate_id }), (error: unknown) => error instanceof M3ContractError && error.code === "M3_AUTHORIZATION_DENIED");
    const otherIngest = runtime.authorization(M3_CAPABILITIES.ingest, m3Ids.otherOrganization, m3OtherUser);
    assert.throws(() => runtime.service.createEvidence({ organization_id: m3Ids.otherOrganization, actor: m3OtherUser, authorization_decision_id: otherIngest, evidence_type: "SOURCE_ARTIFACT", source_id: fixture.source.source_id, source_artifact_id: fixture.artifact.source_artifact_id, created_at: m3Ids.timestamp }), /authorized organization scope/);
    assert.equal(runtime.store.findArtifactByHash(m3Ids.otherOrganization, fixture.artifact.content_hash), undefined);
  } finally { runtime.close(); }
});

test("M3-IMM-01 through M3-IMM-04: database constraints prohibit rewrites and destructive evidence deletion", () => {
  const runtime = new M3Runtime();
  try {
    const fixture = evidenceAndCandidate(runtime);
    const db = runtime.store.databaseForInvariantTestOnly();
    assert.throws(() => db.prepare("UPDATE wendy_m3_source SET record_json = record_json WHERE source_id = ?").run(fixture.source.source_id), /immutable history/);
    assert.throws(() => db.prepare("UPDATE wendy_m3_artifact SET content_hash = ? WHERE source_artifact_id = ?").run("0".repeat(64), fixture.artifact.source_artifact_id), /immutable history/);
    assert.throws(() => db.prepare("UPDATE wendy_m3_source_record SET record_locator = 'forged' WHERE source_record_id = ?").run(fixture.record.source_record_id), /immutable history/);
    assert.throws(() => db.prepare("DELETE FROM wendy_m3_artifact_content WHERE source_artifact_id = ?").run(fixture.artifact.source_artifact_id), /immutable history/);
    assert.equal(runtime.store.getArtifact(m3Ids.organization, fixture.artifact.source_artifact_id)?.content_hash, fixture.artifact.content_hash);
  } finally { runtime.close(); }
});

test("M3-HASH-01, M3-DEDUP-01, M3-DEDUP-02: byte-hash canonical content identity ignores filename but not content", () => {
  const runtime = new M3Runtime();
  try {
    const one = createSource(runtime);
    const first = ingest(runtime, one.source_id, { z: "3.00", a: "THB" });
    const two = createSource(runtime);
    const second = ingest(runtime, two.source_id, { a: "THB", z: "3.00" });
    assert.equal(second.duplicate.resolution, "DUPLICATE_ARTIFACT");
    assert.equal(first.artifact.source_artifact_id, second.artifact.source_artifact_id);
    const three = createSource(runtime);
    const changed = ingest(runtime, three.source_id, { a: "THB", z: "4.00" });
    assert.equal(changed.duplicate.resolution, "NEW_ARTIFACT");
    assert.notEqual(first.artifact.content_hash, changed.artifact.content_hash);
    assert.equal(canonicalJson({ z: "3.00", a: "THB" }), canonicalJson({ a: "THB", z: "3.00" }));
    assert.equal(sha256Canonical({ z: "3.00", a: "THB" }).hash, sha256Canonical({ a: "THB", z: "3.00" }).hash);
  } finally { runtime.close(); }
});

test("M3-DEDUP-03 through M3-DEDUP-05: only exact record identities deduplicate; similarity routes review", () => {
  const runtime = new M3Runtime();
  try {
    const source = createSource(runtime);
    const artifact = ingest(runtime, source.source_id).artifact;
    const first = registerRecord(runtime, source.source_id, artifact.source_artifact_id, "stable-1");
    const duplicate = registerRecord(runtime, source.source_id, artifact.source_artifact_id, "stable-1");
    assert.equal(duplicate.duplicate.resolution, "DUPLICATE_RECORD");
    assert.equal(duplicate.record?.source_record_id, first.record?.source_record_id);
    const ambiguousCommand: Parameters<M3Runtime["service"]["registerSourceRecord"]>[0] = { organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: newM3Uuid(), source_id: source.source_id, source_artifact_id: artifact.source_artifact_id, raw_record: { merchant: "Coffee Shop", amount: "3500.00", confidence: "0.9" }, created_at: m3Ids.timestamp };
    const ambiguousContent = sha256Canonical(ambiguousCommand.raw_record).hash;
    const ambiguousIntent = runtime.creationIntent({ operation: "CREATE_SOURCE_RECORD", proposed_target_resource_type: "SOURCE_RECORD", creation_payload_hash: creationPayloadHash(sourceRecordCreationScope(ambiguousCommand, ambiguousContent)), parent_resource_identity: artifact.source_artifact_id, content_hash: ambiguousContent });
    const ambiguousAuthorization = runtime.targetAuthorization({ operation: "CREATE_SOURCE_RECORD", creation_intent_id: ambiguousIntent.creation_intent_id });
    const ambiguous = runtime.service.registerSourceRecord({ ...ambiguousCommand, authorization_decision_id: ambiguousAuthorization.authorization_decision_id, creation_intent_id: ambiguousIntent.creation_intent_id });
    assert.equal(ambiguous.duplicate.resolution, "REVIEW_REQUIRED");
    const normalized = evidenceAndCandidate(runtime);
    assert.equal(normalized.candidate.authority, "OBSERVATION_ONLY");
    assert.equal(first.duplicate.resolution, "NEW_RECORD");
  } finally { runtime.close(); }
});

test("M3-RAW-01, M3-NORM-01, M3-NORM-02: normalized candidates are derived immutable observations", () => {
  const runtime = new M3Runtime();
  try {
    const fixture = evidenceAndCandidate(runtime);
    const raw = runtime.service.readRawArtifact({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: authorizationForArtifact(runtime, "READ_RAW_ARTIFACT", fixture.artifact), source_artifact_id: fixture.artifact.source_artifact_id });
    assert.equal(new TextDecoder().decode(raw), "{\"amount\":\"3500.00\",\"currency\":\"THB\"}");
    assert.equal(fixture.candidate.source_refs[0]?.content_hash, fixture.artifact.content_hash);
    assert.equal(fixture.candidate.evidence_refs[0]?.evidence_id, fixture.evidence.evidence_id);
    assert.equal(fixture.candidate.normalizer.actor_id, m3User.actor_id);
    const second = runtime.service.normalizeCandidate({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.normalize), evidence_ids: [fixture.evidence.evidence_id], normalization_version: "normalizer/2.0.0", transformation_provenance_ref: "normalizer-run:2", started_at: m3Ids.timestamp, completed_at: m3Ids.laterTimestamp, observed_amount: { value: "3500.00", currency: "THB" }, unresolved_fields: ["semantic_category"], confidence: 0.2 });
    assert.notEqual(second.candidate_id, fixture.candidate.candidate_id);
    assert.equal(runtime.store.readArtifactBytes(m3Ids.organization, fixture.artifact.source_artifact_id)?.byteLength, raw.byteLength);
  } finally { runtime.close(); }
});

test("M3-LINEAGE-01 through M3-LINEAGE-03: correction/replacement/unavailability append lineage without rewriting history", () => {
  const runtime = new M3Runtime();
  try {
    const fixture = evidenceAndCandidate(runtime);
    runtime.service.linkCandidateToFinancialEvent({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.trace), candidate_id: fixture.candidate.candidate_id, event: { event_id: newM3Uuid() as never, event_version: 1, event_type: "ExpenseRecognized" } });
    const event = runtime.store.traceCandidate(m3Ids.organization, fixture.candidate.candidate_id)!.events[0]!;
    runtime.service.linkFinancialEventToJournal({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.trace), event, journal: { journal_entry_id: "journal-m3-trace-1" } });
    const corrected = correctSourceRecord(runtime, {
      organization_id: m3Ids.organization, actor: m3User, previous_source_record_id: fixture.record.source_record_id,
      replacement_source: { source_type: "MANUAL_USER_INPUT", source_system_ref: "bank-import-v1", original_external_reference: "replacement-001", received_at: m3Ids.laterTimestamp, ingestion_request_id: request(), idempotency_key: idempotency(), trace_id: trace() },
      artifact: { artifact_type: "MANUAL_INPUT_PAYLOAD", bytes: canonicalManualArtifactBytes({ amount: "3600.00", currency: "THB" }), original_name: "replacement.json", declared_content_type: "application/json", detected_content_type: "application/json", admission_policy: admissionPolicy, received_at: m3Ids.laterTimestamp },
      record: { source_system_ref: "bank-import-v1", external_record_identity: "bank-record-001", record_locator: "row:1", raw_record: { amount: "3600.00", currency: "THB", merchant: "Coffee Shop" }, created_at: m3Ids.laterTimestamp },
    });
    assert.notEqual(corrected.artifact.content_hash, fixture.artifact.content_hash);
    const unavailable = runtime.service.markArtifactUnavailable({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: authorizationForArtifact(runtime, "MARK_ARTIFACT_UNAVAILABLE", fixture.artifact), source_artifact_id: fixture.artifact.source_artifact_id, reason_ref: "retention/security-case:1", authorized_at: m3Ids.laterTimestamp });
    assert.equal(unavailable.original_content_hash, fixture.artifact.content_hash);
    assert.deepEqual(unavailable.historical_source_record_ids, [fixture.record.source_record_id]);
    assert.deepEqual(unavailable.historical_evidence_ids, [fixture.evidence.evidence_id]);
    assert.deepEqual(unavailable.historical_journal_entry_refs, ["journal-m3-trace-1"]);
    assert.throws(() => runtime.service.readRawArtifact({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: authorizationForArtifact(runtime, "READ_RAW_ARTIFACT", fixture.artifact), source_artifact_id: fixture.artifact.source_artifact_id }), /unavailable/);
    assert.equal(runtime.store.getArtifact(m3Ids.organization, fixture.artifact.source_artifact_id)?.content_hash, fixture.artifact.content_hash);
  } finally { runtime.close(); }
});

test("M3-SEC-01 and M3-SEC-02: admission and raw/correction authority fail closed", () => {
  const runtime = new M3Runtime();
  try {
    const source = createSource(runtime);
    const authorization_decision_id = runtime.authorization(M3_CAPABILITIES.ingest);
    assert.throws(() => runtime.service.ingestArtifact({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id, source_id: source.source_id, artifact_type: "MANUAL_INPUT_PAYLOAD", bytes: canonicalManualArtifactBytes({ ok: true }), original_name: "../unsafe.json", declared_content_type: "application/json", detected_content_type: "application/json", admission_policy: admissionPolicy, received_at: m3Ids.timestamp }), (error: unknown) => error instanceof M3ContractError && error.code === "M3_ADMISSION_REJECTED");
    const artifact = ingest(runtime, source.source_id).artifact;
    assert.throws(() => runtime.service.ingestArtifact({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.ingest), source_id: source.source_id, artifact_type: "MANUAL_INPUT_PAYLOAD", bytes: canonicalManualArtifactBytes({ ok: true }), declared_content_type: "text/plain", detected_content_type: "application/json", admission_policy: admissionPolicy, received_at: m3Ids.timestamp }), /content types differ/);
    const fileSource = createSource(runtime, { source_type: "FILE_UPLOAD", original_external_reference: "file-1" });
    assert.throws(() => runtime.service.ingestArtifact({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.ingest), source_id: fileSource.source_id, artifact_type: "FILE", bytes: new Uint8Array(admissionPolicy.maximum_artifact_byte_size + 1), original_name: "too-large.txt", declared_content_type: "text/plain", detected_content_type: "text/plain", admission_policy: admissionPolicy, received_at: m3Ids.timestamp }), /byte size/);
    assert.throws(() => runtime.service.readRawArtifact({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: newM3Uuid(), source_artifact_id: artifact.source_artifact_id }), (error: unknown) => error instanceof M3ContractError && error.code === "M3_AUTHORIZATION_DENIED");
  } finally { runtime.close(); }
});

test("M3-HANDOFF-01 through M3-HANDOFF-03 and M3-AUTH-01/02: handoff is source-facts-only and cannot write financial authority", () => {
  const runtime = new M3Runtime();
  try {
    const fixture = evidenceAndCandidate(runtime);
    const base = { organization_id: m3Ids.organization, actor: m3User, candidate_id: fixture.candidate.candidate_id, expected_candidate_version: fixture.candidate.candidate_version, expected_candidate_hash: fixture.candidate.candidate_hash };
    assert.throws(() => runtime.service.normalizeCandidate({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.normalize), evidence_ids: [fixture.evidence.evidence_id], normalization_version: "normalizer/forged", transformation_provenance_ref: "forged", started_at: m3Ids.timestamp, completed_at: m3Ids.laterTimestamp, unresolved_fields: [], account_id: "forged-account" } as never), /unsupported authority-bearing/);
    assert.throws(() => runtime.service.normalizeCandidate({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.normalize), evidence_ids: [fixture.evidence.evidence_id], normalization_version: "normalizer/forged-nested", transformation_provenance_ref: "forged", started_at: m3Ids.timestamp, completed_at: m3Ids.laterTimestamp, unresolved_fields: [], observed_payment_source: { display_label: "Observed bank", account_id: "forged-account" } } as never), /unsupported authority-bearing/);
    assert.throws(() => runtime.service.createCandidateHandoff({ ...base, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.confirm), request_id: request(), trace_id: trace() }), /USER_CONFIRM/);
    assert.throws(() => runtime.service.confirmCandidateSourceFacts({ ...base, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.confirm), confirmed_at: m3Ids.laterTimestamp, confirmed_field_keys: ["account_id"] as never, confirmation_scope_version: "m3-source-confirm/1.0.0" }), /non-source\/business authority/);
    const confirmation = runtime.service.confirmCandidateSourceFacts({ ...base, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.confirm), confirmed_at: m3Ids.laterTimestamp, confirmed_field_keys: ["amount", "currency", "source_evidence_linkage"], confirmation_scope_version: "m3-source-confirm/1.0.0" });
    assert.equal(confirmation.authority, "SOURCE_BUSINESS_FACTS_ONLY");
    const handoff = runtime.service.createCandidateHandoff({ ...base, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.confirm), request_id: request(), trace_id: trace() });
    assert.deepEqual(handoff.source_refs, fixture.candidate.source_refs);
    assert.deepEqual(handoff.evidence_refs, fixture.candidate.evidence_refs);
    assert.equal("journal_entry_id" in handoff, false);
  } finally { runtime.close(); }
});

test("M3-TRACE-01, M3-TRACE-02, M3-M2-01: trace is reversible and source tuple stays M1/M2-compatible", () => {
  const runtime = new M3Runtime();
  try {
    const fixture = evidenceAndCandidate(runtime);
    const base = { organization_id: m3Ids.organization, actor: m3User, candidate_id: fixture.candidate.candidate_id, expected_candidate_version: fixture.candidate.candidate_version, expected_candidate_hash: fixture.candidate.candidate_hash };
    runtime.service.confirmCandidateSourceFacts({ ...base, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.confirm), confirmed_at: m3Ids.laterTimestamp, confirmed_field_keys: ["amount", "source_evidence_linkage"], confirmation_scope_version: "m3-source-confirm/1.0.0" });
    const expense = { event_id: newM3Uuid() as never, event_version: 1, event_type: "ExpenseRecognized" as const };
    const payment = { event_id: newM3Uuid() as never, event_version: 1, event_type: "PaymentMade" as const };
    for (const event of [expense, payment]) {
      runtime.service.linkCandidateToFinancialEvent({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.trace), candidate_id: fixture.candidate.candidate_id, event });
      runtime.service.linkFinancialEventToJournal({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.trace), event, journal: { journal_entry_id: "journal-m3-trace-final" } });
    }
    const traceResult = runtime.service.traceCandidate({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.trace), candidate_id: fixture.candidate.candidate_id });
    assert.equal(traceResult.sources[0]?.source_id, fixture.source.source_id);
    assert.equal(traceResult.artifacts[0]?.content_hash, fixture.artifact.content_hash);
    assert.equal(traceResult.source_records[0]?.canonical_content_hash, fixture.record.canonical_content_hash);
    assert.equal(traceResult.confirmations.length, 1);
    assert.deepEqual(traceResult.journals.map((item) => item.journal_entry_id), ["journal-m3-trace-final", "journal-m3-trace-final"]);
    const reverse = runtime.service.traceJournal({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: runtime.authorization(M3_CAPABILITIES.trace), journal_entry_id: "journal-m3-trace-final" });
    assert.equal(reverse[0]?.candidate.candidate_id, fixture.candidate.candidate_id);
    const sourceTuple = fixture.candidate.source_refs[0]!;
    assert.deepEqual(Object.keys(sourceTuple).sort(), ["content_hash", "source_artifact_id", "source_id", "source_record_id"]);
  } finally { runtime.close(); }
});

test("M3-SCOPE-01: generic M3 surface contains no channel adapter or Ledger mutation entrypoint", () => {
  const runtime = new M3Runtime();
  try {
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(runtime.service));
    assert.equal(names.some((name) => /line|ledger|post|create.*journal|tax|period|account/i.test(name)), false);
  } finally { runtime.close(); }
});

test("M3 persistence serializes independent SQLite handles without duplicating canonical artifacts", () => {
  const directory = mkdtempSync(join(tmpdir(), "wendy-m3-"));
  const database = join(directory, "source-evidence.sqlite");
  const one = new M3Runtime(database);
  const two = new M3Runtime(database);
  try {
    const firstSource = createSource(one);
    const first = ingest(one, firstSource.source_id);
    const secondSource = createSource(two);
    const second = ingest(two, secondSource.source_id);
    assert.equal(second.duplicate.resolution, "DUPLICATE_ARTIFACT");
    assert.equal(second.artifact.source_artifact_id, first.artifact.source_artifact_id);
  } finally {
    one.close(); two.close(); rmSync(directory, { recursive: true, force: true });
  }
});

test("M3 persistence schema initializes transactionally and refuses newer incompatible versions", () => {
  const directory = mkdtempSync(join(tmpdir(), "wendy-m3-schema-"));
  const database = join(directory, "source-evidence.sqlite");
  try {
    const initial = new SqliteSourceEvidenceStore(database);
    assert.equal(initial.schemaVersion(), 2);
    initial.close();
    const direct = new DatabaseSync(database);
    direct.exec("DROP TABLE wendy_m3_authorization_consumption; DROP TABLE wendy_m3_authorization_lifecycle_fact; DROP TABLE wendy_m3_target_authorization; DROP TABLE wendy_m3_creation_intent; DROP TABLE wendy_m3_authorization_denial_audit;");
    direct.prepare("UPDATE wendy_m3_schema_metadata SET schema_version = 1 WHERE schema_key = 'wendy_m3'").run();
    direct.close();
    const migrated = new SqliteSourceEvidenceStore(database);
    assert.equal(migrated.schemaVersion(), 2);
    assert.notEqual(migrated.databaseForInvariantTestOnly().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'wendy_m3_authorization_consumption'").get(), undefined);
    migrated.close();
    const newer = new DatabaseSync(database);
    newer.prepare("UPDATE wendy_m3_schema_metadata SET schema_version = 3 WHERE schema_key = 'wendy_m3'").run();
    newer.close();
    assert.throws(() => new SqliteSourceEvidenceStore(database), (error: unknown) => error instanceof M3ContractError && error.code === "M3_SCHEMA_VERSION_UNSUPPORTED");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
