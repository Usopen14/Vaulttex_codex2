import { DomainValidationError, requireNonEmpty } from "./errors.ts";

type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type OrganizationId = Brand<string, "OrganizationId">;
export type UserId = Brand<string, "UserId">;
export type MembershipId = Brand<string, "MembershipId">;
export type AccountId = Brand<string, "AccountId">;
export type COAVersionId = Brand<string, "COAVersionId">;
export type RuleSetId = Brand<string, "RuleSetId">;
export type RuleVersionId = Brand<string, "RuleVersionId">;
export type FinancialEventId = Brand<string, "FinancialEventId">;
export type EconomicGroupId = Brand<string, "EconomicGroupId">;
export type FinancialEventRelationId = Brand<string, "FinancialEventRelationId">;
export type TraceId = Brand<string, "TraceId">;
export type RequestId = Brand<string, "RequestId">;
export type TaxProfileId = Brand<string, "TaxProfileId">;

function asId<Name extends string>(value: string, kind: Name): Brand<string, Name> {
  const normalized = requireNonEmpty(value, `${kind} id`).trim();

  if (/\s/.test(normalized)) {
    throw new DomainValidationError("INVALID_SCHEMA", `${kind} id must not contain whitespace`, `${kind} id`);
  }

  return normalized as Brand<string, Name>;
}

export const organizationId = (value: string): OrganizationId => asId(value, "Organization");
export const userId = (value: string): UserId => asId(value, "User");
export const membershipId = (value: string): MembershipId => asId(value, "Membership");
export const accountId = (value: string): AccountId => asId(value, "Account");
export const coaVersionId = (value: string): COAVersionId => asId(value, "COA version");
export const ruleSetId = (value: string): RuleSetId => asId(value, "Rule set");
export const ruleVersionId = (value: string): RuleVersionId => asId(value, "Rule version");
export const financialEventId = (value: string): FinancialEventId => asId(value, "Financial event");
export const economicGroupId = (value: string): EconomicGroupId => asId(value, "Economic group");
export const financialEventRelationId = (value: string): FinancialEventRelationId => asId(value, "Financial event relation");
export const traceId = (value: string): TraceId => asId(value, "Trace");
export const requestId = (value: string): RequestId => asId(value, "Request");
export const taxProfileId = (value: string): TaxProfileId => asId(value, "Tax profile");
