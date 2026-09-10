import { DomainValidationError, requireIsoDate, requireNonEmpty } from "../common/errors.ts";
import type { OrganizationId, TaxProfileId } from "../common/ids.ts";

export interface AccountingProfile {
  readonly organizationId: OrganizationId;
  readonly fiscalYearStart: string;
  readonly fiscalYearEnd: string;
  readonly accountingStandard: string;
  readonly entityType: string;
  readonly functionalCurrency: "THB";
  readonly timezone: string;
}

export interface TaxProfile {
  readonly taxProfileId: TaxProfileId;
  readonly organizationId: OrganizationId;
  readonly jurisdiction: string;
  readonly status: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly configurationRef?: string;
}

export function createAccountingProfile(input: AccountingProfile): AccountingProfile {
  const fiscalYearStart = requireIsoDate(input.fiscalYearStart, "fiscalYearStart");
  const fiscalYearEnd = requireIsoDate(input.fiscalYearEnd, "fiscalYearEnd");

  if (fiscalYearEnd < fiscalYearStart) {
    throw new DomainValidationError(
      "INVALID_SCHEMA",
      "fiscalYearEnd must not be before fiscalYearStart",
      "fiscalYearEnd",
    );
  }

  if (input.functionalCurrency !== "THB") {
    throw new DomainValidationError("RULE_VIOLATION", "M1 functional currency must be THB", "functionalCurrency");
  }

  return Object.freeze({
    ...input,
    fiscalYearStart,
    fiscalYearEnd,
    accountingStandard: requireNonEmpty(input.accountingStandard, "accountingStandard"),
    entityType: requireNonEmpty(input.entityType, "entityType"),
    timezone: requireNonEmpty(input.timezone, "timezone"),
  });
}

export function createTaxProfile(input: TaxProfile): TaxProfile {
  const effectiveFrom = requireIsoDate(input.effectiveFrom, "effectiveFrom");
  const effectiveTo = input.effectiveTo === undefined ? undefined : requireIsoDate(input.effectiveTo, "effectiveTo");

  if (effectiveTo !== undefined && effectiveTo < effectiveFrom) {
    throw new DomainValidationError("INVALID_SCHEMA", "effectiveTo must not be before effectiveFrom", "effectiveTo");
  }

  return Object.freeze({
    ...input,
    jurisdiction: requireNonEmpty(input.jurisdiction, "jurisdiction"),
    status: requireNonEmpty(input.status, "status"),
    effectiveFrom,
    effectiveTo,
  });
}
