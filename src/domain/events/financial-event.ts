import { WendyDomainError, requireArrayNotEmpty, requireNonEmpty, requirePositiveInteger } from "../common/errors.ts";
import type {
  CandidateId,
  ContentHash,
  EconomicGroupId,
  EventFingerprint,
  EventRelationshipId,
  FinancialEventId,
  IdempotencyKey,
  OrganizationId,
  PaymentSourceId,
  RuleVersion,
  SchemaVersion,
  SourceArtifactId,
  SourceId,
  TraceId,
  ValidationResultId,
  EvidenceId,
} from "../common/ids.ts";
import type { Money } from "../common/money.ts";
import { sameMoney } from "../common/money.ts";
import type { IsoDate, Rfc3339Timestamp } from "../common/time.ts";
import type { ActorRef } from "../organizations/organization.ts";
import type { ValidationDisposition } from "../contracts/engine.ts";

export const EVENT_DOMAINS = ["BUSINESS", "DOCUMENT", "PAYMENT", "SETTLEMENT", "TAX", "SOURCE", "CORRECTION", "CONTROL"] as const;
export const EVENT_STATUSES = ["DRAFT", "CANDIDATE", "REVIEW_REQUIRED", "VALIDATED", "CONFIRMED", "REJECTED", "REVERSED"] as const;
export const EVENT_RELATIONSHIP_TYPES = ["CAUSED_BY", "DERIVED_FROM", "FULFILLS", "SETTLES", "EVIDENCED_BY", "MATCHES", "TRIGGERS_TAX", "REVERSES", "ADJUSTS", "SUPERSEDES"] as const;
export const APPROVAL_LEVELS = ["AUTO_POST", "USER_CONFIRM", "ACCOUNTANT_OR_ADMIN_APPROVAL"] as const;
export const APPROVAL_STATUSES = ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const;
export const EXPENSE_CATEGORIES = ["MARKETING", "PAYROLL", "RENT", "UTILITIES", "PROFESSIONAL_FEES", "BANK_FEES", "GENERAL"] as const;

export type EventDomain = (typeof EVENT_DOMAINS)[number];
export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventRelationshipType = (typeof EVENT_RELATIONSHIP_TYPES)[number];
export type ApprovalLevel = (typeof APPROVAL_LEVELS)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type EvidenceType = "SOURCE_ARTIFACT" | "DOCUMENT" | "USER_CONFIRMATION" | "EXTERNAL_RECORD";
export type IdentificationStatus = "PROVIDED" | "RESOLVED" | "UNRESOLVED";
export type PaymentMethod = "BANK_TRANSFER" | "CASH";
export type PaymentSourceType = "BANK_ACCOUNT" | "CASH_ON_HAND";

export const PAID_EXPENSE_SCHEMA_VERSION = "wendy.financial-event.paid-expense/0.1.0" as SchemaVersion;

export interface SourceRef {
  readonly source_id: SourceId;
  readonly source_artifact_id: SourceArtifactId;
  readonly source_record_id: string | null;
  readonly content_hash: ContentHash;
}

export interface EvidenceRef {
  readonly evidence_id: EvidenceId;
  readonly evidence_type: EvidenceType;
  readonly content_hash: ContentHash | null;
}

export interface Approval {
  readonly required_level: ApprovalLevel;
  readonly status: ApprovalStatus;
  readonly candidate_hash: ContentHash;
  readonly decided_at: Rfc3339Timestamp | null;
  readonly decided_by: ActorRef | null;
}

export interface EventRelationship {
  readonly relationship_id: EventRelationshipId;
  readonly organization_id: OrganizationId;
  readonly from_event_id: FinancialEventId;
  readonly relationship_type: EventRelationshipType;
  readonly to_event_id: FinancialEventId;
  readonly created_at: Rfc3339Timestamp;
  readonly created_by: ActorRef;
}

export interface CounterpartyRef {
  readonly display_name: string;
  readonly counterparty_id: string | null;
  readonly identification_status: IdentificationStatus;
}

export interface TaxObservation {
  readonly vat_mentioned: boolean | null;
  readonly wht_mentioned: boolean | null;
  readonly stated_tax_amount: Money | null;
  readonly evidence_refs: readonly EvidenceRef[];
  readonly authority: "OBSERVATION_ONLY";
}

export interface AIProposal {
  readonly model_id: string;
  readonly model_version: string;
  readonly confidence_by_field: Readonly<Record<string, number>>;
  readonly output_hash: ContentHash;
}

