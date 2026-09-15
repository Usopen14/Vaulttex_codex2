import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION,
  M3ContractError,
  artifactCreationScope,
  canonicalManualArtifactBytes,
  creationIntentIntegrityHash,
  creationPayloadHash,
  correctionCreationScope,
  newM3Uuid,
  sha256Bytes,
  sha256Canonical,
  sourceCreationScope,
  sourceRecordCreationScope,
  targetBoundAuthorizationHash,
  type M3TargetBoundAuthorizationDecision,
  type SourceArtifact,
  type TrustedClock,
} from "../src/m3/index.ts";
import type { IdempotencyKey, RequestId, TraceId } from "../src/index.ts";
import { M3Runtime, admissionPolicy, m3Ids, m3Issuer, m3OtherUser, m3User } from "./m3-fixtures.ts";

function request(): RequestId { return newM3Uuid() as RequestId; }
function trace(): TraceId { return newM3Uuid() as TraceId; }
function key(): IdempotencyKey { return `m3-auth-lc-${newM3Uuid()}` as IdempotencyKey; }

function denied(work: () => unknown): void {
  assert.throws(work, (error: unknown) => error instanceof M3ContractError && error.code === "M3_AUTHORIZATION_DENIED");
}

function fixedClock(timestamp = "2026-09-15T03:30:00.000Z"): TrustedClock {
  return Object.freeze({ now: () => timestamp as never });
}

function createSource(runtime: M3Runtime) {
  const command = {
    organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: newM3Uuid(),
    source_type: "MANUAL_USER_INPUT" as const, source_system_ref: "auth-lc", original_external_reference: `receipt-${newM3Uuid()}`,
    received_at: m3Ids.timestamp, ingestion_request_id: request(), idempotency_key: key(), trace_id: trace(),
  };
  const intent = runtime.creationIntent({
    operation: "CREATE_SOURCE", proposed_target_resource_type: "SOURCE", creation_payload_hash: creationPayloadHash(sourceCreationScope(command)),
    parent_resource_identity: null, content_hash: null,
  });
  const decision = runtime.targetAuthorization({ operation: "CREATE_SOURCE", creation_intent_id: intent.creation_intent_id });
  return runtime.service.createSource({ ...command, authorization_decision_id: decision.authorization_decision_id, creation_intent_id: intent.creation_intent_id });
}

function createArtifact(runtime: M3Runtime, amount: string = "100.00") {
  const source = createSource(runtime);
  const bytes = canonicalManualArtifactBytes({ amount, currency: "THB" });
  const content_hash = sha256Bytes(bytes);
  const command = {
    organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: newM3Uuid(), source_id: source.source_id,
    artifact_type: "MANUAL_INPUT_PAYLOAD" as const, bytes, original_name: "auth-lc.json", declared_content_type: "application/json",
    detected_content_type: "application/json", admission_policy: admissionPolicy, received_at: m3Ids.timestamp,
  };
  const intent = runtime.creationIntent({
    operation: "CREATE_ARTIFACT", proposed_target_resource_type: "SOURCE_ARTIFACT", creation_payload_hash: creationPayloadHash(artifactCreationScope(command, content_hash)),
    parent_resource_identity: source.source_id, content_hash,
  });
  const decision = runtime.targetAuthorization({ operation: "CREATE_ARTIFACT", creation_intent_id: intent.creation_intent_id });
  const artifact = runtime.service.ingestArtifact({ ...command, authorization_decision_id: decision.authorization_decision_id, creation_intent_id: intent.creation_intent_id }).artifact;
  return { source, artifact };
}

function createSourceRecord(runtime: M3Runtime, source_id: ReturnType<typeof createSource>["source_id"], source_artifact_id: SourceArtifact["source_artifact_id"]) {
  const command = {
    organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: newM3Uuid(), source_id, source_artifact_id,
    source_system_ref: "auth-lc", external_record_identity: `record-${newM3Uuid()}`, record_locator: `row:${newM3Uuid()}`,
    raw_record: { amount: "100.00", currency: "THB" }, created_at: m3Ids.timestamp,
  };
  const content_hash = sha256Canonical(command.raw_record).hash;
  const intent = runtime.creationIntent({ operation: "CREATE_SOURCE_RECORD", proposed_target_resource_type: "SOURCE_RECORD", creation_payload_hash: creationPayloadHash(sourceRecordCreationScope(command, content_hash)), parent_resource_identity: source_artifact_id, content_hash });
  const decision = runtime.targetAuthorization({ operation: "CREATE_SOURCE_RECORD", creation_intent_id: intent.creation_intent_id });
  return runtime.service.registerSourceRecord({ ...command, authorization_decision_id: decision.authorization_decision_id, creation_intent_id: intent.creation_intent_id }).record!;
}

