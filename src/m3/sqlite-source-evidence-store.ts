import { DatabaseSync } from "node:sqlite";

import type { CandidateId, ContentHash, EvidenceId, FinancialEventId, OrganizationId, SourceArtifactId, SourceId, Uuid } from "../domain/common/ids.ts";

import { deepFreeze } from "./canonical.ts";
import type {
  ArtifactAvailabilityRecord,
  CandidateSourceFactConfirmation,
  Evidence,
  FinancialEventTraceReference,
  JournalTraceReference,
  NormalizationRun,
  NormalizedCandidateObservation,
  Source,
  SourceArtifact,
  SourceLineageRelation,
  SourceRecord,
  SourceRecordId,
  M3AuthorizationConsumption,
  M3AuthorizationDenialAudit,
  M3AuthorizationLifecycleFact,
  M3CreationIntent,
  M3TargetBoundAuthorizationDecision,
  TrustedSourceEvidenceAuthorizationRecord,
} from "./contracts.ts";
import { M3AuthorizationDeniedError, M3ContractError } from "./errors.ts";

function json(value: unknown): string { return JSON.stringify(value); }
function parse<T>(value: unknown): T { return deepFreeze(JSON.parse(String(value)) as T); }

export interface StoredSourceRecord extends SourceRecord { readonly raw_record_json: string; }

/**
 * M3's independent persistence boundary. It only owns `wendy_m3_*` tables;
 * opening an M3 store against an M2 database neither changes M2 rows nor adds
 * a path from source/evidence operations to Ledger writes.
 */
export class SqliteSourceEvidenceStore {
  static readonly schema_version = 2;
  private readonly database: DatabaseSync;
  #inTransaction = false;

  constructor(filename = ":memory:") {
    this.database = new DatabaseSync(filename, { timeout: 5_000 });
    this.database.exec("PRAGMA foreign_keys = ON");
    try { this.migrate(); }
    catch (error) { this.database.close(); throw error; }
  }

  close(): void { this.database.close(); }

  schemaVersion(): number { return SqliteSourceEvidenceStore.schema_version; }

  /** Used by tests to demonstrate database-backed immutability; never expose to clients. */
  databaseForInvariantTestOnly(): DatabaseSync { return this.database; }

