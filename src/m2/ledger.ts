import { WendyDomainError } from "../domain/common/errors.ts";
import type { ContentHash, IdempotencyKey, OrganizationId, Uuid } from "../domain/common/ids.ts";
import type { AccountingPeriod } from "../domain/periods/periods.ts";
import type { ActorRef } from "../domain/organizations/organization.ts";
import { createEventRelationship } from "../domain/events/financial-event.ts";

import { deepFreeze, newM2Uuid, sha256Canonical } from "./canonical.ts";
import { assertAuthorizationDecisionAllowed, assertLedgerServiceCapability } from "./authorization.ts";
import {
  ENGINEERING_CONTRACT_VERSION,
  PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION,
  PAID_EXPENSE_RULE_ID,
  PAID_EXPENSE_RULE_VERSION,
  type AuthorizationDecision,
  type CapabilityGrant,
  type CorrectionCase,
  type CorrectionPostingCommand,
  type JournalDraft,
  type M2AuditRecord,
  type OriginalPostingCommand,
  type PaidExpensePair,
  type PostedJournal,
  type PostingResult,
  type TaxImpactEligibilityConsumption,
} from "./contracts.ts";
import { M2ContractError } from "./errors.ts";
import { canonicalRequestInputHash, validatePaidExpensePair, type ValidatedPaidExpensePair } from "./fingerprints.ts";
import { buildPaidExpenseJournalDraft, exactFullReversalLines } from "./journal.ts";
import { resolveCategoryAccount, resolvePaymentSourceAccount } from "./mapping.ts";
import { revalidatePeriodAuthorization } from "./period.ts";
import { validateTaxImpactEligibility } from "./tax-impact.ts";

type IdempotencyState = "IN_PROGRESS" | "TERMINAL" | "UNKNOWN_OUTCOME";

export interface IdempotencyRecord {
  readonly organization_id: OrganizationId;
  readonly operation: string;
  readonly idempotency_key: IdempotencyKey;
  readonly namespace: string;
  readonly owner_actor_id: ActorRef["actor_id"];
  readonly canonical_request_input_hash: ContentHash;
  readonly state: IdempotencyState;
  readonly result: PostingResult | null;
  readonly created_at: string;
  readonly completed_at: string | null;
}

export interface EffectReservation {
  readonly organization_id: OrganizationId;
  readonly contract_version: typeof PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION;
  readonly fingerprint: ContentHash;
  readonly canonical_preimage: string;
  readonly journal_entry_id: Uuid;
  readonly result: PostingResult;
}

export interface EventFingerprintReservation {
  readonly organization_id: OrganizationId;
  readonly fingerprint: ContentHash;
  readonly canonical_preimage: string;
}

export interface FingerprintCollisionDiagnostic {
  readonly diagnostic_id: Uuid;
  readonly organization_id: OrganizationId;
  readonly fingerprint_contract: string;
  readonly fingerprint: ContentHash;
  readonly existing_preimage: string;
  readonly incoming_preimage: string;
  readonly recorded_at: string;
}

interface SourceClaim {
  readonly organization_id: OrganizationId;
  readonly source_tuple: string;
  readonly effect_fingerprint: ContentHash;
}

interface LedgerState {
  readonly idempotency: Map<string, IdempotencyRecord>;
  readonly effects: Map<string, EffectReservation>;
  readonly event_fingerprints: Map<string, EventFingerprintReservation>;
  readonly fingerprint_diagnostics: Map<string, FingerprintCollisionDiagnostic>;
  readonly source_claims: Map<string, SourceClaim>;
  readonly journals: Map<string, PostedJournal>;
  readonly reversals: Map<string, Uuid>;
  readonly corrections: Map<string, CorrectionCase>;
  readonly audits: Map<string, M2AuditRecord>;
  readonly periods: Map<string, AccountingPeriod>;
}

function emptyState(): LedgerState {
  return {
    idempotency: new Map(), effects: new Map(), event_fingerprints: new Map(), fingerprint_diagnostics: new Map(), source_claims: new Map(), journals: new Map(), reversals: new Map(), corrections: new Map(), audits: new Map(), periods: new Map(),
  };
}

function cloneState(state: LedgerState): LedgerState {
  return {
    idempotency: new Map(state.idempotency), effects: new Map(state.effects), event_fingerprints: new Map(state.event_fingerprints), fingerprint_diagnostics: new Map(state.fingerprint_diagnostics), source_claims: new Map(state.source_claims), journals: new Map(state.journals), reversals: new Map(state.reversals), corrections: new Map(state.corrections), audits: new Map(state.audits), periods: new Map(state.periods),
  };
}

function idempotencyStorageKey(organization_id: OrganizationId, operation: string, key: IdempotencyKey): string {
  return `${organization_id}:${operation}:${key}`;
}

function effectStorageKey(organization_id: OrganizationId, fingerprint: ContentHash): string {
  return `${organization_id}:${PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION}:${fingerprint}`;
}

function eventFingerprintStorageKey(organization_id: OrganizationId, fingerprint: ContentHash): string {
  return `${organization_id}:wendy.financial-event-fingerprint/1.0.0:${fingerprint}`;
}

function sourceStorageKey(organization_id: OrganizationId, tuple: string): string {
  return `${organization_id}:${tuple}`;
}

export interface LedgerTransaction {
  getIdempotency(organization_id: OrganizationId, operation: string, key: IdempotencyKey): IdempotencyRecord | undefined;
  putIdempotency(record: IdempotencyRecord): void;
  getEffect(organization_id: OrganizationId, fingerprint: ContentHash): EffectReservation | undefined;
  putEffect(reservation: EffectReservation): void;
  getEventFingerprint(organization_id: OrganizationId, fingerprint: ContentHash): EventFingerprintReservation | undefined;
  putEventFingerprint(reservation: EventFingerprintReservation): void;
  putFingerprintDiagnostic(diagnostic: FingerprintCollisionDiagnostic): void;
  getSourceClaim(organization_id: OrganizationId, tuple: string): SourceClaim | undefined;
  putSourceClaim(claim: SourceClaim): void;
  getPeriod(period_id: string): AccountingPeriod | undefined;
  putPeriod(period: AccountingPeriod): void;
  putJournal(journal: PostedJournal): void;
  getJournal(journal_id: Uuid): PostedJournal | undefined;
  getReversal(original_journal_id: Uuid): Uuid | undefined;
  putReversal(original_journal_id: Uuid, reversal_journal_id: Uuid): void;
  putCorrection(correction: CorrectionCase): void;
  putAudit(audit: M2AuditRecord): void;
}

