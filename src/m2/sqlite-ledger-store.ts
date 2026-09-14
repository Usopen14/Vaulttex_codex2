import { DatabaseSync } from "node:sqlite";

import type { AccountingPeriod } from "../domain/periods/periods.ts";

import { deepFreeze } from "./canonical.ts";
import { M2ContractError } from "./errors.ts";
import type {
  ConsumedDecisionProvenance,
  CorrectionCase,
  M2AuditRecord,
  PostedJournal,
} from "./contracts.ts";
import type {
  EffectReservation,
  EventFingerprintReservation,
  FingerprintCollisionDiagnostic,
  IdempotencyRecord,
  LedgerTransaction,
  SerializableLedgerStore,
} from "./ledger.ts";

function json<T>(value: T): string { return JSON.stringify(value); }
function parse<T>(value: unknown): T { return deepFreeze(JSON.parse(String(value)) as T); }

/**
 * SQLite-backed M2 persistence adapter. It uses a database transaction and
 * database unique constraints, not process-local locking, for the frozen
 * idempotency/effect/reversal identities. `:memory:` is useful for tests;
 * deployments pass an organization-approved database path.
 */
export class SqliteLedgerStore implements SerializableLedgerStore {
  private readonly database: DatabaseSync;
  #failureAtWrite: number | null = null;

  static readonly schema_version = 2;

