import { DomainValidationError, requireIsoDate, requireNonEmpty } from "../common/errors.ts";
import type { AccountId, COAVersionId, OrganizationId } from "../common/ids.ts";

export interface COAVersion {
  readonly coaVersionId: COAVersionId;
  readonly organizationId: OrganizationId;
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly status: string;
}

export interface Account {
  readonly accountId: AccountId;
  readonly organizationId: OrganizationId;
  readonly stableKey: string;
  readonly displayName: string;
  readonly accountClass: string;
  readonly accountRole?: string;
  readonly coaVersionId: COAVersionId;
  readonly active: boolean;
}

export interface ReportingMapping {
  readonly mappingId: string;
  readonly reportingTag: string;
  readonly mappingVersion: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
}

export function createCOAVersion(input: COAVersion): COAVersion {
  const effectiveFrom = requireIsoDate(input.effectiveFrom, "effectiveFrom");
  const effectiveTo = input.effectiveTo === undefined ? undefined : requireIsoDate(input.effectiveTo, "effectiveTo");

  if (effectiveTo !== undefined && effectiveTo < effectiveFrom) {
    throw new DomainValidationError("INVALID_SCHEMA", "effectiveTo must not be before effectiveFrom", "effectiveTo");
  }

  return Object.freeze({
    ...input,
    version: requireNonEmpty(input.version, "version"),
    status: requireNonEmpty(input.status, "status"),
    effectiveFrom,
    effectiveTo,
  });
}

export function createAccount(input: Account): Account {
  return Object.freeze({
    ...input,
    stableKey: requireNonEmpty(input.stableKey, "stableKey"),
    displayName: requireNonEmpty(input.displayName, "displayName"),
    accountClass: requireNonEmpty(input.accountClass, "accountClass"),
    accountRole: input.accountRole === undefined ? undefined : requireNonEmpty(input.accountRole, "accountRole"),
  });
}

export function createReportingMapping(input: ReportingMapping): ReportingMapping {
  const effectiveFrom = requireIsoDate(input.effectiveFrom, "effectiveFrom");
  const effectiveTo = input.effectiveTo === undefined ? undefined : requireIsoDate(input.effectiveTo, "effectiveTo");

  if (effectiveTo !== undefined && effectiveTo < effectiveFrom) {
    throw new DomainValidationError("INVALID_SCHEMA", "effectiveTo must not be before effectiveFrom", "effectiveTo");
  }

  return Object.freeze({
    ...input,
    mappingId: requireNonEmpty(input.mappingId, "mappingId"),
    reportingTag: requireNonEmpty(input.reportingTag, "reportingTag"),
    mappingVersion: requireNonEmpty(input.mappingVersion, "mappingVersion"),
    effectiveFrom,
    effectiveTo,
  });
}

export function assertAccountUsesCOAVersion(account: Account, version: COAVersion): void {
  if (account.organizationId !== version.organizationId || account.coaVersionId !== version.coaVersionId) {
    throw new DomainValidationError(
      "RULE_VIOLATION",
      "account must use a COA version owned by the same organization",
      "coaVersionId",
    );
  }
}