/** Storage port: implementations must provide a serializable transaction and the frozen unique identities. */
export interface SerializableLedgerStore {
  serializable<T>(work: (transaction: LedgerTransaction) => Promise<T> | T): Promise<T>;
}

class MemoryLedgerTransaction implements LedgerTransaction {
  #writeCount = 0;
  private readonly state: LedgerState;
  private readonly failureAtWrite: number | null;

  constructor(state: LedgerState, failureAtWrite: number | null) {
    this.state = state;
    this.failureAtWrite = failureAtWrite;
  }

  private write(): void {
    this.#writeCount += 1;
    if (this.failureAtWrite === this.#writeCount) throw new M2ContractError("INFRASTRUCTURE_FAILURE", "injected mandatory-write failure", "MANDATORY_WRITE_FAILED");
  }

  getIdempotency(organization_id: OrganizationId, operation: string, key: IdempotencyKey): IdempotencyRecord | undefined { return this.state.idempotency.get(idempotencyStorageKey(organization_id, operation, key)); }
  putIdempotency(record: IdempotencyRecord): void {
    this.write();
    const key = idempotencyStorageKey(record.organization_id, record.operation, record.idempotency_key);
    const existing = this.state.idempotency.get(key);
    if (existing !== undefined && (existing.state !== "IN_PROGRESS" || !["TERMINAL", "UNKNOWN_OUTCOME"].includes(record.state) || existing.owner_actor_id !== record.owner_actor_id || existing.canonical_request_input_hash !== record.canonical_request_input_hash)) {
      throw new M2ContractError("M2_CONTRACT_VIOLATION", "idempotency records are immutable except for their terminal transition", "IDEMPOTENCY_RECORD_IMMUTABLE");
    }
    this.state.idempotency.set(key, deepFreeze(record));
  }
  getEffect(organization_id: OrganizationId, fingerprint: ContentHash): EffectReservation | undefined { return this.state.effects.get(effectStorageKey(organization_id, fingerprint)); }
  putEffect(reservation: EffectReservation): void {
    this.write();
    const key = effectStorageKey(reservation.organization_id, reservation.fingerprint);
    if (this.state.effects.has(key)) throw new M2ContractError("M2_CONTRACT_VIOLATION", "financial-effect reservation already exists", "EFFECT_RESERVATION_IMMUTABLE");
    this.state.effects.set(key, deepFreeze(reservation));
  }
  getEventFingerprint(organization_id: OrganizationId, fingerprint: ContentHash): EventFingerprintReservation | undefined { return this.state.event_fingerprints.get(eventFingerprintStorageKey(organization_id, fingerprint)); }
  putEventFingerprint(reservation: EventFingerprintReservation): void {
    this.write();
    const key = eventFingerprintStorageKey(reservation.organization_id, reservation.fingerprint);
    if (this.state.event_fingerprints.has(key)) throw new M2ContractError("M2_CONTRACT_VIOLATION", "event fingerprint reservation already exists", "EVENT_FINGERPRINT_RESERVATION_IMMUTABLE");
    this.state.event_fingerprints.set(key, deepFreeze(reservation));
  }
  putFingerprintDiagnostic(diagnostic: FingerprintCollisionDiagnostic): void { this.write(); this.state.fingerprint_diagnostics.set(diagnostic.diagnostic_id, deepFreeze(diagnostic)); }
  getSourceClaim(organization_id: OrganizationId, tuple: string): SourceClaim | undefined { return this.state.source_claims.get(sourceStorageKey(organization_id, tuple)); }
  putSourceClaim(claim: SourceClaim): void {
    this.write();
    const key = sourceStorageKey(claim.organization_id, claim.source_tuple);
    if (this.state.source_claims.has(key)) throw new M2ContractError("M2_CONTRACT_VIOLATION", "source claim already exists", "SOURCE_CLAIM_IMMUTABLE");
    this.state.source_claims.set(key, deepFreeze(claim));
  }
  getPeriod(period_id: string): AccountingPeriod | undefined { return this.state.periods.get(period_id); }
  putPeriod(period: AccountingPeriod): void { this.state.periods.set(period.accounting_period_id, deepFreeze(period)); }
  putJournal(journal: PostedJournal): void {
    this.write();
    if (this.state.journals.has(journal.journal_entry_id)) throw new M2ContractError("IMMUTABLE_HISTORY", "posted Journal already exists", "POSTED_JOURNAL_IMMUTABLE");
    this.state.journals.set(journal.journal_entry_id, deepFreeze(journal));
  }
  getJournal(journal_id: Uuid): PostedJournal | undefined { return this.state.journals.get(journal_id); }
  getReversal(original_journal_id: Uuid): Uuid | undefined { return this.state.reversals.get(original_journal_id); }
  putReversal(original_journal_id: Uuid, reversal_journal_id: Uuid): void { this.write(); if (this.state.reversals.has(original_journal_id)) throw new M2ContractError("IMMUTABLE_HISTORY", "an original Journal already has a full reversal", "FULL_REVERSAL_ALREADY_EXISTS"); this.state.reversals.set(original_journal_id, reversal_journal_id); }
  putCorrection(correction: CorrectionCase): void {
    this.write();
    if (this.state.corrections.has(correction.correction_case_id)) throw new M2ContractError("IMMUTABLE_HISTORY", "correction case already exists", "CORRECTION_CASE_IMMUTABLE");
    this.state.corrections.set(correction.correction_case_id, deepFreeze(correction));
  }
  putAudit(audit: M2AuditRecord): void {
    this.write();
    if (this.state.audits.has(audit.audit_id)) throw new M2ContractError("IMMUTABLE_HISTORY", "audit record already exists", "AUDIT_RECORD_IMMUTABLE");
    this.state.audits.set(audit.audit_id, deepFreeze(audit));
  }
}

/**
 * Reference serializable storage adapter. It deliberately owns no business
 * policy; a production database adapter must implement the same transaction
 * and uniqueness semantics. The adapter copies then commits one immutable
 * state, so injected/pre-commit failures cannot leave a partial effect.
 */
export class InMemorySerializableLedgerStore implements SerializableLedgerStore {
  #state: LedgerState = emptyState();
  #tail: Promise<void> = Promise.resolve();
  #failureAtWrite: number | null = null;