export interface ExpenseRecognizedPayload {
  readonly expense_category: ExpenseCategory;
  readonly description: string;
  readonly recognition_basis: "IMMEDIATE_PAID_EXPENSE";
  readonly supplier: CounterpartyRef;
  readonly service_period?: { readonly start_date: IsoDate; readonly end_date: IsoDate };
  readonly document_reference?: { readonly document_number: string | null; readonly document_type: "RECEIPT" | "INVOICE" | "TAX_INVOICE" | "OTHER" | null };
  readonly tax_observations?: TaxObservation;
  readonly user_note?: string | null;
  readonly ai_proposal?: AIProposal;
}

export interface PaymentMadePayload {
  readonly payment_method: PaymentMethod;
  readonly payment_source_ref: {
    readonly payment_source_id: PaymentSourceId;
    readonly source_type: PaymentSourceType;
    readonly display_label: string;
  };
  readonly payee: CounterpartyRef;
  readonly payment_status: "COMPLETED";
  readonly external_payment_reference?: string | null;
  readonly bank_transaction_observation_ref?: string | null;
  readonly memo?: string | null;
  readonly ai_proposal?: AIProposal;
}

interface FinancialEventEnvelope<Payload> {
  readonly event_id: FinancialEventId;
  readonly organization_id: OrganizationId;
  readonly economic_group_id: EconomicGroupId;
  readonly event_domain: EventDomain;
  readonly event_type: "ExpenseRecognized" | "PaymentMade";
  readonly schema_version: SchemaVersion;
  readonly event_version: number;
  readonly status: EventStatus;
  readonly occurred_at: Rfc3339Timestamp;
  readonly effective_date: IsoDate;
  readonly accounting_date: IsoDate;
  readonly amount: Money;
  readonly payload: Payload;
  readonly source_refs: readonly SourceRef[];
  readonly evidence_refs: readonly EvidenceRef[];
  readonly related_event_refs: readonly EventRelationship[];
  readonly idempotency_key: IdempotencyKey;
  readonly event_fingerprint: EventFingerprint;
  readonly rule_context_version: RuleVersion;
  readonly approval: Approval;
  readonly created_at: Rfc3339Timestamp;
  readonly created_by: ActorRef;
  readonly document_date?: IsoDate | null;
  readonly payment_date?: IsoDate | null;
  readonly settlement_date?: IsoDate | null;
  readonly tax_point_date?: IsoDate | null;
  readonly reverses_event_id?: FinancialEventId | null;
  readonly adjusts_event_id?: FinancialEventId | null;
  readonly supersedes_event_id?: FinancialEventId | null;
  readonly extension?: Readonly<Record<string, unknown>> | null;
}

export interface ExpenseRecognizedEvent extends FinancialEventEnvelope<ExpenseRecognizedPayload> {
  readonly event_domain: "BUSINESS";
  readonly event_type: "ExpenseRecognized";
}

export interface PaymentMadeEvent extends FinancialEventEnvelope<PaymentMadePayload> {
  readonly event_domain: "PAYMENT";
  readonly event_type: "PaymentMade";
  readonly payment_date: IsoDate;
}

export type FinancialEvent = ExpenseRecognizedEvent | PaymentMadeEvent;

export interface ConfirmPaidExpense {
  readonly organization_id: OrganizationId;
  readonly candidate_id: CandidateId;
  readonly candidate_hash: ContentHash;
  readonly confirmed_by: ActorRef;
  readonly idempotency_key: IdempotencyKey;
  readonly expected_candidate_version: number;
}

export interface ConfirmedPaidExpense {
  readonly economic_group_id: EconomicGroupId;
  readonly expense_event_id: FinancialEventId;
  readonly payment_event_id: FinancialEventId;
  readonly relationship_id: EventRelationshipId;
  readonly validation_result_id: ValidationResultId;
  readonly confirmation_audit_ref: string;
}

export interface ValidationCheck {
  readonly rule_id: string;
  readonly outcome: "PASS" | "FAIL" | "NOT_APPLICABLE";
  readonly detail_code: string | null;
}

export interface ValidationResult {
  readonly validation_result_id: ValidationResultId;
  readonly organization_id: OrganizationId;
  readonly candidate_id: CandidateId;
  readonly candidate_hash: ContentHash;
  readonly schema_version: SchemaVersion;
  readonly ruleset_version: RuleVersion;
  readonly disposition: ValidationDisposition;
  readonly checks: readonly ValidationCheck[];
  readonly duplicate_of_economic_group_id: EconomicGroupId | null;
  readonly validated_at: Rfc3339Timestamp;
  readonly validator_service_version: string;
}