function decisionForArtifact(runtime: M3Runtime, operation: "READ_RAW_ARTIFACT" | "MARK_ARTIFACT_UNAVAILABLE", artifact: SourceArtifact, expires_at: M3TargetBoundAuthorizationDecision["expires_at"] = null) {
  return runtime.targetAuthorization({ operation, expires_at, target: { target_type: "SOURCE_ARTIFACT", target_id: artifact.source_artifact_id, target_content_identity: artifact.content_hash } });
}

function raw(runtime: M3Runtime, artifact: SourceArtifact, authorization_decision_id: M3TargetBoundAuthorizationDecision["authorization_decision_id"]) {
  return runtime.service.readRawArtifact({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id, source_artifact_id: artifact.source_artifact_id, request_id: request(), trace_id: trace() });
}

function revoke(runtime: M3Runtime, id: M3TargetBoundAuthorizationDecision["authorization_decision_id"]) {
  return runtime.service.appendAuthorizationLifecycleFact({
    organization_id: m3Ids.organization, affected_authorization_decision_id: id, action: "REVOKED", replacement_authorization_decision_id: null,
    occurred_at: m3Ids.laterTimestamp, authority: m3Issuer,
    authority_evidence_ref: `membership:${m3Ids.organization}:${m3Issuer.actor_id}`, reason_ref: "security:revoked",
  });
}