  serializable<T>(work: () => T): T {
    if (this.#inTransaction) return work();
    this.database.exec("BEGIN IMMEDIATE");
    this.#inTransaction = true;
    try {
      const result = work();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      // Denial audit is deliberately a separate immutable security record.
      // It is inserted before any protected mutation and must survive denial.
      if (error instanceof M3AuthorizationDeniedError) this.database.exec("COMMIT");
      else this.database.exec("ROLLBACK");
      throw error;
    } finally {
      this.#inTransaction = false;
    }
  }

  private migrate(): void {
    const exists = this.database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'wendy_m3_schema_metadata'").get() !== undefined;
    if (exists) {
      const row = this.database.prepare("SELECT schema_version FROM wendy_m3_schema_metadata WHERE schema_key = 'wendy_m3'").get() as { readonly schema_version: number } | undefined;
      if (row !== undefined && row.schema_version > SqliteSourceEvidenceStore.schema_version) {
        throw new M3ContractError("M3_SCHEMA_VERSION_UNSUPPORTED", "database schema is newer than this M3 implementation", "M3_SCHEMA_VERSION_UNSUPPORTED");
      }
    }
    this.serializable(() => {
      this.createSchemaV1();
      this.createSchemaV2();
      this.database.prepare("INSERT INTO wendy_m3_schema_metadata (schema_key, schema_version) VALUES ('wendy_m3', ?) ON CONFLICT(schema_key) DO UPDATE SET schema_version = excluded.schema_version").run(SqliteSourceEvidenceStore.schema_version);
    });
  }

  private createSchemaV1(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS wendy_m3_schema_metadata (
        schema_key TEXT PRIMARY KEY CHECK (schema_key = 'wendy_m3'),
        schema_version INTEGER NOT NULL CHECK (schema_version > 0)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_source (
        source_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.source_id') = source_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.idempotency_key') = idempotency_key),
        UNIQUE (organization_id, source_id),
        UNIQUE (organization_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_artifact (
        source_artifact_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        origin_source_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.source_artifact_id') = source_artifact_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.source_id') = origin_source_id),
        CHECK (json_extract(record_json, '$.content_hash') = content_hash),
        UNIQUE (organization_id, source_artifact_id),
        UNIQUE (organization_id, content_hash),
        FOREIGN KEY (organization_id, origin_source_id) REFERENCES wendy_m3_source (organization_id, source_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_artifact_content (
        organization_id TEXT NOT NULL,
        source_artifact_id TEXT NOT NULL,
        content_bytes BLOB NOT NULL,
        PRIMARY KEY (organization_id, source_artifact_id),
        FOREIGN KEY (organization_id, source_artifact_id) REFERENCES wendy_m3_artifact (organization_id, source_artifact_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_source_artifact_link (
        organization_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_artifact_id TEXT NOT NULL,
        link_kind TEXT NOT NULL CHECK (link_kind IN ('ORIGINATED', 'REDELIVERED')),
        linked_at TEXT NOT NULL,
        PRIMARY KEY (organization_id, source_id, source_artifact_id),
        FOREIGN KEY (organization_id, source_id) REFERENCES wendy_m3_source (organization_id, source_id),
        FOREIGN KEY (organization_id, source_artifact_id) REFERENCES wendy_m3_artifact (organization_id, source_artifact_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_source_record (
        source_record_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_artifact_id TEXT NOT NULL,
        source_system_ref TEXT NULL,
        record_locator TEXT NULL,
        external_record_identity TEXT NULL,
        canonical_content_hash TEXT NOT NULL,
        raw_record_json TEXT NOT NULL CHECK (json_valid(raw_record_json)),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.source_record_id') = source_record_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.source_id') = source_id),
        CHECK (json_extract(record_json, '$.source_artifact_id') = source_artifact_id),
        CHECK (json_extract(record_json, '$.canonical_content_hash') = canonical_content_hash),
        UNIQUE (organization_id, source_record_id),
        FOREIGN KEY (organization_id, source_id) REFERENCES wendy_m3_source (organization_id, source_id),
        FOREIGN KEY (organization_id, source_artifact_id) REFERENCES wendy_m3_artifact (organization_id, source_artifact_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_record_external_identity (
        organization_id TEXT NOT NULL,
        source_system_ref TEXT NOT NULL,
        external_record_identity TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        PRIMARY KEY (organization_id, source_system_ref, external_record_identity, source_record_id),
        FOREIGN KEY (organization_id, source_record_id) REFERENCES wendy_m3_source_record (organization_id, source_record_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_record_locator_identity (
        organization_id TEXT NOT NULL,
        source_artifact_id TEXT NOT NULL,
        record_locator TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        PRIMARY KEY (organization_id, source_artifact_id, record_locator),
        UNIQUE (organization_id, source_record_id),
        FOREIGN KEY (organization_id, source_artifact_id) REFERENCES wendy_m3_artifact (organization_id, source_artifact_id),
        FOREIGN KEY (organization_id, source_record_id) REFERENCES wendy_m3_source_record (organization_id, source_record_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_evidence (
        evidence_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_artifact_id TEXT NOT NULL,
        source_record_id TEXT NULL,
        content_hash TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.evidence_id') = evidence_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.source_id') = source_id),
        CHECK (json_extract(record_json, '$.source_artifact_id') = source_artifact_id),
        CHECK (json_extract(record_json, '$.content_hash') = content_hash),
        UNIQUE (organization_id, evidence_id),
        FOREIGN KEY (organization_id, source_id) REFERENCES wendy_m3_source (organization_id, source_id),
        FOREIGN KEY (organization_id, source_artifact_id) REFERENCES wendy_m3_artifact (organization_id, source_artifact_id),
        FOREIGN KEY (organization_id, source_record_id) REFERENCES wendy_m3_source_record (organization_id, source_record_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_authorization (
        authorization_decision_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.decision.authorization_decision_id') = authorization_decision_id),
        CHECK (json_extract(record_json, '$.decision.organization_id') = organization_id),
        UNIQUE (organization_id, authorization_decision_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_normalization (
        normalization_run_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.normalization_run_id') = normalization_run_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        UNIQUE (organization_id, normalization_run_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_candidate (
        candidate_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        candidate_version INTEGER NOT NULL CHECK (candidate_version > 0),
        candidate_hash TEXT NOT NULL,
        normalization_run_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.candidate_id') = candidate_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.candidate_version') = candidate_version),
        CHECK (json_extract(record_json, '$.candidate_hash') = candidate_hash),
        CHECK (json_extract(record_json, '$.authority') = 'OBSERVATION_ONLY'),
        UNIQUE (organization_id, candidate_id),
        FOREIGN KEY (organization_id, normalization_run_id) REFERENCES wendy_m3_normalization (organization_id, normalization_run_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_confirmation (
        confirmation_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.confirmation_id') = confirmation_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.candidate_id') = candidate_id),
        CHECK (json_extract(record_json, '$.authority') = 'SOURCE_BUSINESS_FACTS_ONLY'),
        UNIQUE (organization_id, confirmation_id),
        FOREIGN KEY (organization_id, candidate_id) REFERENCES wendy_m3_candidate (organization_id, candidate_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_lineage (
        source_lineage_relation_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        relation_type TEXT NOT NULL CHECK (relation_type IN ('DERIVED_FROM', 'SUPERSEDES', 'REPLACES')),
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.source_lineage_relation_id') = source_lineage_relation_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.relation_type') = relation_type),
        UNIQUE (organization_id, source_lineage_relation_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_availability (
        artifact_availability_record_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        source_artifact_id TEXT NOT NULL,
        authorized_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.artifact_availability_record_id') = artifact_availability_record_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.source_artifact_id') = source_artifact_id),
        UNIQUE (organization_id, artifact_availability_record_id),
        FOREIGN KEY (organization_id, source_artifact_id) REFERENCES wendy_m3_artifact (organization_id, source_artifact_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_candidate_event (
        organization_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_version INTEGER NOT NULL CHECK (event_version > 0),
        event_type TEXT NOT NULL CHECK (event_type IN ('ExpenseRecognized', 'PaymentMade')),
        PRIMARY KEY (organization_id, candidate_id, event_id, event_version),
        FOREIGN KEY (organization_id, candidate_id) REFERENCES wendy_m3_candidate (organization_id, candidate_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_event_journal (
        organization_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_version INTEGER NOT NULL CHECK (event_version > 0),
        journal_entry_id TEXT NOT NULL,
        PRIMARY KEY (organization_id, event_id, event_version, journal_entry_id)
      );
      CREATE INDEX IF NOT EXISTS wendy_m3_evidence_artifact_idx ON wendy_m3_evidence (organization_id, source_artifact_id);
      CREATE INDEX IF NOT EXISTS wendy_m3_candidate_event_idx ON wendy_m3_candidate_event (organization_id, event_id, event_version);
    `);
    const immutableTables = [
      "wendy_m3_source", "wendy_m3_artifact", "wendy_m3_artifact_content", "wendy_m3_source_artifact_link", "wendy_m3_source_record",
      "wendy_m3_record_external_identity", "wendy_m3_record_locator_identity", "wendy_m3_evidence", "wendy_m3_authorization", "wendy_m3_normalization",
      "wendy_m3_candidate", "wendy_m3_confirmation", "wendy_m3_lineage", "wendy_m3_availability", "wendy_m3_candidate_event", "wendy_m3_event_journal",
    ];
    for (const table of immutableTables) {
      this.database.exec(`
        CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'M3 immutable history cannot be updated'); END;
        CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'M3 immutable history cannot be deleted'); END;
      `);
    }
  }

  /** Additive, transactional lifecycle supplement. Existing v1 history is never rewritten. */
  private createSchemaV2(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS wendy_m3_creation_intent (
        creation_intent_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        proposed_target_resource_type TEXT NOT NULL,
        proposed_target_resource_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.creation_intent_id') = creation_intent_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.operation') = operation),
        CHECK (json_extract(record_json, '$.proposed_target_resource_type') = proposed_target_resource_type),
        CHECK (json_extract(record_json, '$.proposed_target_resource_id') = proposed_target_resource_id),
        UNIQUE (organization_id, creation_intent_id),
        UNIQUE (organization_id, proposed_target_resource_type, proposed_target_resource_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_target_authorization (
        authorization_decision_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        creation_intent_id TEXT NULL,
        target_type TEXT NULL,
        target_id TEXT NULL,
        target_content_identity TEXT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.authorization_decision_id') = authorization_decision_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.operation') = operation),
        CHECK ((creation_intent_id IS NOT NULL AND target_id IS NULL AND target_type IS NULL AND target_content_identity IS NULL) OR (creation_intent_id IS NULL AND target_id IS NOT NULL AND target_type IS NOT NULL AND target_content_identity IS NOT NULL)),
        UNIQUE (organization_id, authorization_decision_id),
        FOREIGN KEY (organization_id, creation_intent_id) REFERENCES wendy_m3_creation_intent (organization_id, creation_intent_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_authorization_lifecycle_fact (
        authorization_lifecycle_fact_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        affected_authorization_decision_id TEXT NOT NULL UNIQUE,
        lifecycle_version INTEGER NOT NULL CHECK (lifecycle_version > 0),
        action TEXT NOT NULL CHECK (action IN ('SUPERSEDED', 'REVOKED')),
        replacement_authorization_decision_id TEXT NULL,
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.authorization_lifecycle_fact_id') = authorization_lifecycle_fact_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.affected_authorization_decision_id') = affected_authorization_decision_id),
        CHECK ((action = 'SUPERSEDED' AND replacement_authorization_decision_id IS NOT NULL) OR (action = 'REVOKED' AND replacement_authorization_decision_id IS NULL)),
        UNIQUE (organization_id, authorization_lifecycle_fact_id),
        FOREIGN KEY (organization_id, affected_authorization_decision_id) REFERENCES wendy_m3_target_authorization (organization_id, authorization_decision_id),
        FOREIGN KEY (organization_id, replacement_authorization_decision_id) REFERENCES wendy_m3_target_authorization (organization_id, authorization_decision_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_authorization_consumption (
        authorization_consumption_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        authorization_decision_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.authorization_consumption_id') = authorization_consumption_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.authorization_decision_id') = authorization_decision_id),
        CHECK (json_extract(record_json, '$.result') = 'ALLOWED'),
        UNIQUE (organization_id, authorization_consumption_id),
        FOREIGN KEY (organization_id, authorization_decision_id) REFERENCES wendy_m3_target_authorization (organization_id, authorization_decision_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m3_authorization_denial_audit (
        authorization_denial_audit_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        evaluated_at TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.authorization_denial_audit_id') = authorization_denial_audit_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.outcome') = 'DENIED'),
        UNIQUE (organization_id, authorization_denial_audit_id)
      );
      CREATE INDEX IF NOT EXISTS wendy_m3_target_authorization_scope_idx ON wendy_m3_target_authorization (organization_id, operation, target_type, target_id);
      CREATE INDEX IF NOT EXISTS wendy_m3_authorization_consumption_decision_idx ON wendy_m3_authorization_consumption (organization_id, authorization_decision_id);
      CREATE INDEX IF NOT EXISTS wendy_m3_authorization_denial_audit_org_idx ON wendy_m3_authorization_denial_audit (organization_id, evaluated_at);
    `);
    for (const table of [
      "wendy_m3_creation_intent", "wendy_m3_target_authorization", "wendy_m3_authorization_lifecycle_fact",
      "wendy_m3_authorization_consumption", "wendy_m3_authorization_denial_audit",
    ]) {
      this.database.exec(`
        CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'M3 immutable history cannot be updated'); END;
        CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'M3 immutable history cannot be deleted'); END;
      `);
    }
  }

  insertSource(value: Source): void {
    this.database.prepare("INSERT INTO wendy_m3_source (source_id, organization_id, idempotency_key, record_json) VALUES (?, ?, ?, ?)")
      .run(value.source_id, value.organization_id, value.idempotency_key, json({ ...value, artifact_links: [] }));
  }

  findSourceByIdempotency(organization_id: OrganizationId, idempotency_key: string): Source | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_source WHERE organization_id = ? AND idempotency_key = ?").get(organization_id, idempotency_key) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : this.hydrateSource(parse<Source>(row.record_json));
  }

  getSource(organization_id: OrganizationId, source_id: SourceId): Source | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_source WHERE organization_id = ? AND source_id = ?").get(organization_id, source_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : this.hydrateSource(parse<Source>(row.record_json));
  }

  private hydrateSource(source: Source): Source {
    const rows = this.database.prepare("SELECT source_artifact_id, link_kind, linked_at FROM wendy_m3_source_artifact_link WHERE organization_id = ? AND source_id = ? ORDER BY linked_at, source_artifact_id").all(source.organization_id, source.source_id) as unknown as readonly { readonly source_artifact_id: SourceArtifactId; readonly link_kind: "ORIGINATED" | "REDELIVERED"; readonly linked_at: Source["created_at"] }[];
    return deepFreeze({ ...source, artifact_links: rows.map((row) => ({ ...row })) });
  }

  insertArtifact(value: SourceArtifact, bytes: Uint8Array): void {
    this.database.prepare("INSERT INTO wendy_m3_artifact (source_artifact_id, organization_id, origin_source_id, content_hash, record_json) VALUES (?, ?, ?, ?, ?)")
      .run(value.source_artifact_id, value.organization_id, value.source_id, value.content_hash, json(value));
    this.database.prepare("INSERT INTO wendy_m3_artifact_content (organization_id, source_artifact_id, content_bytes) VALUES (?, ?, ?)")
      .run(value.organization_id, value.source_artifact_id, bytes);
  }

  getArtifact(organization_id: OrganizationId, source_artifact_id: SourceArtifactId): SourceArtifact | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_artifact WHERE organization_id = ? AND source_artifact_id = ?").get(organization_id, source_artifact_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<SourceArtifact>(row.record_json);
  }

  findArtifactByHash(organization_id: OrganizationId, content_hash: ContentHash): SourceArtifact | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_artifact WHERE organization_id = ? AND content_hash = ?").get(organization_id, content_hash) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<SourceArtifact>(row.record_json);
  }

  readArtifactBytes(organization_id: OrganizationId, source_artifact_id: SourceArtifactId): Uint8Array | undefined {
    const row = this.database.prepare("SELECT content_bytes FROM wendy_m3_artifact_content WHERE organization_id = ? AND source_artifact_id = ?").get(organization_id, source_artifact_id) as { readonly content_bytes: Uint8Array } | undefined;
    return row === undefined ? undefined : new Uint8Array(row.content_bytes);
  }

  insertSourceArtifactLink(organization_id: OrganizationId, source_id: SourceId, source_artifact_id: SourceArtifactId, link_kind: "ORIGINATED" | "REDELIVERED", linked_at: string): void {
    this.database.prepare("INSERT INTO wendy_m3_source_artifact_link (organization_id, source_id, source_artifact_id, link_kind, linked_at) VALUES (?, ?, ?, ?, ?)")
      .run(organization_id, source_id, source_artifact_id, link_kind, linked_at);
  }

  hasSourceArtifactLink(organization_id: OrganizationId, source_id: SourceId, source_artifact_id: SourceArtifactId): boolean {
    return this.database.prepare("SELECT 1 FROM wendy_m3_source_artifact_link WHERE organization_id = ? AND source_id = ? AND source_artifact_id = ?").get(organization_id, source_id, source_artifact_id) !== undefined;
  }

  insertSourceRecord(value: SourceRecord, raw_record_json: string): void {
    this.database.prepare("INSERT INTO wendy_m3_source_record (source_record_id, organization_id, source_id, source_artifact_id, source_system_ref, record_locator, external_record_identity, canonical_content_hash, raw_record_json, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(value.source_record_id, value.organization_id, value.source_id, value.source_artifact_id, value.source_system_ref ?? null, value.record_locator ?? null, value.external_record_identity ?? null, value.canonical_content_hash, raw_record_json, json(value));
    if (value.external_record_identity !== undefined && value.source_system_ref !== undefined) {
      this.database.prepare("INSERT INTO wendy_m3_record_external_identity (organization_id, source_system_ref, external_record_identity, source_record_id) VALUES (?, ?, ?, ?)")
        .run(value.organization_id, value.source_system_ref, value.external_record_identity, value.source_record_id);
    }
    if (value.record_locator !== undefined) {
      this.database.prepare("INSERT INTO wendy_m3_record_locator_identity (organization_id, source_artifact_id, record_locator, source_record_id) VALUES (?, ?, ?, ?)")
        .run(value.organization_id, value.source_artifact_id, value.record_locator, value.source_record_id);
    }
  }

  getSourceRecord(organization_id: OrganizationId, source_record_id: SourceRecordId): StoredSourceRecord | undefined {
    const row = this.database.prepare("SELECT record_json, raw_record_json FROM wendy_m3_source_record WHERE organization_id = ? AND source_record_id = ?").get(organization_id, source_record_id) as { readonly record_json: string; readonly raw_record_json: string } | undefined;
    return row === undefined ? undefined : deepFreeze({ ...parse<SourceRecord>(row.record_json), raw_record_json: row.raw_record_json });
  }

  findSourceRecordByExternalIdentity(organization_id: OrganizationId, source_system_ref: string, external_record_identity: string): SourceRecord | undefined {
    const row = this.database.prepare("SELECT r.record_json FROM wendy_m3_record_external_identity i JOIN wendy_m3_source_record r ON r.source_record_id = i.source_record_id WHERE i.organization_id = ? AND i.source_system_ref = ? AND i.external_record_identity = ? ORDER BY json_extract(r.record_json, '$.created_at') DESC LIMIT 1").get(organization_id, source_system_ref, external_record_identity) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<SourceRecord>(row.record_json);
  }

  findSourceRecordByArtifactLocator(organization_id: OrganizationId, source_artifact_id: SourceArtifactId, record_locator: string): SourceRecord | undefined {
    const row = this.database.prepare("SELECT r.record_json FROM wendy_m3_record_locator_identity i JOIN wendy_m3_source_record r ON r.source_record_id = i.source_record_id WHERE i.organization_id = ? AND i.source_artifact_id = ? AND i.record_locator = ?").get(organization_id, source_artifact_id, record_locator) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<SourceRecord>(row.record_json);
  }

  insertEvidence(value: Evidence): void {
    this.database.prepare("INSERT INTO wendy_m3_evidence (evidence_id, organization_id, source_id, source_artifact_id, source_record_id, content_hash, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(value.evidence_id, value.organization_id, value.source_id, value.source_artifact_id, value.source_record_id ?? null, value.content_hash, json(value));
  }

  getEvidence(organization_id: OrganizationId, evidence_id: EvidenceId): Evidence | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_evidence WHERE organization_id = ? AND evidence_id = ?").get(organization_id, evidence_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<Evidence>(row.record_json);
  }

  insertAuthorization(value: TrustedSourceEvidenceAuthorizationRecord): void {
    this.database.prepare("INSERT INTO wendy_m3_authorization (authorization_decision_id, organization_id, record_json) VALUES (?, ?, ?)")
      .run(value.decision.authorization_decision_id, value.decision.organization_id, json(value));
  }

  getAuthorization(id: Uuid): TrustedSourceEvidenceAuthorizationRecord | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_authorization WHERE authorization_decision_id = ?").get(id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<TrustedSourceEvidenceAuthorizationRecord>(row.record_json);
  }

  insertCreationIntent(value: M3CreationIntent): void {
    this.database.prepare("INSERT INTO wendy_m3_creation_intent (creation_intent_id, organization_id, operation, proposed_target_resource_type, proposed_target_resource_id, record_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(value.creation_intent_id, value.organization_id, value.operation, value.proposed_target_resource_type, value.proposed_target_resource_id, json(value));
  }

  getCreationIntent(organization_id: OrganizationId, id: Uuid): M3CreationIntent | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_creation_intent WHERE organization_id = ? AND creation_intent_id = ?").get(organization_id, id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<M3CreationIntent>(row.record_json);
  }

  insertTargetAuthorization(value: M3TargetBoundAuthorizationDecision): void {
    this.database.prepare("INSERT INTO wendy_m3_target_authorization (authorization_decision_id, organization_id, operation, creation_intent_id, target_type, target_id, target_content_identity, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(value.authorization_decision_id, value.organization_id, value.operation, value.creation_intent_id ?? null, value.target?.target_type ?? null, value.target?.target_id ?? null, value.target?.target_content_identity ?? null, json(value));
  }

  getTargetAuthorization(id: Uuid): M3TargetBoundAuthorizationDecision | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_target_authorization WHERE authorization_decision_id = ?").get(id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<M3TargetBoundAuthorizationDecision>(row.record_json);
  }

  insertAuthorizationLifecycleFact(value: M3AuthorizationLifecycleFact): void {
    this.database.prepare("INSERT INTO wendy_m3_authorization_lifecycle_fact (authorization_lifecycle_fact_id, organization_id, affected_authorization_decision_id, lifecycle_version, action, replacement_authorization_decision_id, occurred_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(value.authorization_lifecycle_fact_id, value.organization_id, value.affected_authorization_decision_id, value.lifecycle_version, value.action, value.replacement_authorization_decision_id, value.occurred_at, json(value));
  }

  getAuthorizationLifecycleFact(organization_id: OrganizationId, authorization_decision_id: Uuid): M3AuthorizationLifecycleFact | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_authorization_lifecycle_fact WHERE organization_id = ? AND affected_authorization_decision_id = ?").get(organization_id, authorization_decision_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<M3AuthorizationLifecycleFact>(row.record_json);
  }

  insertAuthorizationConsumption(value: M3AuthorizationConsumption): void {
    this.database.prepare("INSERT INTO wendy_m3_authorization_consumption (authorization_consumption_id, organization_id, authorization_decision_id, record_json) VALUES (?, ?, ?, ?)")
      .run(value.authorization_consumption_id, value.organization_id, value.authorization_decision_id, json(value));
  }

  consumptionsForAuthorization(organization_id: OrganizationId, authorization_decision_id: Uuid): readonly M3AuthorizationConsumption[] {
    const rows = this.database.prepare("SELECT record_json FROM wendy_m3_authorization_consumption WHERE organization_id = ? AND authorization_decision_id = ? ORDER BY authorization_consumption_id").all(organization_id, authorization_decision_id) as unknown as readonly { readonly record_json: string }[];
    return deepFreeze(rows.map((row) => parse<M3AuthorizationConsumption>(row.record_json)));
  }

  insertAuthorizationDenialAudit(value: M3AuthorizationDenialAudit): void {
    this.database.prepare("INSERT INTO wendy_m3_authorization_denial_audit (authorization_denial_audit_id, organization_id, evaluated_at, record_json) VALUES (?, ?, ?, ?)")
      .run(value.authorization_denial_audit_id, value.organization_id, value.evaluated_at, json(value));
  }

  denialAuditsForOrganization(organization_id: OrganizationId): readonly M3AuthorizationDenialAudit[] {
    const rows = this.database.prepare("SELECT record_json FROM wendy_m3_authorization_denial_audit WHERE organization_id = ? ORDER BY evaluated_at, authorization_denial_audit_id").all(organization_id) as unknown as readonly { readonly record_json: string }[];
    return deepFreeze(rows.map((row) => parse<M3AuthorizationDenialAudit>(row.record_json)));
  }

  insertNormalization(value: NormalizationRun): void {
    this.database.prepare("INSERT INTO wendy_m3_normalization (normalization_run_id, organization_id, record_json) VALUES (?, ?, ?)")
      .run(value.normalization_run_id, value.organization_id, json(value));
  }

  getNormalization(organization_id: OrganizationId, id: string): NormalizationRun | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_normalization WHERE organization_id = ? AND normalization_run_id = ?").get(organization_id, id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<NormalizationRun>(row.record_json);
  }

  insertCandidate(value: NormalizedCandidateObservation): void {
    this.database.prepare("INSERT INTO wendy_m3_candidate (candidate_id, organization_id, candidate_version, candidate_hash, normalization_run_id, record_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(value.candidate_id, value.organization_id, value.candidate_version, value.candidate_hash, value.normalization_run_id, json(value));
  }

  getCandidate(organization_id: OrganizationId, candidate_id: CandidateId): NormalizedCandidateObservation | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_candidate WHERE organization_id = ? AND candidate_id = ?").get(organization_id, candidate_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<NormalizedCandidateObservation>(row.record_json);
  }

  insertConfirmation(value: CandidateSourceFactConfirmation): void {
    this.database.prepare("INSERT INTO wendy_m3_confirmation (confirmation_id, organization_id, candidate_id, record_json) VALUES (?, ?, ?, ?)")
      .run(value.confirmation_id, value.organization_id, value.candidate_id, json(value));
  }

  hasCandidateConfirmation(organization_id: OrganizationId, candidate_id: CandidateId): boolean {
    return this.database.prepare("SELECT 1 FROM wendy_m3_confirmation WHERE organization_id = ? AND candidate_id = ?").get(organization_id, candidate_id) !== undefined;
  }

  latestCandidateConfirmation(organization_id: OrganizationId, candidate_id: CandidateId): CandidateSourceFactConfirmation | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_confirmation WHERE organization_id = ? AND candidate_id = ? ORDER BY json_extract(record_json, '$.confirmed_at') DESC, confirmation_id DESC LIMIT 1").get(organization_id, candidate_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<CandidateSourceFactConfirmation>(row.record_json);
  }

  confirmationsForCandidate(organization_id: OrganizationId, candidate_id: CandidateId): readonly CandidateSourceFactConfirmation[] {
    const rows = this.database.prepare("SELECT record_json FROM wendy_m3_confirmation WHERE organization_id = ? AND candidate_id = ? ORDER BY json_extract(record_json, '$.confirmed_at'), confirmation_id").all(organization_id, candidate_id) as unknown as readonly { readonly record_json: string }[];
    return deepFreeze(rows.map((row) => parse<CandidateSourceFactConfirmation>(row.record_json)));
  }

  insertLineage(value: SourceLineageRelation): void {
    this.database.prepare("INSERT INTO wendy_m3_lineage (source_lineage_relation_id, organization_id, relation_type, record_json) VALUES (?, ?, ?, ?)")
      .run(value.source_lineage_relation_id, value.organization_id, value.relation_type, json(value));
  }

  insertAvailability(value: ArtifactAvailabilityRecord): void {
    this.database.prepare("INSERT INTO wendy_m3_availability (artifact_availability_record_id, organization_id, source_artifact_id, authorized_at, record_json) VALUES (?, ?, ?, ?, ?)")
      .run(value.artifact_availability_record_id, value.organization_id, value.source_artifact_id, value.authorized_at, json(value));
  }

  latestAvailability(organization_id: OrganizationId, source_artifact_id: SourceArtifactId): ArtifactAvailabilityRecord | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m3_availability WHERE organization_id = ? AND source_artifact_id = ? ORDER BY authorized_at DESC, artifact_availability_record_id DESC LIMIT 1").get(organization_id, source_artifact_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<ArtifactAvailabilityRecord>(row.record_json);
  }

  linkCandidateEvent(organization_id: OrganizationId, candidate_id: CandidateId, event: FinancialEventTraceReference): void {
    this.database.prepare("INSERT INTO wendy_m3_candidate_event (organization_id, candidate_id, event_id, event_version, event_type) VALUES (?, ?, ?, ?, ?)")
      .run(organization_id, candidate_id, event.event_id, event.event_version, event.event_type);
  }

  linkEventJournal(organization_id: OrganizationId, event: FinancialEventTraceReference, journal: JournalTraceReference): void {
    this.database.prepare("INSERT INTO wendy_m3_event_journal (organization_id, event_id, event_version, journal_entry_id) VALUES (?, ?, ?, ?)")
      .run(organization_id, event.event_id, event.event_version, journal.journal_entry_id);
  }

  candidateIdsForJournal(organization_id: OrganizationId, journal_entry_id: string): readonly CandidateId[] {
    const rows = this.database.prepare("SELECT DISTINCT ce.candidate_id FROM wendy_m3_event_journal ej JOIN wendy_m3_candidate_event ce ON ce.organization_id = ej.organization_id AND ce.event_id = ej.event_id AND ce.event_version = ej.event_version WHERE ej.organization_id = ? AND ej.journal_entry_id = ? ORDER BY ce.candidate_id").all(organization_id, journal_entry_id) as unknown as readonly { readonly candidate_id: CandidateId }[];
    return deepFreeze(rows.map((row) => row.candidate_id));
  }

  eventRefsForArtifact(organization_id: OrganizationId, source_artifact_id: SourceArtifactId): readonly { readonly event_id: FinancialEventId; readonly event_version: number }[] {
    const rows = this.database.prepare("SELECT DISTINCT ce.event_id, ce.event_version FROM wendy_m3_evidence e JOIN wendy_m3_candidate c ON c.organization_id = e.organization_id AND c.record_json LIKE '%' || e.evidence_id || '%' JOIN wendy_m3_candidate_event ce ON ce.organization_id = c.organization_id AND ce.candidate_id = c.candidate_id WHERE e.organization_id = ? AND e.source_artifact_id = ?").all(organization_id, source_artifact_id) as unknown as readonly { readonly event_id: FinancialEventId; readonly event_version: number }[];
    return deepFreeze(rows.map((row) => ({ ...row })));
  }

  journalRefsForArtifact(organization_id: OrganizationId, source_artifact_id: SourceArtifactId): readonly string[] {
    const rows = this.database.prepare("SELECT DISTINCT ej.journal_entry_id FROM wendy_m3_evidence e JOIN wendy_m3_candidate c ON c.organization_id = e.organization_id AND c.record_json LIKE '%' || e.evidence_id || '%' JOIN wendy_m3_candidate_event ce ON ce.organization_id = c.organization_id AND ce.candidate_id = c.candidate_id JOIN wendy_m3_event_journal ej ON ej.organization_id = ce.organization_id AND ej.event_id = ce.event_id AND ej.event_version = ce.event_version WHERE e.organization_id = ? AND e.source_artifact_id = ?").all(organization_id, source_artifact_id) as unknown as readonly { readonly journal_entry_id: string }[];
    return deepFreeze(rows.map((row) => row.journal_entry_id));
  }

  sourceProvenanceForArtifact(organization_id: OrganizationId, source_artifact_id: SourceArtifactId): {
    readonly source_ids: readonly SourceId[];
    readonly source_record_ids: readonly SourceRecordId[];
    readonly evidence_ids: readonly EvidenceId[];
  } {
    const sourceRows = this.database.prepare("SELECT source_id FROM wendy_m3_source_artifact_link WHERE organization_id = ? AND source_artifact_id = ? ORDER BY source_id").all(organization_id, source_artifact_id) as unknown as readonly { readonly source_id: SourceId }[];
    const recordRows = this.database.prepare("SELECT source_record_id FROM wendy_m3_source_record WHERE organization_id = ? AND source_artifact_id = ? ORDER BY source_record_id").all(organization_id, source_artifact_id) as unknown as readonly { readonly source_record_id: SourceRecordId }[];
    const evidenceRows = this.database.prepare("SELECT evidence_id FROM wendy_m3_evidence WHERE organization_id = ? AND source_artifact_id = ? ORDER BY evidence_id").all(organization_id, source_artifact_id) as unknown as readonly { readonly evidence_id: EvidenceId }[];
    return deepFreeze({ source_ids: sourceRows.map((row) => row.source_id), source_record_ids: recordRows.map((row) => row.source_record_id), evidence_ids: evidenceRows.map((row) => row.evidence_id) });
  }

  traceCandidate(organization_id: OrganizationId, candidate_id: CandidateId): {
    readonly candidate: NormalizedCandidateObservation;
    readonly evidence: readonly Evidence[];
    readonly source_records: readonly SourceRecord[];
    readonly artifacts: readonly SourceArtifact[];
    readonly sources: readonly Source[];
    readonly events: readonly FinancialEventTraceReference[];
    readonly journals: readonly JournalTraceReference[];
    readonly lineage: readonly SourceLineageRelation[];
    readonly availability: readonly ArtifactAvailabilityRecord[];
  } | undefined {
    const candidate = this.getCandidate(organization_id, candidate_id);
    if (candidate === undefined) return undefined;
    const evidence = candidate.evidence_refs.map((reference) => this.getEvidence(organization_id, reference.evidence_id)).filter((value): value is Evidence => value !== undefined);
    if (evidence.length !== candidate.evidence_refs.length) throw new M3ContractError("M3_INFRASTRUCTURE_FAILURE", "candidate evidence trace is incomplete", "M3_TRACE_EVIDENCE_MISSING");
    const source_records = evidence.flatMap((item) => item.source_record_id === undefined ? [] : [this.getSourceRecord(organization_id, item.source_record_id)]).filter((value): value is StoredSourceRecord => value !== undefined).map(({ raw_record_json: _raw, ...record }) => record);
    const artifactIds = [...new Set(evidence.map((item) => item.source_artifact_id))];
    const artifacts = artifactIds.map((id) => this.getArtifact(organization_id, id)).filter((value): value is SourceArtifact => value !== undefined);
    const sourceIds = [...new Set(evidence.map((item) => item.source_id))];
    const sources = sourceIds.map((id) => this.getSource(organization_id, id)).filter((value): value is Source => value !== undefined);
    const eventRows = this.database.prepare("SELECT event_id, event_version, event_type FROM wendy_m3_candidate_event WHERE organization_id = ? AND candidate_id = ? ORDER BY event_type, event_id").all(organization_id, candidate_id) as unknown as readonly FinancialEventTraceReference[];
    const journals = eventRows.flatMap((event) => this.database.prepare("SELECT journal_entry_id FROM wendy_m3_event_journal WHERE organization_id = ? AND event_id = ? AND event_version = ?").all(organization_id, event.event_id, event.event_version) as unknown as readonly JournalTraceReference[]);
    const allLineage = this.database.prepare("SELECT record_json FROM wendy_m3_lineage WHERE organization_id = ?").all(organization_id) as unknown as readonly { readonly record_json: string }[];
    const involved = new Set<string>([candidate.candidate_id, ...evidence.map((item) => item.evidence_id), ...source_records.map((item) => item.source_record_id), ...artifacts.map((item) => item.source_artifact_id)]);
    const lineage = allLineage.map((row) => parse<SourceLineageRelation>(row.record_json)).filter((item) => involved.has(item.from_object_id) || involved.has(item.to_object_id));
    const availability = artifacts.map((item) => this.latestAvailability(organization_id, item.source_artifact_id)).filter((value): value is ArtifactAvailabilityRecord => value !== undefined);
    return deepFreeze({ candidate, evidence, source_records, artifacts, sources, events: eventRows.map((row) => ({ ...row })), journals, lineage, availability });
  }
}