export interface FinancialEventStatusTransition {
  readonly event_id: FinancialEventId;
  readonly from_status: EventStatus;
  readonly to_status: EventStatus;
  readonly expected_event_version: number;
  readonly transitioned_at: Rfc3339Timestamp;
  readonly transitioned_by: ActorRef;
}

const EVENT_DOMAIN_SET: ReadonlySet<string> = new Set(EVENT_DOMAINS);
const EVENT_STATUS_SET: ReadonlySet<string> = new Set(EVENT_STATUSES);
const APPROVAL_LEVEL_SET: ReadonlySet<string> = new Set(APPROVAL_LEVELS);
const APPROVAL_STATUS_SET: ReadonlySet<string> = new Set(APPROVAL_STATUSES);
const EXPENSE_CATEGORY_SET: ReadonlySet<string> = new Set(EXPENSE_CATEGORIES);
const EVENT_RELATIONSHIP_TYPE_SET: ReadonlySet<string> = new Set(EVENT_RELATIONSHIP_TYPES);
const ALLOWED_EVENT_TRANSITIONS: ReadonlyMap<EventStatus, readonly EventStatus[]> = new Map([
  ["DRAFT", ["CANDIDATE"]],
  ["CANDIDATE", ["VALIDATED", "REJECTED"]],
  ["VALIDATED", ["CONFIRMED", "REVIEW_REQUIRED"]],
  ["REVIEW_REQUIRED", ["CONFIRMED"]],
]);

function assertCounterparty(value: CounterpartyRef, field: string): void {
  requireNonEmpty(value.display_name, `${field}.display_name`);
  if (value.identification_status !== "PROVIDED" && value.identification_status !== "RESOLVED" && value.identification_status !== "UNRESOLVED") {
    throw new WendyDomainError("INVALID_SCHEMA", `${field}.identification_status is invalid`, { field });
  }
}

function assertSourceRefs(source_refs: readonly SourceRef[]): void {
  requireArrayNotEmpty(source_refs, "source_refs");
  for (const source_ref of source_refs) {
    if (source_ref.source_record_id !== null && source_ref.source_record_id.trim().length === 0) {
      throw new WendyDomainError("INVALID_SCHEMA", "source_record_id must be null or non-empty", { field: "source_refs" });
    }
  }
}

function assertRelatedEventRefs(event: FinancialEventEnvelope<unknown>): void {
  for (const relationship of event.related_event_refs) {
    if (relationship.organization_id !== event.organization_id) {
      throw new WendyDomainError("RULE_VIOLATION", "related event relationship must share organization_id", {
        field: "related_event_refs",
        rule_id: "EVT-ORG-001",
      });
    }
    if (relationship.from_event_id !== event.event_id && relationship.to_event_id !== event.event_id) {
      throw new WendyDomainError("RULE_VIOLATION", "related event relationship must reference this event", {
        field: "related_event_refs",
        rule_id: "LINK-002",
      });
    }
  }
}

function assertCorrectionTargets(event: FinancialEventEnvelope<unknown>): void {
  const correction_refs = [event.reverses_event_id, event.adjusts_event_id, event.supersedes_event_id].filter((value) => value !== undefined && value !== null);
  if (correction_refs.length > 1) {
    throw new WendyDomainError("RULE_VIOLATION", "only one correction reference may be present", { field: "correction", rule_id: "EVT-CORE-005" });
  }
}

export function createEventRelationship(input: EventRelationship): EventRelationship {
  if (!EVENT_RELATIONSHIP_TYPE_SET.has(input.relationship_type)) {
    throw new WendyDomainError("INVALID_SCHEMA", "relationship_type is invalid", { field: "relationship_type" });
  }
  if (input.from_event_id === input.to_event_id) {
    throw new WendyDomainError("RULE_VIOLATION", "relationship endpoints must not self-reference", { rule_id: "LINK-002" });
  }
  return Object.freeze({ ...input });
}