  constructor(periods: readonly AccountingPeriod[] = []) {
    for (const period of periods) this.#state.periods.set(period.accounting_period_id, deepFreeze(period));
  }

  async serializable<T>(work: (transaction: LedgerTransaction) => Promise<T> | T): Promise<T> {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.#tail;
    this.#tail = previous.then(() => gate, () => gate);
    await previous.catch(() => undefined);
    const working = cloneState(this.#state);
    const failure = this.#failureAtWrite;
    this.#failureAtWrite = null;
    try {
      const result = await work(new MemoryLedgerTransaction(working, failure));
      this.#state = working;
      return result;
    } finally {
      release?.();
    }
  }

  /** Test-only fault injector proving that the transaction has no partial writes. */
  failAtMandatoryWrite(writeNumber: number): void { this.#failureAtWrite = writeNumber; }

  async replacePeriod(period: AccountingPeriod): Promise<void> {
    await this.serializable((transaction) => transaction.putPeriod(period));
  }

  snapshot(): Readonly<{ readonly journals: readonly PostedJournal[]; readonly effects: number; readonly idempotency: readonly IdempotencyRecord[]; readonly corrections: readonly CorrectionCase[]; readonly audits: readonly M2AuditRecord[]; readonly fingerprint_diagnostics: readonly FingerprintCollisionDiagnostic[] }> {
    return deepFreeze({ journals: [...this.#state.journals.values()], effects: this.#state.effects.size, idempotency: [...this.#state.idempotency.values()], corrections: [...this.#state.corrections.values()], audits: [...this.#state.audits.values()], fingerprint_diagnostics: [...this.#state.fingerprint_diagnostics.values()] });
  }
}

interface PreparedOriginal {
  readonly command: OriginalPostingCommand;
  readonly validated_pair: ValidatedPaidExpensePair;
  readonly draft: JournalDraft;
  readonly request_hash: ContentHash;
  readonly namespace: string;
}

function namespace(organization_id: OrganizationId, operation: string): string {
  return `wendy:${organization_id}:paid_expense:v1:${operation}`;
}

function eventRefs(pair: PaidExpensePair) {
  return [
    { event_id: pair.expense.event_id, event_version: pair.expense.event_version, event_type: "ExpenseRecognized" as const },
    { event_id: pair.payment.event_id, event_version: pair.payment.event_version, event_type: "PaymentMade" as const },
  ] as const;
}

function postingResult(input: {
  readonly organization_id: OrganizationId;
  readonly namespace: string;
  readonly idempotency_key: IdempotencyKey;
  readonly trace_id: OriginalPostingCommand["trace_id"] | CorrectionPostingCommand["trace_id"];
  readonly outcome: PostingResult["outcome"];
  readonly reason_codes: readonly string[];
  readonly effect?: ContentHash | null;
  readonly journal?: Uuid | null;
  readonly existing_result_ref?: string | null;
  readonly period_ref?: Uuid | null;
  readonly transaction_ref?: string | null;
}): PostingResult {
  return deepFreeze({
    contract_version: "wendy.paid-expense.posting-result/1.0.0",
    organization_id: input.organization_id,
    idempotency_namespace: input.namespace,
    idempotency_key: input.idempotency_key,
    outcome: input.outcome,
    financial_effect_fingerprint: input.effect ?? null,
    journal_entry_id: input.journal ?? null,
    existing_result_ref: input.existing_result_ref ?? null,
    review_case_ref: input.outcome === "REVIEW_REQUIRED" ? `review:${input.reason_codes[0] ?? "required"}` : null,
    period_authorization_ref: input.period_ref ?? null,
    reason_codes: Object.freeze([...input.reason_codes]),
    committed_transaction_ref: input.transaction_ref ?? null,
    trace_id: input.trace_id,
  });
}

function sourceTuples(pair: PaidExpensePair): readonly string[] {
  return [...pair.expense.source_refs, ...pair.payment.source_refs].map((source) => `${source.source_id}|${source.source_artifact_id}|${source.source_record_id ?? "<null>"}|${source.content_hash}`).sort();
}

function resultFromDomainError(error: unknown, command: OriginalPostingCommand, requestHash: ContentHash, operation = command.operation): PostingResult {
  const issue = error instanceof WendyDomainError ? error.error_code : error instanceof M2ContractError ? error.code : "INTERNAL_ERROR";
  const reason = error instanceof WendyDomainError ? error.rule_id ?? error.error_code : error instanceof M2ContractError ? error.reason_code : "UNEXPECTED_IMPLEMENTATION_ERROR";
  const outcome: PostingResult["outcome"] = issue === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : issue === "PERIOD_CLOSED" || issue === "PERIOD_LOCKED" ? "PERIOD_DENIED" : "REJECTED";
  return postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome, reason_codes: [reason, requestHash] });
}

function exactMapping<T extends { readonly mapping_id: Uuid; readonly account: { readonly account_id: string } }>(all: readonly T[], id: Uuid | null): T | undefined {
  return id === null ? undefined : all.find((mapping) => mapping.mapping_id === id);
}

export class LedgerPostingService {
  private readonly store: SerializableLedgerStore;
  private readonly ledger_service_actor: ActorRef;
  private readonly capability_grants: readonly CapabilityGrant[];

  constructor(
    store: SerializableLedgerStore,
    ledger_service_actor: ActorRef,
    capability_grants: readonly CapabilityGrant[],
  ) {
    this.store = store;
    this.ledger_service_actor = ledger_service_actor;
    this.capability_grants = capability_grants;
  }

  private assertLedgerWriter(organization_id: OrganizationId): void {
    try {
      assertLedgerServiceCapability(this.ledger_service_actor, organization_id, this.capability_grants);
    } catch {
      throw new M2ContractError("INVALID_LEDGER_WRITER", "only the server Ledger Posting Service may write posted Journals", "LEDGER_WRITER_NOT_AUTHORIZED");
    }
  }

  private assertRequesterCanSubmit(command: OriginalPostingCommand): void {
    const grant = this.capability_grants.find((candidate) => candidate.organization_id === command.organization_id && candidate.actor_id === command.requester.actor_id && candidate.membership_status === "ACTIVE" && candidate.capabilities.includes("PAID_EXPENSE_SUBMIT"));
    if (grant === undefined) throw new WendyDomainError("RULE_VIOLATION", "posting requester lacks an active server-side submit capability", { rule_id: "M2-AUTH-001" });
  }

  private assertAuthorizationBindsPair(command: OriginalPostingCommand): void {
    const audit = command.authorization.approval_control_audit;
    const expected = [...eventRefs(command.pair)].sort((left, right) => left.event_type.localeCompare(right.event_type));
    const actual = [...audit.affected_event_refs].sort((left, right) => left.event_type.localeCompare(right.event_type));
    const exact = actual.length === expected.length && actual.every((reference, index) => reference.event_id === expected[index]?.event_id && reference.event_version === expected[index]?.event_version && reference.event_type === expected[index]?.event_type);
    if (command.authorization.independent_approver_resolution.originator_actor_id !== command.requester.actor_id || !exact) {
      throw new WendyDomainError("RULE_VIOLATION", "posting authorization must bind the canonical requester and exact Financial Event versions", { rule_id: "M2-AUTH-002" });
    }
  }

  private prepare(command: OriginalPostingCommand): PreparedOriginal | PostingResult {
    const request_hash = canonicalRequestInputHash({
      organization_id: command.organization_id,
      operation: command.operation,
      actor_id: command.requester.actor_id,
      event_refs: eventRefs(command.pair),
      relationship_id: command.pair.fulfills_relationship.relationship_id,
      economic_group_id: command.pair.expense.economic_group_id,
      approval_decision_id: command.authorization.authorization_decision_id,
      period_authorization_id: command.period_authorization.period_authorization_decision_id,
      tax_decision_id: command.tax_impact_eligibility.tax_impact_eligibility_decision_id,
      accounting_rule_version: PAID_EXPENSE_RULE_VERSION,
      confirmation_audit_ref: command.confirmation_audit_ref,
      validation_result_ref: command.validation_result_ref,
    });
    try {
      this.assertLedgerWriter(command.organization_id);
      if (command.organization_id !== command.pair.expense.organization_id || command.organization_id !== command.pair.payment.organization_id || command.organization_id !== command.accounting_profile.organization_id || command.organization_id !== command.accounting_period.organization_id) throw new WendyDomainError("RULE_VIOLATION", "PAID_EXPENSE command crosses an organization boundary", { rule_id: "M2-ORG-001" });
      this.assertRequesterCanSubmit(command);
      assertAuthorizationDecisionAllowed(command.authorization, command.organization_id, ["POST_PAID_EXPENSE"]);
      this.assertAuthorizationBindsPair(command);
      const validated_pair = validatePaidExpensePair(command.pair);
      const tax = validateTaxImpactEligibility(command.tax_impact_eligibility, command.pair, this.capability_grants);
      if (!tax.allowed) return postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "REVIEW_REQUIRED", reason_codes: tax.reason_codes, effect: validated_pair.effect_fingerprint.value, period_ref: command.period_authorization.period_authorization_decision_id });
      const category_mapping = resolveCategoryAccount({ organization_id: command.organization_id, expense_category: command.pair.expense.payload.expense_category, effective_accounting_date: command.pair.expense.effective_date, mappings: command.category_mappings });
      const payment_source_mapping = resolvePaymentSourceAccount({ organization_id: command.organization_id, payment_source_id: command.pair.payment.payload.payment_source_ref.payment_source_id, payment_source_type: command.pair.payment.payload.payment_source_ref.source_type, effective_accounting_date: command.pair.expense.effective_date, mappings: command.payment_source_mappings });
      if (category_mapping.resolution !== "EXACTLY_ONE" || payment_source_mapping.resolution !== "EXACTLY_ONE") return postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "REVIEW_REQUIRED", reason_codes: [...category_mapping.reason_codes, ...payment_source_mapping.reason_codes], effect: validated_pair.effect_fingerprint.value, period_ref: command.period_authorization.period_authorization_decision_id });
      if (command.period_authorization.decision === "PERIOD_DENIED") return postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "PERIOD_DENIED", reason_codes: command.period_authorization.reason_codes, effect: validated_pair.effect_fingerprint.value, period_ref: command.period_authorization.period_authorization_decision_id });
      if (command.period_authorization.decision !== "POSTING_ALLOWED") return postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "REVIEW_REQUIRED", reason_codes: command.period_authorization.reason_codes, effect: validated_pair.effect_fingerprint.value, period_ref: command.period_authorization.period_authorization_decision_id });
      const category = exactMapping(command.category_mappings, category_mapping.mapping_id);
      const payment = exactMapping(command.payment_source_mappings, payment_source_mapping.mapping_id);
      if (category === undefined || payment === undefined) throw new WendyDomainError("REVIEW_REQUIRED", "exact mapping provenance cannot be reconstructed", { rule_id: "M2-MAP-005" });
      const draft = buildPaidExpenseJournalDraft({ pair: command.pair, effect_fingerprint: validated_pair.effect_fingerprint, category_mapping, payment_source_mapping, expense_account: category.account, cash_or_bank_account: payment.account, tax_decision: command.tax_impact_eligibility, authorization: command.authorization, period_authorization: command.period_authorization, validation_result_ref: command.validation_result_ref, confirmation_audit_ref: command.confirmation_audit_ref, trace_id: command.trace_id });
      return Object.freeze({ command, validated_pair, draft, request_hash, namespace: namespace(command.organization_id, command.operation) });
    } catch (error) {
      return resultFromDomainError(error, command, request_hash);
    }
  }

  private async persistTerminalNoEffect(command: OriginalPostingCommand, requestHash: ContentHash, result: PostingResult): Promise<PostingResult> {
    return this.store.serializable((transaction) => {
      const existing = transaction.getIdempotency(command.organization_id, command.operation, command.idempotency_key);
      if (existing !== undefined) return this.replayOrConflict(existing, command, requestHash);
      transaction.putIdempotency({ organization_id: command.organization_id, operation: command.operation, idempotency_key: command.idempotency_key, namespace: namespace(command.organization_id, command.operation), owner_actor_id: command.requester.actor_id, canonical_request_input_hash: requestHash, state: "TERMINAL", result, created_at: command.requested_at, completed_at: command.requested_at });
      return result;
    });
  }

  private replayOrConflict(existing: IdempotencyRecord, command: OriginalPostingCommand, requestHash: ContentHash): PostingResult {
    if (existing.owner_actor_id !== command.requester.actor_id || existing.canonical_request_input_hash !== requestHash) return postingResult({ organization_id: command.organization_id, namespace: existing.namespace, idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "REJECTED", reason_codes: ["IDEMPOTENCY_CONFLICT"] });
    if (existing.state === "IN_PROGRESS") return postingResult({ organization_id: command.organization_id, namespace: existing.namespace, idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "IN_PROGRESS", reason_codes: ["IDEMPOTENCY_IN_PROGRESS"] });
    if (existing.state === "UNKNOWN_OUTCOME") return postingResult({ organization_id: command.organization_id, namespace: existing.namespace, idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "UNKNOWN_OUTCOME", reason_codes: ["IDEMPOTENCY_UNKNOWN_OUTCOME"] });
    return existing.result!;
  }

  async post(command: OriginalPostingCommand): Promise<PostingResult> {
    // This boundary is intentionally outside result mapping: a human caller is
    // not a failed posting request; it is an invalid attempt to act as Ledger.
    this.assertLedgerWriter(command.organization_id);
    const prepared = this.prepare(command);
    if ("outcome" in prepared) {
      const requestHash = canonicalRequestInputHash({ organization_id: command.organization_id, operation: command.operation, actor_id: command.requester.actor_id, event_refs: eventRefs(command.pair), relationship_id: command.pair.fulfills_relationship.relationship_id, economic_group_id: command.pair.expense.economic_group_id, approval_decision_id: command.authorization.authorization_decision_id, period_authorization_id: command.period_authorization.period_authorization_decision_id, tax_decision_id: command.tax_impact_eligibility.tax_impact_eligibility_decision_id, accounting_rule_version: PAID_EXPENSE_RULE_VERSION, confirmation_audit_ref: command.confirmation_audit_ref, validation_result_ref: command.validation_result_ref });
      return this.persistTerminalNoEffect(command, requestHash, prepared);
    }
    return this.store.serializable((transaction) => this.postPrepared(transaction, prepared));
  }

  private postPrepared(transaction: LedgerTransaction, prepared: PreparedOriginal): PostingResult {
    const { command, request_hash, namespace: idempotency_namespace, draft, validated_pair } = prepared;
    const existing = transaction.getIdempotency(command.organization_id, command.operation, command.idempotency_key);
    if (existing !== undefined) return this.replayOrConflict(existing, command, request_hash);
    transaction.putIdempotency({ organization_id: command.organization_id, operation: command.operation, idempotency_key: command.idempotency_key, namespace: idempotency_namespace, owner_actor_id: command.requester.actor_id, canonical_request_input_hash: request_hash, state: "IN_PROGRESS", result: null, created_at: command.requested_at, completed_at: null });
    const currentPeriod = transaction.getPeriod(command.accounting_period.accounting_period_id);
    if (currentPeriod === undefined) return this.completeNoEffect(transaction, command, request_hash, postingResult({ organization_id: command.organization_id, namespace: idempotency_namespace, idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "PERIOD_DENIED", reason_codes: ["ACCOUNTING_PERIOD_NOT_FOUND"], effect: validated_pair.effect_fingerprint.value, period_ref: command.period_authorization.period_authorization_decision_id }));
    const revalidatedPeriod = revalidatePeriodAuthorization(command.period_authorization, currentPeriod);
    if (!revalidatedPeriod.allowed) return this.completeNoEffect(transaction, command, request_hash, postingResult({ organization_id: command.organization_id, namespace: idempotency_namespace, idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "PERIOD_DENIED", reason_codes: [revalidatedPeriod.reason_code], effect: validated_pair.effect_fingerprint.value, period_ref: command.period_authorization.period_authorization_decision_id }));
    for (const eventFingerprint of [validated_pair.expense_event_fingerprint, validated_pair.payment_event_fingerprint]) {
      const existingEventFingerprint = transaction.getEventFingerprint(command.organization_id, eventFingerprint.value);
      if (existingEventFingerprint !== undefined && existingEventFingerprint.canonical_preimage !== eventFingerprint.canonical_preimage) {
        return this.recordFingerprintCollision(transaction, command, request_hash, eventFingerprint.contract_version, eventFingerprint.value, existingEventFingerprint.canonical_preimage, eventFingerprint.canonical_preimage);
      }
    }
    const existingEffect = transaction.getEffect(command.organization_id, validated_pair.effect_fingerprint.value);
    if (existingEffect !== undefined) {
      if (existingEffect.canonical_preimage !== validated_pair.effect_fingerprint.canonical_preimage) return this.recordFingerprintCollision(transaction, command, request_hash, PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION, validated_pair.effect_fingerprint.value, existingEffect.canonical_preimage, validated_pair.effect_fingerprint.canonical_preimage);
      return this.completeNoEffect(transaction, command, request_hash, postingResult({ organization_id: command.organization_id, namespace: idempotency_namespace, idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "DUPLICATE", reason_codes: ["DUPLICATE_FINANCIAL_EFFECT"], effect: validated_pair.effect_fingerprint.value, journal: existingEffect.journal_entry_id, existing_result_ref: `posting-result:${existingEffect.journal_entry_id}` }));
    }
    for (const tuple of sourceTuples(command.pair)) {
      const claim = transaction.getSourceClaim(command.organization_id, tuple);
      if (claim !== undefined && claim.effect_fingerprint !== validated_pair.effect_fingerprint.value) return this.completeNoEffect(transaction, command, request_hash, postingResult({ organization_id: command.organization_id, namespace: idempotency_namespace, idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "REVIEW_REQUIRED", reason_codes: ["AUTHORITATIVE_SOURCE_COLLISION"], effect: validated_pair.effect_fingerprint.value }));
    }
    const journal_entry_id = newM2Uuid();
    const transaction_ref = `ledger-tx:${newM2Uuid()}`;
    const consumption: TaxImpactEligibilityConsumption = deepFreeze({ tax_impact_eligibility_decision_id: command.tax_impact_eligibility.tax_impact_eligibility_decision_id, decision_version: command.tax_impact_eligibility.decision_version, decision_provenance_hash: command.tax_impact_eligibility.decision_provenance_hash, organization_id: command.organization_id, economic_group_id: command.pair.expense.economic_group_id, event_refs: draft.event_refs, accounting_rule: draft.accounting_rule, journal_entry_id, consumed_at: command.requested_at, posting_transaction_ref: transaction_ref });
    const result = postingResult({ organization_id: command.organization_id, namespace: idempotency_namespace, idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "POSTED", reason_codes: ["POSTED_EXACTLY_ONCE"], effect: validated_pair.effect_fingerprint.value, journal: journal_entry_id, period_ref: command.period_authorization.period_authorization_decision_id, transaction_ref });
    const journal: PostedJournal = deepFreeze({ journal_entry_id, organization_id: command.organization_id, journal_kind: "ORIGINAL", original_journal_entry_id: null, immutable_draft: draft, committed_at: command.requested_at, committed_transaction_ref: transaction_ref, tax_impact_consumption: consumption });
    transaction.putEffect({ organization_id: command.organization_id, contract_version: PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION, fingerprint: validated_pair.effect_fingerprint.value, canonical_preimage: validated_pair.effect_fingerprint.canonical_preimage, journal_entry_id, result });
    transaction.putEventFingerprint({ organization_id: command.organization_id, fingerprint: validated_pair.expense_event_fingerprint.value, canonical_preimage: validated_pair.expense_event_fingerprint.canonical_preimage });
    transaction.putEventFingerprint({ organization_id: command.organization_id, fingerprint: validated_pair.payment_event_fingerprint.value, canonical_preimage: validated_pair.payment_event_fingerprint.canonical_preimage });
    for (const tuple of sourceTuples(command.pair)) transaction.putSourceClaim({ organization_id: command.organization_id, source_tuple: tuple, effect_fingerprint: validated_pair.effect_fingerprint.value });
    transaction.putJournal(journal);
    transaction.putAudit(this.audit(command.organization_id, "POST_PAID_EXPENSE", command.requester, command.request_id, command.trace_id, [journal_entry_id], command.requested_at));
    transaction.putIdempotency({ organization_id: command.organization_id, operation: command.operation, idempotency_key: command.idempotency_key, namespace: idempotency_namespace, owner_actor_id: command.requester.actor_id, canonical_request_input_hash: request_hash, state: "TERMINAL", result, created_at: command.requested_at, completed_at: command.requested_at });
    return result;
  }

  private completeNoEffect(transaction: LedgerTransaction, command: OriginalPostingCommand, requestHash: ContentHash, result: PostingResult): PostingResult {
    transaction.putIdempotency({ organization_id: command.organization_id, operation: command.operation, idempotency_key: command.idempotency_key, namespace: namespace(command.organization_id, command.operation), owner_actor_id: command.requester.actor_id, canonical_request_input_hash: requestHash, state: "TERMINAL", result, created_at: command.requested_at, completed_at: command.requested_at });
    return result;
  }

  private recordFingerprintCollision(
    transaction: LedgerTransaction,
    command: OriginalPostingCommand,
    requestHash: ContentHash,
    fingerprint_contract: string,
    fingerprint: ContentHash,
    existing_preimage: string,
    incoming_preimage: string,
  ): PostingResult {
    transaction.putFingerprintDiagnostic({ diagnostic_id: newM2Uuid(), organization_id: command.organization_id, fingerprint_contract, fingerprint, existing_preimage, incoming_preimage, recorded_at: command.requested_at });
    return this.completeNoEffect(transaction, command, requestHash, postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "REJECTED", reason_codes: ["FINGERPRINT_COLLISION"], effect: fingerprint }));
  }

  private audit(organization_id: OrganizationId, action: M2AuditRecord["action"], actor: ActorRef, source_request_id: OriginalPostingCommand["request_id"], trace_id: OriginalPostingCommand["trace_id"], journal_entry_ids: readonly Uuid[], created_at: string): M2AuditRecord {
    return deepFreeze({ audit_id: newM2Uuid(), organization_id, action, actor, source_request_id, trace_id, journal_entry_ids: Object.freeze([...journal_entry_ids]), created_at: created_at as M2AuditRecord["created_at"], immutable_payload_hash: sha256Canonical({ organization_id, action, actor_id: actor.actor_id, source_request_id, trace_id, journal_entry_ids, created_at }).hash });
  }

  async postCorrection(command: CorrectionPostingCommand): Promise<PostingResult> {
    this.assertLedgerWriter(command.organization_id);
    assertAuthorizationDecisionAllowed(command.authorization, command.organization_id, ["PAID_EXPENSE_CORRECTION", "POST_PAID_EXPENSE_CORRECTION"]);
    for (const relationship of command.correction_relationships) createEventRelationship(relationship);
    if (command.reason.trim().length === 0 || command.source_evidence_refs.length === 0 || command.correction_relationships.length === 0 || command.correction_relationships.some((relationship) => relationship.relationship_type !== "REVERSES" && relationship.relationship_type !== "SUPERSEDES") || command.reversal_period_authorization.requested_operation !== "REVERSAL" || command.replacement.period_authorization.requested_operation !== "CORRECTED_REPLACEMENT") {
      return postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "REJECTED", reason_codes: ["INVALID_CORRECTION_PROVENANCE"] });
    }
    const replacement = this.prepare(command.replacement);
    if ("outcome" in replacement) return postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: replacement.outcome, reason_codes: replacement.reason_codes });
    const correctionHash = sha256Canonical({ organization_id: command.organization_id, operation: command.operation, requester: command.requester.actor_id, original_journal_entry_id: command.original_journal_entry_id, replacement_effect: replacement.validated_pair.effect_fingerprint.value, reason: command.reason, approval_decision_id: command.authorization.authorization_decision_id }).hash;
    return this.store.serializable((transaction) => {
      const existing = transaction.getIdempotency(command.organization_id, command.operation, command.idempotency_key);
      if (existing !== undefined && existing.state !== "IN_PROGRESS") return this.replayOrConflict(existing, command.replacement, correctionHash);
      if (existing === undefined) transaction.putIdempotency({ organization_id: command.organization_id, operation: command.operation, idempotency_key: command.idempotency_key, namespace: namespace(command.organization_id, command.operation), owner_actor_id: command.requester.actor_id, canonical_request_input_hash: correctionHash, state: "IN_PROGRESS", result: null, created_at: command.requested_at, completed_at: null });
      if (existing !== undefined && (existing.owner_actor_id !== command.requester.actor_id || existing.canonical_request_input_hash !== correctionHash)) {
        return postingResult({ organization_id: command.organization_id, namespace: existing.namespace, idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "REJECTED", reason_codes: ["IDEMPOTENCY_CONFLICT"] });
      }
      const original = transaction.getJournal(command.original_journal_entry_id);
      if (original === undefined) {
        return postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "IN_PROGRESS", reason_codes: ["ORIGINAL_JOURNAL_NOT_COMMITTED"] });
      }
      if (original.organization_id !== command.organization_id || original.journal_kind !== "ORIGINAL") return this.completeCorrectionNoEffect(transaction, command, correctionHash, "REJECTED", ["ORIGINAL_JOURNAL_NOT_FOUND"]);
      if (transaction.getReversal(command.original_journal_entry_id) !== undefined) return this.completeCorrectionNoEffect(transaction, command, correctionHash, "REJECTED", ["FULL_REVERSAL_ALREADY_EXISTS"]);
      const originalEventIds = new Set(original.immutable_draft.event_refs.map((reference) => reference.event_id));
      const replacementEventIds = new Set(replacement.draft.event_refs.map((reference) => reference.event_id));
      if ([...replacementEventIds].some((eventId) => originalEventIds.has(eventId))) return this.completeCorrectionNoEffect(transaction, command, correctionHash, "REJECTED", ["CORRECTED_REPLACEMENT_EVENT_IDENTITY_NOT_NEW"]);
      const hasCorrectionBridge = command.correction_relationships.some((relationship) => relationship.organization_id === command.organization_id && replacementEventIds.has(relationship.from_event_id) && originalEventIds.has(relationship.to_event_id));
      if (!hasCorrectionBridge) return this.completeCorrectionNoEffect(transaction, command, correctionHash, "REJECTED", ["CORRECTION_EVENT_RELATIONSHIP_BINDING_INVALID"]);
      const reversalPeriod = transaction.getPeriod(command.reversal_accounting_period.accounting_period_id);
      const replacementPeriod = transaction.getPeriod(command.replacement.accounting_period.accounting_period_id);
      if (reversalPeriod === undefined || replacementPeriod === undefined) return this.completeCorrectionNoEffect(transaction, command, correctionHash, "PERIOD_DENIED", ["ACCOUNTING_PERIOD_NOT_FOUND"]);
      const reversalRecheck = revalidatePeriodAuthorization(command.reversal_period_authorization, reversalPeriod);
      const replacementRecheck = revalidatePeriodAuthorization(command.replacement.period_authorization, replacementPeriod);
      if (!reversalRecheck.allowed || !replacementRecheck.allowed) return this.completeCorrectionNoEffect(transaction, command, correctionHash, "PERIOD_DENIED", [!reversalRecheck.allowed ? reversalRecheck.reason_code : replacementRecheck.reason_code]);
      const existingReplacementIdempotency = transaction.getIdempotency(command.replacement.organization_id, command.replacement.operation, command.replacement.idempotency_key);
      if (existingReplacementIdempotency !== undefined) return this.completeCorrectionNoEffect(transaction, command, correctionHash, "REJECTED", ["REPLACEMENT_IDEMPOTENCY_ALREADY_USED"]);
      for (const eventFingerprint of [replacement.validated_pair.expense_event_fingerprint, replacement.validated_pair.payment_event_fingerprint]) {
        const existingEventFingerprint = transaction.getEventFingerprint(command.organization_id, eventFingerprint.value);
        if (existingEventFingerprint !== undefined && existingEventFingerprint.canonical_preimage !== eventFingerprint.canonical_preimage) {
          transaction.putFingerprintDiagnostic({ diagnostic_id: newM2Uuid(), organization_id: command.organization_id, fingerprint_contract: eventFingerprint.contract_version, fingerprint: eventFingerprint.value, existing_preimage: existingEventFingerprint.canonical_preimage, incoming_preimage: eventFingerprint.canonical_preimage, recorded_at: command.requested_at });
          return this.completeCorrectionNoEffect(transaction, command, correctionHash, "REJECTED", ["FINGERPRINT_COLLISION"]);
        }
      }
      const duplicateReplacement = transaction.getEffect(command.organization_id, replacement.validated_pair.effect_fingerprint.value);
      if (duplicateReplacement !== undefined) {
        if (duplicateReplacement.canonical_preimage !== replacement.validated_pair.effect_fingerprint.canonical_preimage) {
          transaction.putFingerprintDiagnostic({ diagnostic_id: newM2Uuid(), organization_id: command.organization_id, fingerprint_contract: PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION, fingerprint: replacement.validated_pair.effect_fingerprint.value, existing_preimage: duplicateReplacement.canonical_preimage, incoming_preimage: replacement.validated_pair.effect_fingerprint.canonical_preimage, recorded_at: command.requested_at });
          return this.completeCorrectionNoEffect(transaction, command, correctionHash, "REJECTED", ["FINGERPRINT_COLLISION"]);
        }
        return this.completeCorrectionNoEffect(transaction, command, correctionHash, "DUPLICATE", ["DUPLICATE_REPLACEMENT_EFFECT"], duplicateReplacement.journal_entry_id, duplicateReplacement.fingerprint);
      }
      for (const tuple of sourceTuples(command.replacement.pair)) {
        const claim = transaction.getSourceClaim(command.organization_id, tuple);
        if (claim !== undefined && claim.effect_fingerprint !== replacement.validated_pair.effect_fingerprint.value) return this.completeCorrectionNoEffect(transaction, command, correctionHash, "REVIEW_REQUIRED", ["AUTHORITATIVE_SOURCE_COLLISION"]);
      }
      transaction.putIdempotency({ organization_id: command.replacement.organization_id, operation: command.replacement.operation, idempotency_key: command.replacement.idempotency_key, namespace: namespace(command.replacement.organization_id, command.replacement.operation), owner_actor_id: command.replacement.requester.actor_id, canonical_request_input_hash: replacement.request_hash, state: "IN_PROGRESS", result: null, created_at: command.requested_at, completed_at: null });
      const reversalJournalId = newM2Uuid();
      const replacementJournalId = newM2Uuid();
      const transactionRef = `ledger-tx:${newM2Uuid()}`;
      const reversalDraft: JournalDraft = deepFreeze({ ...original.immutable_draft, journal_draft_id: newM2Uuid(), accounting_date: command.reversal_period_authorization.proposed_accounting_date, posting_date: command.reversal_period_authorization.proposed_posting_date, lines: exactFullReversalLines(original.immutable_draft), provenance: deepFreeze({ ...original.immutable_draft.provenance, period_authorization_ref: command.reversal_period_authorization.period_authorization_decision_id, authorization_decision_ref: command.authorization.authorization_decision_id }) });
      const replacementConsumption: TaxImpactEligibilityConsumption = deepFreeze({ tax_impact_eligibility_decision_id: command.replacement.tax_impact_eligibility.tax_impact_eligibility_decision_id, decision_version: command.replacement.tax_impact_eligibility.decision_version, decision_provenance_hash: command.replacement.tax_impact_eligibility.decision_provenance_hash, organization_id: command.organization_id, economic_group_id: command.replacement.pair.expense.economic_group_id, event_refs: replacement.draft.event_refs, accounting_rule: replacement.draft.accounting_rule, journal_entry_id: replacementJournalId, consumed_at: command.requested_at, posting_transaction_ref: transactionRef });
      const result = postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome: "POSTED", reason_codes: ["CORRECTION_POSTED_ATOMICALLY"], effect: replacement.validated_pair.effect_fingerprint.value, journal: replacementJournalId, period_ref: command.replacement.period_authorization.period_authorization_decision_id, transaction_ref: transactionRef });
      const reversalJournal: PostedJournal = deepFreeze({ journal_entry_id: reversalJournalId, organization_id: command.organization_id, journal_kind: "REVERSAL", original_journal_entry_id: original.journal_entry_id, immutable_draft: reversalDraft, committed_at: command.requested_at, committed_transaction_ref: transactionRef, tax_impact_consumption: original.tax_impact_consumption });
      const replacementJournal: PostedJournal = deepFreeze({ journal_entry_id: replacementJournalId, organization_id: command.organization_id, journal_kind: "CORRECTED_REPLACEMENT", original_journal_entry_id: null, immutable_draft: replacement.draft, committed_at: command.requested_at, committed_transaction_ref: transactionRef, tax_impact_consumption: replacementConsumption });
      const correction: CorrectionCase = deepFreeze({ contract_version: "wendy.paid-expense.correction-case/1.0.0", correction_case_id: newM2Uuid(), organization_id: command.organization_id, original_journal_entry_id: original.journal_entry_id, reversal_journal_entry_id: reversalJournalId, corrected_replacement_journal_entry_id: replacementJournalId, original_effect_fingerprint: original.immutable_draft.financial_effect_fingerprint.value, replacement_effect_fingerprint: replacement.validated_pair.effect_fingerprint.value, reason: command.reason, source_request_id: command.request_id, requester: command.requester, approval_decision_ref: command.authorization.authorization_decision_id, reversal_period_authorization_ref: command.reversal_period_authorization.period_authorization_decision_id, replacement_period_authorization_ref: command.replacement.period_authorization.period_authorization_decision_id, original_rule_mapping_provenance_ref: `draft:${original.immutable_draft.journal_draft_id}`, replacement_rule_mapping_provenance_ref: `draft:${replacement.draft.journal_draft_id}`, event_relationship_refs: Object.freeze(command.correction_relationships.map((relationship) => relationship.relationship_id)), created_at: command.requested_at });
      transaction.putEffect({ organization_id: command.organization_id, contract_version: PAID_EXPENSE_EFFECT_FINGERPRINT_VERSION, fingerprint: replacement.validated_pair.effect_fingerprint.value, canonical_preimage: replacement.validated_pair.effect_fingerprint.canonical_preimage, journal_entry_id: replacementJournalId, result });
      transaction.putEventFingerprint({ organization_id: command.organization_id, fingerprint: replacement.validated_pair.expense_event_fingerprint.value, canonical_preimage: replacement.validated_pair.expense_event_fingerprint.canonical_preimage });
      transaction.putEventFingerprint({ organization_id: command.organization_id, fingerprint: replacement.validated_pair.payment_event_fingerprint.value, canonical_preimage: replacement.validated_pair.payment_event_fingerprint.canonical_preimage });
      for (const tuple of sourceTuples(command.replacement.pair)) transaction.putSourceClaim({ organization_id: command.organization_id, source_tuple: tuple, effect_fingerprint: replacement.validated_pair.effect_fingerprint.value });
      transaction.putJournal(reversalJournal);
      transaction.putJournal(replacementJournal);
      transaction.putReversal(original.journal_entry_id, reversalJournalId);
      transaction.putCorrection(correction);
      transaction.putAudit(this.audit(command.organization_id, "POST_PAID_EXPENSE_CORRECTION", command.requester, command.request_id, command.trace_id, [original.journal_entry_id, reversalJournalId, replacementJournalId], command.requested_at));
      transaction.putIdempotency({ organization_id: command.replacement.organization_id, operation: command.replacement.operation, idempotency_key: command.replacement.idempotency_key, namespace: namespace(command.replacement.organization_id, command.replacement.operation), owner_actor_id: command.replacement.requester.actor_id, canonical_request_input_hash: replacement.request_hash, state: "TERMINAL", result: postingResult({ organization_id: command.replacement.organization_id, namespace: namespace(command.replacement.organization_id, command.replacement.operation), idempotency_key: command.replacement.idempotency_key, trace_id: command.replacement.trace_id, outcome: "POSTED", reason_codes: ["CORRECTED_REPLACEMENT_POSTED"], effect: replacement.validated_pair.effect_fingerprint.value, journal: replacementJournalId, period_ref: command.replacement.period_authorization.period_authorization_decision_id, transaction_ref: transactionRef }), created_at: command.requested_at, completed_at: command.requested_at });
      transaction.putIdempotency({ organization_id: command.organization_id, operation: command.operation, idempotency_key: command.idempotency_key, namespace: namespace(command.organization_id, command.operation), owner_actor_id: command.requester.actor_id, canonical_request_input_hash: correctionHash, state: "TERMINAL", result, created_at: command.requested_at, completed_at: command.requested_at });
      return result;
    });
  }

  private completeCorrectionNoEffect(transaction: LedgerTransaction, command: CorrectionPostingCommand, requestHash: ContentHash, outcome: PostingResult["outcome"], reason_codes: readonly string[], journal?: Uuid, effect?: ContentHash): PostingResult {
    const result = postingResult({ organization_id: command.organization_id, namespace: namespace(command.organization_id, command.operation), idempotency_key: command.idempotency_key, trace_id: command.trace_id, outcome, reason_codes, journal: journal ?? null, effect: effect ?? null, existing_result_ref: journal === undefined ? null : `posting-result:${journal}` });
    transaction.putIdempotency({ organization_id: command.organization_id, operation: command.operation, idempotency_key: command.idempotency_key, namespace: namespace(command.organization_id, command.operation), owner_actor_id: command.requester.actor_id, canonical_request_input_hash: requestHash, state: "TERMINAL", result, created_at: command.requested_at, completed_at: command.requested_at });
    return result;
  }
}
