import { WendyDomainError, requireNonEmpty } from "../common/errors.ts";
import type { AccountId, COAVersionId, OrganizationId } from "../common/ids.ts";
import type { Rfc3339Timestamp } from "../common/time.ts";
import type { ActorRef } from "../organizations/organization.ts";

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
export const NORMAL_BALANCES = ["DEBIT", "CREDIT"] as const;
export const ACCOUNT_CONTROLS = ["SYSTEM", "CUSTOM"] as const;
export const ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const ACCOUNT_POSTING_MODES = ["HEADER", "POSTABLE"] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type NormalBalance = (typeof NORMAL_BALANCES)[number];
export type AccountControl = (typeof ACCOUNT_CONTROLS)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export type AccountPostingMode = (typeof ACCOUNT_POSTING_MODES)[number];

export const REPORTING_TAGS = [
  "ASSET.CASH.ON_HAND", "ASSET.CASH.BANK", "ASSET.RECEIVABLE.TRADE", "ASSET.TAX.VAT_INPUT_PENDING",
  "ASSET.TAX.VAT_INPUT_RECOVERABLE", "ASSET.PREPAYMENT", "ASSET.PROPERTY_EQUIPMENT", "ASSET.ACCUMULATED_DEPRECIATION",
  "LIABILITY.PAYABLE.TRADE", "LIABILITY.ACCRUED_EXPENSE", "LIABILITY.TAX.VAT_OUTPUT", "LIABILITY.TAX.WHT_PAYABLE", "LIABILITY.BORROWING",
  "EQUITY.CONTRIBUTED_CAPITAL", "EQUITY.RETAINED_EARNINGS", "REVENUE.OPERATING", "REVENUE.OTHER", "EXPENSE.COST_OF_SALES",
  "EXPENSE.OPERATING.MARKETING", "EXPENSE.OPERATING.PAYROLL", "EXPENSE.OPERATING.RENT", "EXPENSE.OPERATING.UTILITIES",
  "EXPENSE.OPERATING.PROFESSIONAL_FEES", "EXPENSE.OPERATING.BANK_FEES", "EXPENSE.OPERATING.GENERAL", "EXPENSE.DEPRECIATION", "EXPENSE.INCOME_TAX",
] as const;

export type ReportingTag = (typeof REPORTING_TAGS)[number];

export interface COAVersion {
  readonly coa_version_id: COAVersionId;
  readonly organization_id: OrganizationId;
  readonly version: string;
  readonly status: string;
}

export interface Account {
  readonly account_id: AccountId;
  readonly organization_id: OrganizationId;
  readonly code: string;
  readonly name: string;
  readonly account_type: AccountType;
  readonly normal_balance: NormalBalance;
  readonly parent_account_id: AccountId | null;
  readonly posting_mode: AccountPostingMode;
  readonly control: AccountControl;
  readonly status: AccountStatus;
  readonly reporting_tag: ReportingTag | null;
  readonly system_key: string | null;
  readonly coa_version_id: COAVersionId;
  readonly created_at: Rfc3339Timestamp;
  readonly created_by: ActorRef;
}

export interface SystemAccountSeed {
  readonly code: string;
  readonly system_key: string;
  readonly name: string;
  readonly account_type: AccountType;
  readonly normal_balance: NormalBalance;
  readonly parent_system_key: string | null;
  readonly posting_mode: AccountPostingMode;
  readonly initial_status: AccountStatus;
  readonly reporting_tag: ReportingTag | null;
}

const ACCOUNT_CODE_PATTERN = /^[0-9]{4}(?:-[A-Z0-9]{1,12})*$/;
const ACCOUNT_TYPE_SET: ReadonlySet<string> = new Set(ACCOUNT_TYPES);
const NORMAL_BALANCE_SET: ReadonlySet<string> = new Set(NORMAL_BALANCES);
const ACCOUNT_CONTROL_SET: ReadonlySet<string> = new Set(ACCOUNT_CONTROLS);
const ACCOUNT_STATUS_SET: ReadonlySet<string> = new Set(ACCOUNT_STATUSES);
const ACCOUNT_POSTING_MODE_SET: ReadonlySet<string> = new Set(ACCOUNT_POSTING_MODES);
const REPORTING_TAG_SET: ReadonlySet<string> = new Set(REPORTING_TAGS);