export function createFinancialEvent(input: ExpenseRecognizedEvent): ExpenseRecognizedEvent;
export function createFinancialEvent(input: PaymentMadeEvent): PaymentMadeEvent;
export function createFinancialEvent(input: FinancialEvent): FinancialEvent;
export function createFinancialEvent(input: FinancialEvent): FinancialEvent {
  if (!EVENT_DOMAIN_SET.has(input.event_domain) || !EVENT_STATUS_SET.has(input.status)) {
    throw new WendyDomainError("INVALID_SCHEMA", "event_domain or status is invalid", { rule_id: "EVT-CORE-003" });
  }
  if (input.schema_version !== PAID_EXPENSE_SCHEMA_VERSION) {
    throw new WendyDomainError("INVALID_SCHEMA", "schema_version is not the paid-expense v0.1 contract", { field: "schema_version", rule_id: "EVT-CORE-001" });
  }
  requirePositiveInteger(input.event_version, "event_version");
  assertSourceRefs(input.source_refs);
  assertRelatedEventRefs(input);
  assertCorrectionTargets(input);
  if (!APPROVAL_LEVEL_SET.has(input.approval.required_level) || !APPROVAL_STATUS_SET.has(input.approval.status)) {
    throw new WendyDomainError("INVALID_SCHEMA", "approval fields are invalid", { field: "approval" });
  }
  if (input.approval.required_level !== "USER_CONFIRM") {
    throw new WendyDomainError("RULE_VIOLATION", "first paid-expense slice requires USER_CONFIRM", { rule_id: "APR-001" });
  }
  if (input.status === "CONFIRMED" && !input.evidence_refs.some((reference) => reference.evidence_type === "USER_CONFIRMATION")) {
    throw new WendyDomainError("REVIEW_REQUIRED", "CONFIRMED event requires USER_CONFIRMATION evidence", { rule_id: "APR-002" });
  }
  if (input.status === "CONFIRMED" && (input.approval.status !== "APPROVED" || input.approval.decided_by?.actor_type !== "USER")) {
    throw new WendyDomainError("REVIEW_REQUIRED", "CONFIRMED event requires a human approved USER_CONFIRM decision", { rule_id: "APR-002" });
  }

  if (input.event_type === "ExpenseRecognized") {
    if (
      input.event_domain !== "BUSINESS" ||
      !EXPENSE_CATEGORY_SET.has(input.payload.expense_category) ||
      input.payload.recognition_basis !== "IMMEDIATE_PAID_EXPENSE"
    ) {
      throw new WendyDomainError("INVALID_SCHEMA", "ExpenseRecognized must use BUSINESS domain and supported category", { rule_id: "EXP-001" });
    }
    requireNonEmpty(input.payload.description, "payload.description");
    assertCounterparty(input.payload.supplier, "payload.supplier");
    if (input.payload.service_period !== undefined && input.payload.service_period.end_date < input.payload.service_period.start_date) {
      throw new WendyDomainError("RULE_VIOLATION", "service period end cannot precede start", { rule_id: "EXP-002" });
    }
    if (input.payload.tax_observations !== undefined && input.payload.tax_observations.authority !== "OBSERVATION_ONLY") {
      throw new WendyDomainError("RULE_VIOLATION", "first-slice tax observation must remain observation-only", { field: "tax_observations" });
    }
  } else {
    if (input.event_domain !== "PAYMENT" || input.payment_date === undefined || input.payload.payment_status !== "COMPLETED") {
      throw new WendyDomainError("INVALID_SCHEMA", "PaymentMade must use PAYMENT domain and COMPLETED status", { rule_id: "PMT-001" });
    }
    requireNonEmpty(input.payload.payment_source_ref.display_label, "payload.payment_source_ref.display_label");
    assertCounterparty(input.payload.payee, "payload.payee");
    const sourceTypeMatchesMethod = (input.payload.payment_method === "BANK_TRANSFER" && input.payload.payment_source_ref.source_type === "BANK_ACCOUNT") ||
      (input.payload.payment_method === "CASH" && input.payload.payment_source_ref.source_type === "CASH_ON_HAND");
    if (!sourceTypeMatchesMethod) {
      throw new WendyDomainError("RULE_VIOLATION", "payment method and payment source type must agree", { rule_id: "PMT-003" });
    }
  }

  return Object.freeze({
    ...input,
    source_refs: Object.freeze([...input.source_refs]),
    evidence_refs: Object.freeze([...input.evidence_refs]),
    related_event_refs: Object.freeze([...input.related_event_refs]),
  });
}