test("M3-AUTH-LC-01: exact existing target succeeds and CreationIntent binds one proposed creation", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const decision = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact);
    assert.equal(new TextDecoder().decode(raw(runtime, artifact, decision.authorization_decision_id)), "{\"amount\":\"100.00\",\"currency\":\"THB\"}");
    assert.equal(runtime.store.consumptionsForAuthorization(m3Ids.organization, decision.authorization_decision_id).length, 1);
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-02: wrong target ID or type denies without disclosure", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const first = createArtifact(runtime, "101.00").artifact;
    const second = createArtifact(runtime, "102.00").artifact;
    const decision = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", first);
    denied(() => raw(runtime, second, decision.authorization_decision_id));
    assert.equal(runtime.store.consumptionsForAuthorization(m3Ids.organization, decision.authorization_decision_id).length, 0);
    assert.equal(runtime.store.denialAuditsForOrganization(m3Ids.organization).length, 1);
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-03: wrong frozen target content identity denies", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const decision = runtime.targetAuthorization({ operation: "READ_RAW_ARTIFACT", target: { target_type: "SOURCE_ARTIFACT", target_id: artifact.source_artifact_id, target_content_identity: "f".repeat(64) as never } });
    denied(() => raw(runtime, artifact, decision.authorization_decision_id));
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-04: wrong operation denies", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const decision = decisionForArtifact(runtime, "MARK_ARTIFACT_UNAVAILABLE", artifact);
    denied(() => raw(runtime, artifact, decision.authorization_decision_id));
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-05: nonexistent and forged decision payloads deny", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    denied(() => raw(runtime, artifact, newM3Uuid()));
    const unsigned = {
      authorization_decision_id: newM3Uuid(), organization_id: m3Ids.organization, authorized_principal: m3User, operation: "READ_RAW_ARTIFACT",
      target: { target_type: "SOURCE_ARTIFACT" as const, target_id: artifact.source_artifact_id, target_content_identity: artifact.content_hash },
      authorization_contract_version: M3_AUTHORIZATION_LIFECYCLE_CONTRACT_VERSION, issued_at: m3Ids.timestamp, expires_at: null,
      issuer: { actor: m3Issuer, capability_evidence_ref: `membership:${m3Ids.organization}:${m3Issuer.actor_id}`, authority_provenance_ref: "issuer:forged" }, immutable_evidence_provenance_ref: "forged",
    } satisfies Omit<M3TargetBoundAuthorizationDecision, "decision_integrity_hash">;
    assert.throws(() => runtime.service.registerTargetBoundAuthorization({ ...unsigned, decision_integrity_hash: "0".repeat(64) as never }), /invalid/);
    assert.notEqual(targetBoundAuthorizationHash(unsigned), "0".repeat(64));
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-06: wrong organization or principal denies without cross-org disclosure", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const decision = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact);
    denied(() => runtime.service.readRawArtifact({ organization_id: m3Ids.otherOrganization, actor: m3OtherUser, authorization_decision_id: decision.authorization_decision_id, source_artifact_id: artifact.source_artifact_id, request_id: request(), trace_id: trace() }));
    assert.equal(runtime.store.consumptionsForAuthorization(m3Ids.organization, decision.authorization_decision_id).length, 0);
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-07: invalid integrity, policy version, and unauthorized issuer deny at registration", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const valid = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact);
    const invalidPolicy = { ...valid, authorization_decision_id: newM3Uuid(), authorization_contract_version: "unsupported/1" as never };
    assert.throws(() => runtime.service.registerTargetBoundAuthorization({ ...invalidPolicy, decision_integrity_hash: targetBoundAuthorizationHash(invalidPolicy) }), /invalid/);
    const invalidIssuer = { ...valid, authorization_decision_id: newM3Uuid(), issuer: { ...valid.issuer, capability_evidence_ref: "not-active" } };
    assert.throws(() => runtime.service.registerTargetBoundAuthorization({ ...invalidIssuer, decision_integrity_hash: targetBoundAuthorizationHash(invalidIssuer) }), /invalid/);
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-08: revoked decision cannot authorize a new operation", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const decision = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact);
    revoke(runtime, decision.authorization_decision_id);
    denied(() => raw(runtime, artifact, decision.authorization_decision_id));
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-09: superseded decision cannot authorize a new operation", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const original = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact);
    const replacement = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact);
    runtime.service.appendAuthorizationLifecycleFact({ organization_id: m3Ids.organization, affected_authorization_decision_id: original.authorization_decision_id, action: "SUPERSEDED", replacement_authorization_decision_id: replacement.authorization_decision_id, occurred_at: m3Ids.laterTimestamp, authority: m3Issuer, authority_evidence_ref: `membership:${m3Ids.organization}:${m3Issuer.actor_id}`, reason_ref: "security:superseded" });
    denied(() => raw(runtime, artifact, original.authorization_decision_id));
    assert.equal(raw(runtime, artifact, replacement.authorization_decision_id).byteLength > 0, true);
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-10: expiry denies while null expiry remains eligible", () => {
  const runtime = new M3Runtime(":memory:", fixedClock("2026-09-15T03:30:00.000Z"));
  try {
    const { artifact } = createArtifact(runtime);
    const expired = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact, "2026-09-15T03:00:00.000Z" as never);
    const indefinite = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact, null);
    denied(() => raw(runtime, artifact, expired.authorization_decision_id));
    assert.equal(raw(runtime, artifact, indefinite.authorization_decision_id).byteLength > 0, true);
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-11: replacement authorization works only for its own exact target scope", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const first = createArtifact(runtime, "103.00").artifact;
    const second = createArtifact(runtime, "104.00").artifact;
    const original = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", first);
    const replacement = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", second);
    runtime.service.appendAuthorizationLifecycleFact({ organization_id: m3Ids.organization, affected_authorization_decision_id: original.authorization_decision_id, action: "SUPERSEDED", replacement_authorization_decision_id: replacement.authorization_decision_id, occurred_at: m3Ids.laterTimestamp, authority: m3Issuer, authority_evidence_ref: `membership:${m3Ids.organization}:${m3Issuer.actor_id}`, reason_ref: "scope:replacement" });
    denied(() => raw(runtime, first, replacement.authorization_decision_id));
    assert.equal(raw(runtime, second, replacement.authorization_decision_id).byteLength > 0, true);
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-12: cached/earlier validation cannot survive a later lifecycle change", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const decision = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact);
    assert.equal(runtime.store.getTargetAuthorization(decision.authorization_decision_id)?.authorization_decision_id, decision.authorization_decision_id);
    revoke(runtime, decision.authorization_decision_id);
    denied(() => raw(runtime, artifact, decision.authorization_decision_id));
  } finally { runtime.close(); }
});