export const MINIMUM_COA_SEED: readonly SystemAccountSeed[] = Object.freeze([
  { code: "1000", system_key: "SYS.ASSET", name: "Assets", account_type: "ASSET", normal_balance: "DEBIT", parent_system_key: null, posting_mode: "HEADER", initial_status: "ACTIVE", reporting_tag: null },
  { code: "1100", system_key: "SYS.ASSET.CASH", name: "Cash and cash equivalents", account_type: "ASSET", normal_balance: "DEBIT", parent_system_key: "SYS.ASSET", posting_mode: "HEADER", initial_status: "ACTIVE", reporting_tag: null },
  { code: "1110", system_key: "SYS.ASSET.CASH.ON_HAND", name: "Cash on hand", account_type: "ASSET", normal_balance: "DEBIT", parent_system_key: "SYS.ASSET.CASH", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "ASSET.CASH.ON_HAND" },
  { code: "1120", system_key: "SYS.ASSET.CASH.BANK", name: "Bank accounts", account_type: "ASSET", normal_balance: "DEBIT", parent_system_key: "SYS.ASSET.CASH", posting_mode: "HEADER", initial_status: "ACTIVE", reporting_tag: null },
  { code: "1200", system_key: "SYS.ASSET.AR", name: "Trade accounts receivable", account_type: "ASSET", normal_balance: "DEBIT", parent_system_key: "SYS.ASSET", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "ASSET.RECEIVABLE.TRADE" },
  { code: "1300", system_key: "SYS.ASSET.VAT_INPUT_PENDING", name: "Input VAT pending evidence", account_type: "ASSET", normal_balance: "DEBIT", parent_system_key: "SYS.ASSET", posting_mode: "POSTABLE", initial_status: "INACTIVE", reporting_tag: "ASSET.TAX.VAT_INPUT_PENDING" },
  { code: "1310", system_key: "SYS.ASSET.VAT_INPUT_RECOVERABLE", name: "Recoverable input VAT", account_type: "ASSET", normal_balance: "DEBIT", parent_system_key: "SYS.ASSET", posting_mode: "POSTABLE", initial_status: "INACTIVE", reporting_tag: "ASSET.TAX.VAT_INPUT_RECOVERABLE" },
  { code: "1400", system_key: "SYS.ASSET.PREPAYMENT", name: "Prepayments", account_type: "ASSET", normal_balance: "DEBIT", parent_system_key: "SYS.ASSET", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "ASSET.PREPAYMENT" },
  { code: "1500", system_key: "SYS.ASSET.PPE", name: "Property and equipment", account_type: "ASSET", normal_balance: "DEBIT", parent_system_key: "SYS.ASSET", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "ASSET.PROPERTY_EQUIPMENT" },
  { code: "1590", system_key: "SYS.ASSET.ACCUM_DEP", name: "Accumulated depreciation", account_type: "ASSET", normal_balance: "CREDIT", parent_system_key: "SYS.ASSET", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "ASSET.ACCUMULATED_DEPRECIATION" },
  { code: "2000", system_key: "SYS.LIABILITY", name: "Liabilities", account_type: "LIABILITY", normal_balance: "CREDIT", parent_system_key: null, posting_mode: "HEADER", initial_status: "ACTIVE", reporting_tag: null },
  { code: "2100", system_key: "SYS.LIABILITY.AP", name: "Trade accounts payable", account_type: "LIABILITY", normal_balance: "CREDIT", parent_system_key: "SYS.LIABILITY", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "LIABILITY.PAYABLE.TRADE" },
  { code: "2200", system_key: "SYS.LIABILITY.ACCRUED_EXPENSE", name: "Accrued expenses", account_type: "LIABILITY", normal_balance: "CREDIT", parent_system_key: "SYS.LIABILITY", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "LIABILITY.ACCRUED_EXPENSE" },
  { code: "2300", system_key: "SYS.LIABILITY.VAT_OUTPUT", name: "Output VAT payable", account_type: "LIABILITY", normal_balance: "CREDIT", parent_system_key: "SYS.LIABILITY", posting_mode: "POSTABLE", initial_status: "INACTIVE", reporting_tag: "LIABILITY.TAX.VAT_OUTPUT" },
  { code: "2310", system_key: "SYS.LIABILITY.WHT", name: "Withholding tax payable", account_type: "LIABILITY", normal_balance: "CREDIT", parent_system_key: "SYS.LIABILITY", posting_mode: "POSTABLE", initial_status: "INACTIVE", reporting_tag: "LIABILITY.TAX.WHT_PAYABLE" },
  { code: "2400", system_key: "SYS.LIABILITY.BORROWING", name: "Borrowings", account_type: "LIABILITY", normal_balance: "CREDIT", parent_system_key: "SYS.LIABILITY", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "LIABILITY.BORROWING" },
  { code: "3000", system_key: "SYS.EQUITY", name: "Equity", account_type: "EQUITY", normal_balance: "CREDIT", parent_system_key: null, posting_mode: "HEADER", initial_status: "ACTIVE", reporting_tag: null },
  { code: "3100", system_key: "SYS.EQUITY.CAPITAL", name: "Contributed capital", account_type: "EQUITY", normal_balance: "CREDIT", parent_system_key: "SYS.EQUITY", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EQUITY.CONTRIBUTED_CAPITAL" },
  { code: "3200", system_key: "SYS.EQUITY.RETAINED_EARNINGS", name: "Retained earnings", account_type: "EQUITY", normal_balance: "CREDIT", parent_system_key: "SYS.EQUITY", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EQUITY.RETAINED_EARNINGS" },
  { code: "4000", system_key: "SYS.REVENUE", name: "Revenue", account_type: "REVENUE", normal_balance: "CREDIT", parent_system_key: null, posting_mode: "HEADER", initial_status: "ACTIVE", reporting_tag: null },
  { code: "4100", system_key: "SYS.REVENUE.OPERATING", name: "Operating revenue", account_type: "REVENUE", normal_balance: "CREDIT", parent_system_key: "SYS.REVENUE", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "REVENUE.OPERATING" },
  { code: "4900", system_key: "SYS.REVENUE.OTHER", name: "Other revenue", account_type: "REVENUE", normal_balance: "CREDIT", parent_system_key: "SYS.REVENUE", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "REVENUE.OTHER" },
  { code: "5000", system_key: "SYS.EXPENSE.COS", name: "Cost of sales", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: null, posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EXPENSE.COST_OF_SALES" },
  { code: "6000", system_key: "SYS.EXPENSE.OPERATING", name: "Operating expenses", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: null, posting_mode: "HEADER", initial_status: "ACTIVE", reporting_tag: null },
  { code: "6110", system_key: "SYS.EXPENSE.MARKETING", name: "Marketing expense", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: "SYS.EXPENSE.OPERATING", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EXPENSE.OPERATING.MARKETING" },
  { code: "6120", system_key: "SYS.EXPENSE.PAYROLL", name: "Payroll expense", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: "SYS.EXPENSE.OPERATING", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EXPENSE.OPERATING.PAYROLL" },
  { code: "6130", system_key: "SYS.EXPENSE.RENT", name: "Rent expense", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: "SYS.EXPENSE.OPERATING", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EXPENSE.OPERATING.RENT" },
  { code: "6140", system_key: "SYS.EXPENSE.UTILITIES", name: "Utilities expense", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: "SYS.EXPENSE.OPERATING", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EXPENSE.OPERATING.UTILITIES" },
  { code: "6150", system_key: "SYS.EXPENSE.PROFESSIONAL_FEES", name: "Professional fees", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: "SYS.EXPENSE.OPERATING", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EXPENSE.OPERATING.PROFESSIONAL_FEES" },
  { code: "6160", system_key: "SYS.EXPENSE.BANK_FEES", name: "Bank fees", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: "SYS.EXPENSE.OPERATING", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EXPENSE.OPERATING.BANK_FEES" },
  { code: "6190", system_key: "SYS.EXPENSE.GENERAL", name: "General operating expense", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: "SYS.EXPENSE.OPERATING", posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EXPENSE.OPERATING.GENERAL" },
  { code: "6200", system_key: "SYS.EXPENSE.DEPRECIATION", name: "Depreciation expense", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: null, posting_mode: "POSTABLE", initial_status: "ACTIVE", reporting_tag: "EXPENSE.DEPRECIATION" },
  { code: "8000", system_key: "SYS.EXPENSE.INCOME_TAX", name: "Income tax expense", account_type: "EXPENSE", normal_balance: "DEBIT", parent_system_key: null, posting_mode: "POSTABLE", initial_status: "INACTIVE", reporting_tag: "EXPENSE.INCOME_TAX" },
]);

export function createCOAVersion(input: COAVersion): COAVersion {
  return Object.freeze({ ...input, version: requireNonEmpty(input.version, "version"), status: requireNonEmpty(input.status, "status") });
}

export function createAccount(input: Account): Account {
  if (!ACCOUNT_CODE_PATTERN.test(input.code)) throw new WendyDomainError("INVALID_SCHEMA", "account code has invalid format", { field: "code", rule_id: "COA-CODE-001" });
  if (!ACCOUNT_TYPE_SET.has(input.account_type) || !NORMAL_BALANCE_SET.has(input.normal_balance)) throw new WendyDomainError("INVALID_SCHEMA", "account type or normal balance is invalid", { rule_id: "COA-TYPE-001" });
  if (!ACCOUNT_CONTROL_SET.has(input.control) || !ACCOUNT_STATUS_SET.has(input.status) || !ACCOUNT_POSTING_MODE_SET.has(input.posting_mode)) throw new WendyDomainError("INVALID_SCHEMA", "account control, status, or posting mode is invalid");
  if (input.posting_mode === "HEADER" && input.reporting_tag !== null) throw new WendyDomainError("RULE_VIOLATION", "HEADER accounts must not have reporting_tag", { rule_id: "COA-POST-001" });
  if (input.posting_mode === "POSTABLE" && input.reporting_tag === null) throw new WendyDomainError("RULE_VIOLATION", "POSTABLE accounts require reporting_tag", { rule_id: "COA-TAG-001" });
  if (input.reporting_tag !== null && (!REPORTING_TAG_SET.has(input.reporting_tag) || !input.reporting_tag.startsWith(`${input.account_type}.`))) throw new WendyDomainError("RULE_VIOLATION", "reporting_tag must exist and match account_type", { rule_id: "COA-TAG-001" });
  if (input.control === "SYSTEM" && (input.system_key === null || input.system_key.trim().length === 0)) throw new WendyDomainError("RULE_VIOLATION", "SYSTEM account requires immutable system_key", { rule_id: "COA-SYS-001" });
  if (input.control === "CUSTOM" && input.system_key !== null) throw new WendyDomainError("RULE_VIOLATION", "CUSTOM account must not impersonate system_key", { rule_id: "COA-SYS-001" });
  return Object.freeze({ ...input, name: requireNonEmpty(input.name, "name") });
}

export function assertCompatibleAccountParent(account: Account, parent: Account): void {
  if (account.account_id === parent.account_id || account.organization_id !== parent.organization_id || account.account_type !== parent.account_type) {
    throw new WendyDomainError("RULE_VIOLATION", "account parent must be distinct, organization-scoped, and type-compatible", { rule_id: "COA-TYPE-001" });
  }
}

/** Validates a supplied parent chain; it does not choose or create accounts. */
export function assertActiveCompatibleAccountPath(account: Account, ancestors: readonly Account[]): void {
  if (account.posting_mode !== "POSTABLE") {
    return;
  }
  let current = account;
  const visited = new Set<AccountId>([account.account_id]);
  for (const parent of ancestors) {
    if (current.parent_account_id !== parent.account_id || parent.organization_id !== account.organization_id || parent.account_type !== account.account_type || parent.status !== "ACTIVE" || visited.has(parent.account_id)) {
      throw new WendyDomainError("RULE_VIOLATION", "POSTABLE account must have an active, acyclic same-type parent path", { rule_id: "COA-TYPE-001" });
    }
    visited.add(parent.account_id);
    current = parent;
  }
  if (current.parent_account_id !== null || current.status !== "ACTIVE") {
    throw new WendyDomainError("RULE_VIOLATION", "POSTABLE account parent path must terminate at an active root", { rule_id: "COA-TYPE-001" });
  }
}

export function assertUniqueAccountCodes(accounts: readonly Account[]): void {
  const codes = new Set<string>();
  for (const account of accounts) {
    const key = `${account.organization_id}:${account.code}`;
    if (codes.has(key)) {
      throw new WendyDomainError("RULE_VIOLATION", "account code must be unique within an organization", { field: "code", rule_id: "COA-CODE-001" });
    }
    codes.add(key);
  }
}

export function validateMinimumCOASeed(seed: readonly SystemAccountSeed[] = MINIMUM_COA_SEED): void {
  const seenCodes = new Set<string>();
  const seenKeys = new Set<string>();
  const keys = new Set(seed.map((account) => account.system_key));
  for (const account of seed) {
    if (!ACCOUNT_CODE_PATTERN.test(account.code) || seenCodes.has(account.code) || seenKeys.has(account.system_key)) throw new WendyDomainError("RULE_VIOLATION", "COA seed code and system_key must be unique and valid", { rule_id: "COA-CODE-001" });
    if (account.parent_system_key !== null && !keys.has(account.parent_system_key)) throw new WendyDomainError("RULE_VIOLATION", "COA seed parent_system_key must exist", { rule_id: "COA-TYPE-001" });
    if (account.posting_mode === "HEADER" ? account.reporting_tag !== null : account.reporting_tag === null) throw new WendyDomainError("RULE_VIOLATION", "COA seed reporting_tag must match posting mode", { rule_id: "COA-TAG-001" });
    if (account.reporting_tag !== null && !account.reporting_tag.startsWith(`${account.account_type}.`)) throw new WendyDomainError("RULE_VIOLATION", "COA seed reporting_tag must match account type", { rule_id: "COA-TAG-001" });
    seenCodes.add(account.code);
    seenKeys.add(account.system_key);
  }

  if (seed.length !== MINIMUM_COA_SEED.length) {
    throw new WendyDomainError("RULE_VIOLATION", "COA seed must contain every normative system account exactly once", { rule_id: "COA-SYS-001" });
  }
  for (const expected of MINIMUM_COA_SEED) {
    const received = seed.find((account) => account.system_key === expected.system_key);
    if (
      received === undefined ||
      received.code !== expected.code ||
      received.name !== expected.name ||
      received.account_type !== expected.account_type ||
      received.normal_balance !== expected.normal_balance ||
      received.parent_system_key !== expected.parent_system_key ||
      received.posting_mode !== expected.posting_mode ||
      received.initial_status !== expected.initial_status ||
      received.reporting_tag !== expected.reporting_tag
    ) {
      throw new WendyDomainError("RULE_VIOLATION", "COA seed diverges from the locked normative account definition", { rule_id: "COA-SYS-001" });
    }
  }
}
