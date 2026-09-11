import { WendyDomainError, requirePositiveInteger } from "../common/errors.ts";
import type { AccountingPeriodId, OrganizationId, TaxPeriodId } from "../common/ids.ts";
import { assertDateNotBefore, type IsoDate, type Rfc3339Timestamp } from "../common/time.ts";
import type { ActorRef } from "../organizations/organization.ts";

export const ACCOUNTING_PERIOD_STATUSES = [
  "OPEN",
  "PRE_CLOSE",
  "REVIEW",
  "ADJUSTING",
  "READY_TO_CLOSE",
  "CLOSED",
  "LOCKED",
  "REOPEN_REQUESTED",
  "APPROVED",
  "REOPENED",
] as const;

export type AccountingPeriodStatus = (typeof ACCOUNTING_PERIOD_STATUSES)[number];

export interface AccountingPeriod {
  readonly accounting_period_id: AccountingPeriodId;
  readonly organization_id: OrganizationId;
  readonly start_date: IsoDate;
  readonly end_date: IsoDate;
  readonly status: AccountingPeriodStatus;
  readonly period_version: number;
  readonly created_at: Rfc3339Timestamp;
  readonly created_by: ActorRef;
}

export interface AccountingPeriodTransition {
  readonly accounting_period_id: AccountingPeriodId;
  readonly from_status: AccountingPeriodStatus;
  readonly to_status: AccountingPeriodStatus;
  readonly expected_period_version: number;
  readonly transitioned_at: Rfc3339Timestamp;
  readonly transitioned_by: ActorRef;
}

export interface TaxPeriod {
  readonly tax_period_id: TaxPeriodId;
  readonly organization_id: OrganizationId;
  readonly start_date: IsoDate;
  readonly end_date: IsoDate;
}

const ACCOUNTING_PERIOD_STATUS_SET: ReadonlySet<string> = new Set(ACCOUNTING_PERIOD_STATUSES);
const ALLOWED_ACCOUNTING_PERIOD_TRANSITIONS: ReadonlyMap<AccountingPeriodStatus, readonly AccountingPeriodStatus[]> = new Map([
  ["OPEN", ["PRE_CLOSE"]],
  ["PRE_CLOSE", ["REVIEW"]],
  ["REVIEW", ["ADJUSTING"]],
  ["ADJUSTING", ["READY_TO_CLOSE"]],
  ["READY_TO_CLOSE", ["CLOSED"]],
  ["CLOSED", ["LOCKED"]],
  ["LOCKED", ["REOPEN_REQUESTED"]],
  ["REOPEN_REQUESTED", ["APPROVED"]],
  ["APPROVED", ["REOPENED"]],
  ["REOPENED", ["ADJUSTING", "REVIEW"]],
]);

export function createAccountingPeriod(input: AccountingPeriod): AccountingPeriod {
  assertDateNotBefore(input.start_date, input.end_date, "end_date");
  if (!ACCOUNTING_PERIOD_STATUS_SET.has(input.status)) {
    throw new WendyDomainError("INVALID_SCHEMA", "status is not an AccountingPeriodStatus", { field: "status" });
  }
  requirePositiveInteger(input.period_version, "period_version");
  return Object.freeze({ ...input });
}

export function createTaxPeriod(input: TaxPeriod): TaxPeriod {
  assertDateNotBefore(input.start_date, input.end_date, "end_date");
  return Object.freeze({ ...input });
}

export function transitionAccountingPeriod(
  period: AccountingPeriod,
  transition: AccountingPeriodTransition,
): AccountingPeriod {
  if (period.accounting_period_id !== transition.accounting_period_id || period.status !== transition.from_status) {
    throw new WendyDomainError("RULE_VIOLATION", "transition must match the current accounting period identity and status", {
      field: "from_status",
    });
  }
  if (period.period_version !== transition.expected_period_version) {
    throw new WendyDomainError("IDEMPOTENCY_CONFLICT", "accounting period version has changed", { field: "expected_period_version" });
  }
  if (!ALLOWED_ACCOUNTING_PERIOD_TRANSITIONS.get(transition.from_status)?.includes(transition.to_status)) {
    throw new WendyDomainError("RULE_VIOLATION", "accounting period transition is not allowed by the M1 state machine", {
      field: "to_status",
    });
  }

  return Object.freeze({ ...period, status: transition.to_status, period_version: period.period_version + 1 });
}
