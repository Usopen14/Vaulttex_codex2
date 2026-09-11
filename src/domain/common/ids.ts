import { WendyDomainError, requireNonEmpty } from "./errors.ts";

type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type Uuid = Brand<string, "Uuid">;
export type OrganizationId = Brand<Uuid, "OrganizationId">;
export type MembershipId = Brand<Uuid, "MembershipId">;
export type ActorId = Brand<Uuid, "ActorId">;
export type AccountId = Brand<Uuid, "AccountId">;
export type FinancialEventId = Brand<Uuid, "FinancialEventId">;
export type EconomicGroupId = Brand<Uuid, "EconomicGroupId">;
export type SourceId = Brand<Uuid, "SourceId">;
export type SourceArtifactId = Brand<Uuid, "SourceArtifactId">;
export type EvidenceId = Brand<Uuid, "EvidenceId">;
export type AccountingPeriodId = Brand<Uuid, "AccountingPeriodId">;
export type TaxPeriodId = Brand<Uuid, "TaxPeriodId">;
export type COAVersionId = Brand<Uuid, "COAVersionId">;
export type RuleSetId = Brand<Uuid, "RuleSetId">;
export type EventRelationshipId = Brand<Uuid, "EventRelationshipId">;
export type RequestId = Brand<Uuid, "RequestId">;
export type TraceId = Brand<Uuid, "TraceId">;
export type CandidateId = Brand<Uuid, "CandidateId">;
export type ValidationResultId = Brand<Uuid, "ValidationResultId">;
export type PaymentSourceId = Brand<Uuid, "PaymentSourceId">;
export type TaxProfileId = Brand<Uuid, "TaxProfileId">;
export type RuleId = Brand<string, "RuleId">;
export type RuleVersion = Brand<string, "RuleVersion">;
export type IdempotencyKey = Brand<string, "IdempotencyKey">;
export type EventFingerprint = Brand<string, "EventFingerprint">;
export type ContentHash = Brand<string, "ContentHash">;
export type SchemaVersion = Brand<string, "SchemaVersion">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ASCII_NON_EMPTY_PATTERN = /^[\x21-\x7E]+(?: [\x21-\x7E]+)*$/;

function asUuid(value: string, kind: string): Uuid {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new WendyDomainError("INVALID_SCHEMA", `${kind} must be a lowercase RFC 4122 UUID`, { field: kind });
  }

  return value as Uuid;
}

function asOpaqueString<Name extends string>(
  value: string,
  field: string,
  predicate: (candidate: string) => boolean,
): Brand<string, Name> {
  requireNonEmpty(value, field);
  if (!predicate(value)) {
    throw new WendyDomainError("INVALID_SCHEMA", `${field} has an invalid format`, { field });
  }

  return value as Brand<string, Name>;
}

export const uuid = (value: string): Uuid => asUuid(value, "uuid");
export const organizationId = (value: string): OrganizationId => asUuid(value, "organization_id") as OrganizationId;
export const membershipId = (value: string): MembershipId => asUuid(value, "membership_id") as MembershipId;
export const actorId = (value: string): ActorId => asUuid(value, "actor_id") as ActorId;
export const accountId = (value: string): AccountId => asUuid(value, "account_id") as AccountId;
export const financialEventId = (value: string): FinancialEventId => asUuid(value, "event_id") as FinancialEventId;
export const economicGroupId = (value: string): EconomicGroupId => asUuid(value, "economic_group_id") as EconomicGroupId;
export const sourceId = (value: string): SourceId => asUuid(value, "source_id") as SourceId;
export const sourceArtifactId = (value: string): SourceArtifactId => asUuid(value, "source_artifact_id") as SourceArtifactId;
export const evidenceId = (value: string): EvidenceId => asUuid(value, "evidence_id") as EvidenceId;
export const accountingPeriodId = (value: string): AccountingPeriodId => asUuid(value, "accounting_period_id") as AccountingPeriodId;
export const taxPeriodId = (value: string): TaxPeriodId => asUuid(value, "tax_period_id") as TaxPeriodId;
export const coaVersionId = (value: string): COAVersionId => asUuid(value, "coa_version_id") as COAVersionId;
export const ruleSetId = (value: string): RuleSetId => asUuid(value, "rule_set_id") as RuleSetId;
export const eventRelationshipId = (value: string): EventRelationshipId => asUuid(value, "relationship_id") as EventRelationshipId;
export const requestId = (value: string): RequestId => asUuid(value, "request_id") as RequestId;
export const traceId = (value: string): TraceId => asUuid(value, "trace_id") as TraceId;
export const candidateId = (value: string): CandidateId => asUuid(value, "candidate_id") as CandidateId;
export const validationResultId = (value: string): ValidationResultId => asUuid(value, "validation_result_id") as ValidationResultId;
export const paymentSourceId = (value: string): PaymentSourceId => asUuid(value, "payment_source_id") as PaymentSourceId;
export const taxProfileId = (value: string): TaxProfileId => asUuid(value, "tax_profile_id") as TaxProfileId;
export const ruleId = (value: string): RuleId => asOpaqueString<"RuleId">(value, "rule_id", (candidate) => ASCII_NON_EMPTY_PATTERN.test(candidate));
export const ruleVersion = (value: string): RuleVersion => asOpaqueString<"RuleVersion">(value, "rule_version", (candidate) => ASCII_NON_EMPTY_PATTERN.test(candidate));
export const idempotencyKey = (value: string): IdempotencyKey => asOpaqueString<"IdempotencyKey">(value, "idempotency_key", (candidate) => candidate.trim() === candidate && candidate.length > 0);
export const eventFingerprint = (value: string): EventFingerprint => asOpaqueString<"EventFingerprint">(value, "event_fingerprint", (candidate) => SHA256_PATTERN.test(candidate));
export const contentHash = (value: string): ContentHash => asOpaqueString<"ContentHash">(value, "content_hash", (candidate) => SHA256_PATTERN.test(candidate));
export const schemaVersion = (value: string): SchemaVersion => asOpaqueString<"SchemaVersion">(value, "schema_version", (candidate) => SEMVER_PATTERN.test(candidate) || candidate.startsWith("wendy."));