test("M3-AUTH-LC-13: lifecycle change before correction transaction blocks commit without partial mutation", () => {
  const directory = mkdtempSync(join(tmpdir(), "wendy-m3-auth-lc-correction-"));
  const database = join(directory, "source-evidence.sqlite");
  const runtime = new M3Runtime(database, fixedClock());
  const authorityRuntime = new M3Runtime(database, fixedClock());
  try {
    const { source, artifact } = createArtifact(runtime);
    const previous = createSourceRecord(runtime, source.source_id, artifact.source_artifact_id);
    const record = runtime.store.databaseForInvariantTestOnly();
    const correction = { organization_id: m3Ids.organization, actor: m3User, previous_source_record_id: previous.source_record_id, replacement_source: { source_type: "MANUAL_USER_INPUT" as const, received_at: m3Ids.laterTimestamp, ingestion_request_id: request(), idempotency_key: key(), trace_id: trace() }, artifact: { artifact_type: "MANUAL_INPUT_PAYLOAD" as const, bytes: canonicalManualArtifactBytes({ amount: "111.00", currency: "THB" }), detected_content_type: "application/json", admission_policy: admissionPolicy, received_at: m3Ids.laterTimestamp }, record: { record_locator: "row:new", raw_record: { amount: "111.00" }, created_at: m3Ids.laterTimestamp } };
    const replacementHash = sha256Bytes(correction.artifact.bytes);
    const recordHash = creationPayloadHash(correction.record.raw_record);
    const intent = runtime.creationIntent({ operation: "CORRECT_SOURCE_RECORD", proposed_target_resource_type: "SOURCE_RECORD", creation_payload_hash: creationPayloadHash(correctionCreationScope({ ...correction, authorization_decision_id: newM3Uuid() }, replacementHash, recordHash)), parent_resource_identity: previous.source_record_id, content_hash: replacementHash });
    const decision = runtime.targetAuthorization({ operation: "CORRECT_SOURCE_RECORD", creation_intent_id: intent.creation_intent_id });
    revoke(authorityRuntime, decision.authorization_decision_id);
    const before = record.prepare("SELECT count(*) AS count FROM wendy_m3_source").get() as { readonly count: number };
    denied(() => runtime.service.correctSourceRecord({ ...correction, authorization_decision_id: decision.authorization_decision_id, creation_intent_id: intent.creation_intent_id }));
    const after = record.prepare("SELECT count(*) AS count FROM wendy_m3_source").get() as { readonly count: number };
    assert.equal(after.count, before.count);
  } finally { authorityRuntime.close(); runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("M3-AUTH-LC-14: lifecycle change before availability transaction blocks commit without partial mutation", () => {
  const directory = mkdtempSync(join(tmpdir(), "wendy-m3-auth-lc-availability-"));
  const database = join(directory, "source-evidence.sqlite");
  const runtime = new M3Runtime(database, fixedClock());
  const authorityRuntime = new M3Runtime(database, fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const decision = decisionForArtifact(runtime, "MARK_ARTIFACT_UNAVAILABLE", artifact);
    revoke(authorityRuntime, decision.authorization_decision_id);
    denied(() => runtime.service.markArtifactUnavailable({ organization_id: m3Ids.organization, actor: m3User, authorization_decision_id: decision.authorization_decision_id, source_artifact_id: artifact.source_artifact_id, reason_ref: "retention:1", authorized_at: m3Ids.laterTimestamp, request_id: request(), trace_id: trace() }));
    assert.equal(runtime.store.latestAvailability(m3Ids.organization, artifact.source_artifact_id), undefined);
  } finally { authorityRuntime.close(); runtime.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("M3-AUTH-LC-15: immutable successful consumption remains traceable after later lifecycle change", () => {
  const runtime = new M3Runtime(":memory:", fixedClock());
  try {
    const { artifact } = createArtifact(runtime);
    const decision = decisionForArtifact(runtime, "READ_RAW_ARTIFACT", artifact);
    raw(runtime, artifact, decision.authorization_decision_id);
    revoke(runtime, decision.authorization_decision_id);
    const consumed = runtime.store.consumptionsForAuthorization(m3Ids.organization, decision.authorization_decision_id);
    assert.equal(consumed.length, 1);
    assert.equal(consumed[0]?.observed_lifecycle_outcome, "ACTIVE");
    assert.throws(() => runtime.store.databaseForInvariantTestOnly().prepare("UPDATE wendy_m3_authorization_consumption SET record_json = record_json").run(), /immutable history/);
  } finally { runtime.close(); }
});