export function transitionFinancialEvent(
  event: FinancialEvent,
  transition: FinancialEventStatusTransition,
): FinancialEvent {
  if (event.event_id !== transition.event_id || event.status !== transition.from_status) {
    throw new WendyDomainError("RULE_VIOLATION", "transition must match current FinancialEvent identity and status", { field: "from_status" });
  }
  if (event.event_version !== transition.expected_event_version) {
    throw new WendyDomainError("IDEMPOTENCY_CONFLICT", "FinancialEvent version has changed", { field: "expected_event_version" });
  }
  if (!ALLOWED_EVENT_TRANSITIONS.get(transition.from_status)?.includes(transition.to_status)) {
    throw new WendyDomainError("RULE_VIOLATION", "FinancialEvent status transition is not allowed", { field: "status" });
  }
  if (transition.to_status === "CONFIRMED" && !event.evidence_refs.some((reference) => reference.evidence_type === "USER_CONFIRMATION")) {
    throw new WendyDomainError("REVIEW_REQUIRED", "confirmation requires USER_CONFIRMATION evidence", { rule_id: "APR-002" });
  }
  if (transition.to_status === "CONFIRMED" && transition.transitioned_by.actor_type !== "USER") {
    throw new WendyDomainError("REVIEW_REQUIRED", "SERVICE cannot satisfy USER_CONFIRM", { rule_id: "APR-002" });
  }
  const approval = transition.to_status === "CONFIRMED"
    ? Object.freeze({
      ...event.approval,
      status: "APPROVED" as const,
      decided_at: transition.transitioned_at,
      decided_by: transition.transitioned_by,
    })
    : event.approval;
  return Object.freeze({ ...event, approval, status: transition.to_status, event_version: event.event_version + 1 });
}

export function assertPaidExpenseRelationship(
  expense: ExpenseRecognizedEvent,
  payment: PaymentMadeEvent,
  relationship: EventRelationship,
): void {
  if (
    relationship.relationship_type !== "FULFILLS" ||
    relationship.from_event_id !== payment.event_id ||
    relationship.to_event_id !== expense.event_id ||
    relationship.organization_id !== expense.organization_id ||
    relationship.organization_id !== payment.organization_id ||
    expense.economic_group_id !== payment.economic_group_id
  ) {
    throw new WendyDomainError("RULE_VIOLATION", "paid-expense relationship must be PaymentMade --FULFILLS--> ExpenseRecognized in one organization and economic group", { rule_id: "LINK-001" });
  }
  if (!sameMoney(expense.amount, payment.amount)) {
    throw new WendyDomainError("RULE_VIOLATION", "expense and payment amounts must be exactly equal", { rule_id: "PAIR-001" });
  }
  if (expense.effective_date !== payment.effective_date || expense.accounting_date !== payment.accounting_date || payment.payment_date !== expense.effective_date) {
    throw new WendyDomainError("RULE_VIOLATION", "immediate paid expense dates must share the same organization-local date", { rule_id: "DATE-001" });
  }
}

/**
 * Checks the whole first-slice pair rather than a single relationship in
 * isolation. This is intentionally a validation contract only: it does not
 * write either event, determine tax, resolve accounts, or construct a journal.
 */
export function assertPaidExpensePair(
  expense: ExpenseRecognizedEvent,
  payment: PaymentMadeEvent,
  relationships: readonly EventRelationship[],
): void {
  const fulfills = relationships.filter((relationship) =>
    relationship.relationship_type === "FULFILLS" &&
    relationship.from_event_id === payment.event_id &&
    relationship.to_event_id === expense.event_id
  );
  if (fulfills.length !== 1) {
    throw new WendyDomainError("RULE_VIOLATION", "a paid-expense pair requires exactly one PaymentMade --FULFILLS--> ExpenseRecognized relationship", {
      rule_id: "LINK-001",
    });
  }
  const relationship = fulfills[0];
  if (relationship === undefined) {
    throw new WendyDomainError("INTERNAL_ERROR", "relationship selection was unexpectedly empty", { rule_id: "LINK-001" });
  }
  assertPaidExpenseRelationship(expense, payment, relationship);
}

export function createValidationResult(input: ValidationResult): ValidationResult {
  if (input.disposition !== "PASS" && input.disposition !== "REVIEW_REQUIRED" && input.disposition !== "REJECT" && input.disposition !== "DUPLICATE") {
    throw new WendyDomainError("INVALID_SCHEMA", "validation disposition is invalid", { field: "disposition" });
  }
  return Object.freeze({ ...input, checks: Object.freeze([...input.checks]), validator_service_version: requireNonEmpty(input.validator_service_version, "validator_service_version") });
}
