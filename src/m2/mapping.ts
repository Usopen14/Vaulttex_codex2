import type { Account } from "../domain/accounting/coa.ts";
import type { IsoDate } from "../domain/common/time.ts";

import type { CategoryAccountMapping, MappingResolutionResponse, PaymentSourceAccountMapping } from "./contracts.ts";

function activeOn(date: IsoDate, effective_from: IsoDate, effective_to: IsoDate | null): boolean {
  return date >= effective_from && (effective_to === null || date <= effective_to);
}

function expenseAccountEligible(account: Account): boolean {
  return account.account_type === "EXPENSE" && account.normal_balance === "DEBIT" && account.posting_mode === "POSTABLE";
}

function cashOrBankAccountEligible(account: Account, payment_source_type: "BANK_ACCOUNT" | "CASH_ON_HAND"): boolean {
  const requiredTag = payment_source_type === "BANK_ACCOUNT" ? "ASSET.CASH.BANK" : "ASSET.CASH.ON_HAND";
  return account.account_type === "ASSET" && account.normal_balance === "DEBIT" && account.posting_mode === "POSTABLE" && account.reporting_tag === requiredTag;
}

function mappingResponse(
  contract_version: MappingResolutionResponse["contract_version"],
  organization_id: MappingResolutionResponse["organization_id"],
  evaluated_effective_date: IsoDate,
  resolution: MappingResolutionResponse["resolution"],
  reason_codes: readonly string[],
): MappingResolutionResponse {
  return Object.freeze({
    contract_version,
    organization_id,
    resolution,
    evaluated_effective_date,
    mapping_id: null,
    mapping_version: null,
    mapping_effective_from: null,
    mapping_effective_to: null,
    resolved_account_id: null,
    coa_version_ref: null,
    account_eligibility_evidence_ref: null,
    reason_codes: Object.freeze([...reason_codes]),
  });
}

function exactResponse<T extends CategoryAccountMapping | PaymentSourceAccountMapping>(
  contract_version: MappingResolutionResponse["contract_version"],
  mapping: T,
  evaluated_effective_date: IsoDate,
): MappingResolutionResponse {
  return Object.freeze({
    contract_version,
    organization_id: mapping.organization_id,
    resolution: "EXACTLY_ONE",
    evaluated_effective_date,
    mapping_id: mapping.mapping_id,
    mapping_version: mapping.mapping_version,
    mapping_effective_from: mapping.effective_from,
    mapping_effective_to: mapping.effective_to,
    resolved_account_id: mapping.account.account_id,
    coa_version_ref: mapping.coa_version_ref,
    account_eligibility_evidence_ref: mapping.account_eligibility_evidence_ref,
    reason_codes: Object.freeze(["EXACTLY_ONE_ELIGIBLE_MAPPING"]),
  });
}

/** Resolves only versioned/effective-dated authoritative category mappings. */
export function resolveCategoryAccount(input: {
  readonly organization_id: MappingResolutionResponse["organization_id"];
  readonly expense_category: CategoryAccountMapping["expense_category"];
  readonly effective_accounting_date: IsoDate;
  readonly mappings: readonly CategoryAccountMapping[];
}): MappingResolutionResponse {
  const contract_version = "wendy.paid-expense.category-account-resolution/1.0.0" as const;
  const candidates = input.mappings.filter((mapping) => mapping.expense_category === input.expense_category && activeOn(input.effective_accounting_date, mapping.effective_from, mapping.effective_to));
  if (candidates.some((mapping) => mapping.organization_id !== input.organization_id || mapping.account.organization_id !== input.organization_id)) {
    return mappingResponse(contract_version, input.organization_id, input.effective_accounting_date, "CROSS_ORGANIZATION", ["CROSS_ORGANIZATION_MAPPING"]);
  }
  const sameOrganization = candidates.filter((mapping) => mapping.organization_id === input.organization_id && mapping.account.organization_id === input.organization_id);
  if (sameOrganization.length === 0) return mappingResponse(contract_version, input.organization_id, input.effective_accounting_date, "ZERO_ELIGIBLE", ["ZERO_ELIGIBLE_CATEGORY_MAPPING"]);
  const eligible = sameOrganization.filter((mapping) => mapping.eligibility_at_effective_date === "ELIGIBLE" && expenseAccountEligible(mapping.account));
  if (eligible.length === 0) return mappingResponse(contract_version, input.organization_id, input.effective_accounting_date, "INELIGIBLE", ["INELIGIBLE_CATEGORY_MAPPING"]);
  if (eligible.length > 1) return mappingResponse(contract_version, input.organization_id, input.effective_accounting_date, "MULTIPLE_ELIGIBLE", ["MULTIPLE_ELIGIBLE_CATEGORY_MAPPINGS"]);
  return exactResponse(contract_version, eligible[0]!, input.effective_accounting_date);
}

/** Resolves only versioned/effective-dated authoritative payment-source mappings. */
export function resolvePaymentSourceAccount(input: {
  readonly organization_id: MappingResolutionResponse["organization_id"];
  readonly payment_source_id: string;
  readonly payment_source_type: "BANK_ACCOUNT" | "CASH_ON_HAND";
  readonly effective_accounting_date: IsoDate;
  readonly mappings: readonly PaymentSourceAccountMapping[];
}): MappingResolutionResponse {
  const contract_version = "wendy.paid-expense.payment-source-account-resolution/1.0.0" as const;
  const candidates = input.mappings.filter((mapping) => mapping.payment_source_id === input.payment_source_id && mapping.payment_source_type === input.payment_source_type && activeOn(input.effective_accounting_date, mapping.effective_from, mapping.effective_to));
  if (candidates.some((mapping) => mapping.organization_id !== input.organization_id || mapping.account.organization_id !== input.organization_id)) {
    return mappingResponse(contract_version, input.organization_id, input.effective_accounting_date, "CROSS_ORGANIZATION", ["CROSS_ORGANIZATION_PAYMENT_MAPPING"]);
  }
  const sameOrganization = candidates.filter((mapping) => mapping.organization_id === input.organization_id && mapping.account.organization_id === input.organization_id);
  if (sameOrganization.length === 0) return mappingResponse(contract_version, input.organization_id, input.effective_accounting_date, "ZERO_ELIGIBLE", ["ZERO_ELIGIBLE_PAYMENT_SOURCE_MAPPING"]);
  const eligible = sameOrganization.filter((mapping) => mapping.eligibility_at_effective_date === "ELIGIBLE" && cashOrBankAccountEligible(mapping.account, input.payment_source_type));
  if (eligible.length === 0) return mappingResponse(contract_version, input.organization_id, input.effective_accounting_date, "INELIGIBLE", ["INELIGIBLE_PAYMENT_SOURCE_MAPPING"]);
  if (eligible.length > 1) return mappingResponse(contract_version, input.organization_id, input.effective_accounting_date, "MULTIPLE_ELIGIBLE", ["MULTIPLE_ELIGIBLE_PAYMENT_SOURCE_MAPPINGS"]);
  return exactResponse(contract_version, eligible[0]!, input.effective_accounting_date);
}