  constructor(filename = ":memory:") {
    // A bounded busy wait prevents a concurrent connection from observing a
    // transient SQLITE_BUSY as permission to create a fresh financial effect.
    this.database = new DatabaseSync(filename, { timeout: 5_000 });
    this.database.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    const metadataPresent = this.database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'wendy_m2_schema_metadata'").get() !== undefined;
    if (metadataPresent) {
      const row = this.database.prepare("SELECT schema_version FROM wendy_m2_schema_metadata WHERE schema_key = 'wendy_m2'").get() as { readonly schema_version: number } | undefined;
      if (row !== undefined && row.schema_version > SqliteLedgerStore.schema_version) throw new M2ContractError("M2_CONTRACT_VIOLATION", "database schema is newer than this M2 implementation", "M2_SCHEMA_VERSION_UNSUPPORTED");
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.createSchemaV2();
      this.database.prepare("INSERT INTO wendy_m2_schema_metadata (schema_key, schema_version) VALUES ('wendy_m2', ?) ON CONFLICT(schema_key) DO UPDATE SET schema_version = excluded.schema_version").run(SqliteLedgerStore.schema_version);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private createSchemaV2(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS wendy_m2_schema_metadata (
        schema_key TEXT PRIMARY KEY CHECK (schema_key = 'wendy_m2'),
        schema_version INTEGER NOT NULL CHECK (schema_version > 0)
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_idempotency (
        organization_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.operation') = operation),
        CHECK (json_extract(record_json, '$.idempotency_key') = idempotency_key),
        CHECK (json_extract(record_json, '$.state') IN ('IN_PROGRESS', 'TERMINAL', 'UNKNOWN_OUTCOME')),
        PRIMARY KEY (organization_id, operation, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_effect (
        organization_id TEXT NOT NULL,
        effect_fingerprint_contract TEXT NOT NULL,
        financial_effect_fingerprint TEXT NOT NULL,
        journal_entry_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.contract_version') = effect_fingerprint_contract),
        CHECK (json_extract(record_json, '$.fingerprint') = financial_effect_fingerprint),
        CHECK (json_extract(record_json, '$.journal_entry_id') = journal_entry_id),
        PRIMARY KEY (organization_id, effect_fingerprint_contract, financial_effect_fingerprint),
        FOREIGN KEY (organization_id, journal_entry_id)
          REFERENCES wendy_m2_journal (organization_id, journal_entry_id)
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_event_fingerprint (
        organization_id TEXT NOT NULL,
        event_fingerprint_contract TEXT NOT NULL,
        event_fingerprint TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.fingerprint') = event_fingerprint),
        PRIMARY KEY (organization_id, event_fingerprint_contract, event_fingerprint)
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_source_claim (
        organization_id TEXT NOT NULL,
        source_tuple TEXT NOT NULL,
        effect_fingerprint_contract TEXT NOT NULL,
        financial_effect_fingerprint TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.source_tuple') = source_tuple),
        CHECK (json_extract(record_json, '$.effect_fingerprint') = financial_effect_fingerprint),
        PRIMARY KEY (organization_id, source_tuple),
        FOREIGN KEY (organization_id, effect_fingerprint_contract, financial_effect_fingerprint)
          REFERENCES wendy_m2_effect (organization_id, effect_fingerprint_contract, financial_effect_fingerprint)
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_journal (
        journal_entry_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        original_journal_entry_id TEXT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.journal_entry_id') = journal_entry_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.original_journal_entry_id') IS original_journal_entry_id),
        CHECK (json_extract(record_json, '$.immutable_draft.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.immutable_draft.currency') = 'THB'),
        CHECK (json_extract(record_json, '$.immutable_draft.total_debit.currency') = 'THB'),
        CHECK (json_extract(record_json, '$.immutable_draft.total_credit.currency') = 'THB'),
        CHECK (json_extract(record_json, '$.immutable_draft.total_debit.value') = json_extract(record_json, '$.immutable_draft.total_credit.value')),
        CHECK (json_array_length(json_extract(record_json, '$.immutable_draft.lines')) = 2),
        CHECK ((json_type(record_json, '$.immutable_draft.lines[0].debit') = 'object' AND json_type(record_json, '$.immutable_draft.lines[0].credit') = 'null') OR (json_type(record_json, '$.immutable_draft.lines[0].debit') = 'null' AND json_type(record_json, '$.immutable_draft.lines[0].credit') = 'object')),
        CHECK ((json_type(record_json, '$.immutable_draft.lines[1].debit') = 'object' AND json_type(record_json, '$.immutable_draft.lines[1].credit') = 'null') OR (json_type(record_json, '$.immutable_draft.lines[1].debit') = 'null' AND json_type(record_json, '$.immutable_draft.lines[1].credit') = 'object')),
        CHECK (COALESCE(json_extract(record_json, '$.immutable_draft.lines[0].debit.currency'), json_extract(record_json, '$.immutable_draft.lines[1].debit.currency')) = 'THB'),
        CHECK (COALESCE(json_extract(record_json, '$.immutable_draft.lines[0].credit.currency'), json_extract(record_json, '$.immutable_draft.lines[1].credit.currency')) = 'THB'),
        CHECK (COALESCE(json_extract(record_json, '$.immutable_draft.lines[0].debit.value'), json_extract(record_json, '$.immutable_draft.lines[1].debit.value')) = json_extract(record_json, '$.immutable_draft.total_debit.value')),
        CHECK (COALESCE(json_extract(record_json, '$.immutable_draft.lines[0].credit.value'), json_extract(record_json, '$.immutable_draft.lines[1].credit.value')) = json_extract(record_json, '$.immutable_draft.total_credit.value')),
        CHECK ((json_extract(record_json, '$.journal_kind') = 'ORIGINAL' AND original_journal_entry_id IS NULL) OR (json_extract(record_json, '$.journal_kind') = 'REVERSAL' AND original_journal_entry_id IS NOT NULL) OR (json_extract(record_json, '$.journal_kind') = 'CORRECTED_REPLACEMENT' AND original_journal_entry_id IS NULL)),
        UNIQUE (organization_id, journal_entry_id),
        FOREIGN KEY (organization_id, original_journal_entry_id)
          REFERENCES wendy_m2_journal (organization_id, journal_entry_id)
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_reversal (
        organization_id TEXT NOT NULL,
        original_journal_entry_id TEXT NOT NULL,
        reversal_journal_entry_id TEXT NOT NULL,
        PRIMARY KEY (organization_id, original_journal_entry_id),
        UNIQUE (organization_id, reversal_journal_entry_id),
        FOREIGN KEY (organization_id, original_journal_entry_id)
          REFERENCES wendy_m2_journal (organization_id, journal_entry_id)
          DEFERRABLE INITIALLY DEFERRED,
        FOREIGN KEY (organization_id, reversal_journal_entry_id)
          REFERENCES wendy_m2_journal (organization_id, journal_entry_id)
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_correction_case (
        correction_case_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        original_journal_entry_id TEXT NOT NULL,
        reversal_journal_entry_id TEXT NOT NULL,
        corrected_replacement_journal_entry_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.correction_case_id') = correction_case_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.original_journal_entry_id') = original_journal_entry_id),
        CHECK (json_extract(record_json, '$.reversal_journal_entry_id') = reversal_journal_entry_id),
        CHECK (json_extract(record_json, '$.corrected_replacement_journal_entry_id') = corrected_replacement_journal_entry_id),
        FOREIGN KEY (organization_id, original_journal_entry_id)
          REFERENCES wendy_m2_journal (organization_id, journal_entry_id)
          DEFERRABLE INITIALLY DEFERRED,
        FOREIGN KEY (organization_id, reversal_journal_entry_id)
          REFERENCES wendy_m2_journal (organization_id, journal_entry_id)
          DEFERRABLE INITIALLY DEFERRED,
        FOREIGN KEY (organization_id, corrected_replacement_journal_entry_id)
          REFERENCES wendy_m2_journal (organization_id, journal_entry_id)
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_audit (
        audit_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.audit_id') = audit_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_period (
        accounting_period_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.accounting_period_id') = accounting_period_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_fingerprint_diagnostic (
        diagnostic_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.diagnostic_id') = diagnostic_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_trusted_authorization (
        authorization_decision_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.authorization.authorization_decision_id') = authorization_decision_id),
        CHECK (json_extract(record_json, '$.authorization.organization_id') = organization_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_trusted_tax_impact (
        tax_impact_eligibility_decision_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.decision.tax_impact_eligibility_decision_id') = tax_impact_eligibility_decision_id),
        CHECK (json_extract(record_json, '$.decision.organization_id') = organization_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_decision_supersession (
        decision_kind TEXT NOT NULL CHECK (decision_kind IN ('AUTHORIZATION', 'TAX_IMPACT')),
        superseded_decision_id TEXT NOT NULL,
        replacement_decision_id TEXT NOT NULL,
        PRIMARY KEY (decision_kind, superseded_decision_id),
        UNIQUE (decision_kind, replacement_decision_id)
      );
      CREATE TABLE IF NOT EXISTS wendy_m2_consumed_decision_provenance (
        provenance_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        journal_entry_id TEXT NOT NULL UNIQUE,
        record_json TEXT NOT NULL CHECK (json_valid(record_json)),
        CHECK (json_extract(record_json, '$.provenance_id') = provenance_id),
        CHECK (json_extract(record_json, '$.organization_id') = organization_id),
        CHECK (json_extract(record_json, '$.journal_entry_id') = journal_entry_id),
        FOREIGN KEY (organization_id, journal_entry_id)
          REFERENCES wendy_m2_journal (organization_id, journal_entry_id)
          DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TRIGGER IF NOT EXISTS wendy_m2_idempotency_transition
        BEFORE UPDATE ON wendy_m2_idempotency
        WHEN OLD.record_json <> NEW.record_json AND (json_extract(OLD.record_json, '$.state') <> 'IN_PROGRESS' OR json_extract(NEW.record_json, '$.state') NOT IN ('TERMINAL', 'UNKNOWN_OUTCOME') OR json_extract(OLD.record_json, '$.organization_id') <> json_extract(NEW.record_json, '$.organization_id') OR json_extract(OLD.record_json, '$.operation') <> json_extract(NEW.record_json, '$.operation') OR json_extract(OLD.record_json, '$.idempotency_key') <> json_extract(NEW.record_json, '$.idempotency_key') OR json_extract(OLD.record_json, '$.owner_actor_id') <> json_extract(NEW.record_json, '$.owner_actor_id') OR json_extract(OLD.record_json, '$.canonical_request_input_hash') <> json_extract(NEW.record_json, '$.canonical_request_input_hash'))
        BEGIN SELECT RAISE(ABORT, 'idempotency record transition is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_journal_immutable_update
        BEFORE UPDATE ON wendy_m2_journal BEGIN SELECT RAISE(ABORT, 'posted journal is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_journal_immutable_delete
        BEFORE DELETE ON wendy_m2_journal BEGIN SELECT RAISE(ABORT, 'posted journal is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_effect_immutable_update
        BEFORE UPDATE ON wendy_m2_effect BEGIN SELECT RAISE(ABORT, 'effect reservation is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_effect_immutable_delete
        BEFORE DELETE ON wendy_m2_effect BEGIN SELECT RAISE(ABORT, 'effect reservation is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_event_fingerprint_immutable_update
        BEFORE UPDATE ON wendy_m2_event_fingerprint BEGIN SELECT RAISE(ABORT, 'event fingerprint reservation is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_event_fingerprint_immutable_delete
        BEFORE DELETE ON wendy_m2_event_fingerprint BEGIN SELECT RAISE(ABORT, 'event fingerprint reservation is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_source_claim_immutable_update
        BEFORE UPDATE ON wendy_m2_source_claim BEGIN SELECT RAISE(ABORT, 'source claim is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_source_claim_immutable_delete
        BEFORE DELETE ON wendy_m2_source_claim BEGIN SELECT RAISE(ABORT, 'source claim is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_correction_immutable_update
        BEFORE UPDATE ON wendy_m2_correction_case BEGIN SELECT RAISE(ABORT, 'correction case is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_correction_immutable_delete
        BEFORE DELETE ON wendy_m2_correction_case BEGIN SELECT RAISE(ABORT, 'correction case is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_audit_immutable_update
        BEFORE UPDATE ON wendy_m2_audit BEGIN SELECT RAISE(ABORT, 'audit record is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_audit_immutable_delete
        BEFORE DELETE ON wendy_m2_audit BEGIN SELECT RAISE(ABORT, 'audit record is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_reversal_immutable_update
        BEFORE UPDATE ON wendy_m2_reversal BEGIN SELECT RAISE(ABORT, 'reversal link is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_reversal_immutable_delete
        BEFORE DELETE ON wendy_m2_reversal BEGIN SELECT RAISE(ABORT, 'reversal link is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_consumed_decision_immutable_update
        BEFORE UPDATE ON wendy_m2_consumed_decision_provenance BEGIN SELECT RAISE(ABORT, 'consumed decision provenance is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_consumed_decision_immutable_delete
        BEFORE DELETE ON wendy_m2_consumed_decision_provenance BEGIN SELECT RAISE(ABORT, 'consumed decision provenance is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_trusted_authorization_immutable_update
        BEFORE UPDATE ON wendy_m2_trusted_authorization BEGIN SELECT RAISE(ABORT, 'trusted authorization decision is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_trusted_authorization_immutable_delete
        BEFORE DELETE ON wendy_m2_trusted_authorization BEGIN SELECT RAISE(ABORT, 'trusted authorization decision is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_trusted_tax_impact_immutable_update
        BEFORE UPDATE ON wendy_m2_trusted_tax_impact BEGIN SELECT RAISE(ABORT, 'trusted T-01 decision is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_trusted_tax_impact_immutable_delete
        BEFORE DELETE ON wendy_m2_trusted_tax_impact BEGIN SELECT RAISE(ABORT, 'trusted T-01 decision is immutable'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_reversal_shape
        BEFORE INSERT ON wendy_m2_reversal
        WHEN (SELECT json_extract(record_json, '$.journal_kind') FROM wendy_m2_journal WHERE journal_entry_id = NEW.original_journal_entry_id) <> 'ORIGINAL'
          OR (SELECT json_extract(record_json, '$.journal_kind') FROM wendy_m2_journal WHERE journal_entry_id = NEW.reversal_journal_entry_id) <> 'REVERSAL'
          OR (SELECT original_journal_entry_id FROM wendy_m2_journal WHERE journal_entry_id = NEW.reversal_journal_entry_id) <> NEW.original_journal_entry_id
        BEGIN SELECT RAISE(ABORT, 'reversal link must bind one original and its exact reversal Journal'); END;
      CREATE TRIGGER IF NOT EXISTS wendy_m2_correction_chain_shape
        BEFORE INSERT ON wendy_m2_correction_case
        WHEN (SELECT organization_id FROM wendy_m2_reversal WHERE organization_id = NEW.organization_id AND original_journal_entry_id = NEW.original_journal_entry_id AND reversal_journal_entry_id = NEW.reversal_journal_entry_id) IS NULL
          OR (SELECT json_extract(record_json, '$.journal_kind') FROM wendy_m2_journal WHERE journal_entry_id = NEW.corrected_replacement_journal_entry_id) <> 'CORRECTED_REPLACEMENT'
        BEGIN SELECT RAISE(ABORT, 'correction case must bind its persisted reversal and replacement Journals'); END;
    `);
  }

  async serializable<T>(work: (transaction: LedgerTransaction) => Promise<T> | T): Promise<T> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const failure = this.#failureAtWrite;
      this.#failureAtWrite = null;
      const result = work(new SqliteLedgerTransaction(this.database, failure));
      if (result instanceof Promise) throw new Error("SQLite Ledger transaction callback must be synchronous");
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async replacePeriod(period: AccountingPeriod): Promise<void> {
    await this.serializable((transaction) => transaction.putPeriod(period));
  }

  /** Deterministic test hook for atomic rollback coverage of every mandatory write. */
  failAtMandatoryWrite(writeNumber: number): void { this.#failureAtWrite = writeNumber; }

  schemaVersion(): number {
    const row = this.database.prepare("SELECT schema_version FROM wendy_m2_schema_metadata WHERE schema_key = 'wendy_m2'").get() as { readonly schema_version: number };
    return row.schema_version;
  }

  snapshot(): Readonly<{ readonly journals: readonly PostedJournal[]; readonly idempotency: readonly IdempotencyRecord[]; readonly corrections: readonly CorrectionCase[]; readonly audits: readonly M2AuditRecord[]; readonly consumed_decisions: readonly ConsumedDecisionProvenance[]; readonly diagnostics: readonly FingerprintCollisionDiagnostic[] }> {
    const records = <T>(table: string): readonly T[] => this.database.prepare(`SELECT record_json FROM ${table} ORDER BY rowid`).all().map((row) => parse<T>((row as { readonly record_json: string }).record_json));
    return deepFreeze({ journals: records<PostedJournal>("wendy_m2_journal"), idempotency: records<IdempotencyRecord>("wendy_m2_idempotency"), corrections: records<CorrectionCase>("wendy_m2_correction_case"), audits: records<M2AuditRecord>("wendy_m2_audit"), consumed_decisions: records<ConsumedDecisionProvenance>("wendy_m2_consumed_decision_provenance"), diagnostics: records<FingerprintCollisionDiagnostic>("wendy_m2_fingerprint_diagnostic") });
  }

  close(): void { this.database.close(); }
}

class SqliteLedgerTransaction implements LedgerTransaction {
  #writeCount = 0;
  private readonly database: DatabaseSync;
  private readonly failureAtWrite: number | null;
  constructor(privateDatabase: DatabaseSync, failureAtWrite: number | null) {
    this.database = privateDatabase;
    this.failureAtWrite = failureAtWrite;
  }

  private write(): void {
    this.#writeCount += 1;
    if (this.failureAtWrite === this.#writeCount) throw new M2ContractError("INFRASTRUCTURE_FAILURE", "injected SQLite mandatory-write failure", "SQLITE_MANDATORY_WRITE_FAILED");
  }

  getIdempotency(organization_id: IdempotencyRecord["organization_id"], operation: string, key: IdempotencyRecord["idempotency_key"]): IdempotencyRecord | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m2_idempotency WHERE organization_id = ? AND operation = ? AND idempotency_key = ?").get(organization_id, operation, key) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<IdempotencyRecord>(row.record_json);
  }
  putIdempotency(record: IdempotencyRecord): void {
    this.write();
    this.database.prepare("INSERT INTO wendy_m2_idempotency (organization_id, operation, idempotency_key, record_json) VALUES (?, ?, ?, ?) ON CONFLICT(organization_id, operation, idempotency_key) DO UPDATE SET record_json = excluded.record_json").run(record.organization_id, record.operation, record.idempotency_key, json(record));
  }
  getEffect(organization_id: EffectReservation["organization_id"], fingerprint: EffectReservation["fingerprint"]): EffectReservation | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m2_effect WHERE organization_id = ? AND effect_fingerprint_contract = ? AND financial_effect_fingerprint = ?").get(organization_id, "wendy.paid-expense-effect-fingerprint/1.0.0", fingerprint) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<EffectReservation>(row.record_json);
  }
  putEffect(record: EffectReservation): void {
    this.write();
    this.database.prepare("INSERT INTO wendy_m2_effect (organization_id, effect_fingerprint_contract, financial_effect_fingerprint, journal_entry_id, record_json) VALUES (?, ?, ?, ?, ?)").run(record.organization_id, record.contract_version, record.fingerprint, record.journal_entry_id, json(record));
  }
  getEventFingerprint(organization_id: EventFingerprintReservation["organization_id"], fingerprint: EventFingerprintReservation["fingerprint"]): EventFingerprintReservation | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m2_event_fingerprint WHERE organization_id = ? AND event_fingerprint_contract = ? AND event_fingerprint = ?").get(organization_id, "wendy.financial-event-fingerprint/1.0.0", fingerprint) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<EventFingerprintReservation>(row.record_json);
  }
  putEventFingerprint(record: EventFingerprintReservation): void {
    this.write();
    this.database.prepare("INSERT INTO wendy_m2_event_fingerprint (organization_id, event_fingerprint_contract, event_fingerprint, record_json) VALUES (?, ?, ?, ?)").run(record.organization_id, "wendy.financial-event-fingerprint/1.0.0", record.fingerprint, json(record));
  }
  putFingerprintDiagnostic(record: FingerprintCollisionDiagnostic): void { this.write(); this.database.prepare("INSERT INTO wendy_m2_fingerprint_diagnostic (diagnostic_id, organization_id, record_json) VALUES (?, ?, ?)").run(record.diagnostic_id, record.organization_id, json(record)); }
  getSourceClaim(organization_id: EffectReservation["organization_id"], tuple: string): { readonly organization_id: EffectReservation["organization_id"]; readonly source_tuple: string; readonly effect_fingerprint: EffectReservation["fingerprint"] } | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m2_source_claim WHERE organization_id = ? AND source_tuple = ?").get(organization_id, tuple) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<{ readonly organization_id: EffectReservation["organization_id"]; readonly source_tuple: string; readonly effect_fingerprint: EffectReservation["fingerprint"] }>(row.record_json);
  }
  putSourceClaim(record: { readonly organization_id: EffectReservation["organization_id"]; readonly source_tuple: string; readonly effect_fingerprint: EffectReservation["fingerprint"] }): void {
    this.write();
    this.database.prepare("INSERT INTO wendy_m2_source_claim (organization_id, source_tuple, effect_fingerprint_contract, financial_effect_fingerprint, record_json) VALUES (?, ?, ?, ?, ?)").run(record.organization_id, record.source_tuple, "wendy.paid-expense-effect-fingerprint/1.0.0", record.effect_fingerprint, json(record));
  }
  getPeriod(period_id: string): AccountingPeriod | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m2_period WHERE accounting_period_id = ?").get(period_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<AccountingPeriod>(row.record_json);
  }
  putPeriod(period: AccountingPeriod): void { this.write(); this.database.prepare("INSERT INTO wendy_m2_period (accounting_period_id, organization_id, record_json) VALUES (?, ?, ?) ON CONFLICT(accounting_period_id) DO UPDATE SET organization_id = excluded.organization_id, record_json = excluded.record_json").run(period.accounting_period_id, period.organization_id, json(period)); }
  putJournal(journal: PostedJournal): void { this.write(); this.database.prepare("INSERT INTO wendy_m2_journal (journal_entry_id, organization_id, original_journal_entry_id, record_json) VALUES (?, ?, ?, ?)").run(journal.journal_entry_id, journal.organization_id, journal.original_journal_entry_id, json(journal)); }
  getJournal(journal_id: PostedJournal["journal_entry_id"]): PostedJournal | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m2_journal WHERE journal_entry_id = ?").get(journal_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<PostedJournal>(row.record_json);
  }
  getReversal(original_journal_id: PostedJournal["journal_entry_id"]): PostedJournal["journal_entry_id"] | undefined {
    const row = this.database.prepare("SELECT reversal_journal_entry_id FROM wendy_m2_reversal WHERE original_journal_entry_id = ?").get(original_journal_id) as { readonly reversal_journal_entry_id: PostedJournal["journal_entry_id"] } | undefined;
    return row?.reversal_journal_entry_id;
  }
  putReversal(original_journal_id: PostedJournal["journal_entry_id"], reversal_journal_id: PostedJournal["journal_entry_id"]): void {
    this.write();
    const original = this.database.prepare("SELECT organization_id FROM wendy_m2_journal WHERE journal_entry_id = ?").get(original_journal_id) as { readonly organization_id: string } | undefined;
    const reversal = this.database.prepare("SELECT organization_id FROM wendy_m2_journal WHERE journal_entry_id = ?").get(reversal_journal_id) as { readonly organization_id: string } | undefined;
    if (original === undefined || reversal === undefined || original.organization_id !== reversal.organization_id) throw new Error("reversal link must join two persisted Journals in one organization");
    this.database.prepare("INSERT INTO wendy_m2_reversal (organization_id, original_journal_entry_id, reversal_journal_entry_id) VALUES (?, ?, ?)").run(original.organization_id, original_journal_id, reversal_journal_id);
  }
  putCorrection(correction: CorrectionCase): void {
    this.write();
    this.database.prepare("INSERT INTO wendy_m2_correction_case (correction_case_id, organization_id, original_journal_entry_id, reversal_journal_entry_id, corrected_replacement_journal_entry_id, record_json) VALUES (?, ?, ?, ?, ?, ?)").run(correction.correction_case_id, correction.organization_id, correction.original_journal_entry_id, correction.reversal_journal_entry_id, correction.corrected_replacement_journal_entry_id, json(correction));
  }
  putAudit(audit: M2AuditRecord): void { this.write(); this.database.prepare("INSERT INTO wendy_m2_audit (audit_id, organization_id, record_json) VALUES (?, ?, ?)").run(audit.audit_id, audit.organization_id, json(audit)); }
  getConsumedDecisionProvenance(journal_entry_id: PostedJournal["journal_entry_id"]): ConsumedDecisionProvenance | undefined {
    const row = this.database.prepare("SELECT record_json FROM wendy_m2_consumed_decision_provenance WHERE journal_entry_id = ?").get(journal_entry_id) as { readonly record_json: string } | undefined;
    return row === undefined ? undefined : parse<ConsumedDecisionProvenance>(row.record_json);
  }
  putConsumedDecisionProvenance(provenance: ConsumedDecisionProvenance): void { this.write(); this.database.prepare("INSERT INTO wendy_m2_consumed_decision_provenance (provenance_id, organization_id, journal_entry_id, record_json) VALUES (?, ?, ?, ?)").run(provenance.provenance_id, provenance.organization_id, provenance.journal_entry_id, json(provenance)); }
}
