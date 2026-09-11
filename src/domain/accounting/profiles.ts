import { WendyDomainError, requireNonEmpty } from "../common/errors.ts";
import type { OrganizationId, TaxProfileId } from "../common/ids.ts";
import { assertDateNotBefore, type IsoDate } from "../common/time.ts";

export interface AccountingProfile {
  readonly organization_id: OrganizationId;
  readonly fiscal_year_start: IsoDate;
  readonly fiscal_year_end: IsoDate;
  readonly accounting_standard: string;
  readonly entity_type: string;
  readonly functional_currency: "THB";
  readonly timezone: string;
}

export interface TaxProfile {
  readonly tax_profile_id: TaxProfileId;
  readonly organization_id: OrganizationId;
  readonly status: string;
  readonly effective_from: IsoDate;
  readonly effective_to?: IsoDate;
  readonly configuration_ref?: string;
}

export function createAccountingProfile(input: AccountingProfile): AccountingProfile {
  assertDateNotBefore(input.fiscal_year_start, input.fiscal_year_end, "fiscal_year_end");
  if (input.functional_currency !== "THB") {
    throw new WendyDomainError("RULE_VIOLATION", "M1 functional_currency must be THB", {
      field: "functional_currency",
    });
  }

  return Object.freeze({
    ...input,
    accounting_standard: requireNonEmpty(input.accounting_standard, "accounting_standard"),
    entity_type: requireNonEmpty(input.entity_type, "entity_type"),
    timezone: requireNonEmpty(input.timezone, "timezone"),
  });
}

export function createTaxProfile(input: TaxProfile): TaxProfile {
  if (input.effective_to !== undefined) {
    assertDateNotBefore(input.effective_from, input.effective_to, "effective_to");
  }

  return Object.freeze({
    ...input,
    status: requireNonEmpty(input.status, "status"),
    ...(input.configuration_ref === undefined
      ? {}
      : { configuration_ref: requireNonEmpty(input.configuration_ref, "configuration_ref") }),
  });
}
