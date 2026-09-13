import { newM2Uuid } from "./canonical.ts";
import type { AccountingProfile } from "../domain/accounting/profiles.ts";
import type { AccountingPeriod } from "../domain/periods/periods.ts";
import type { ActorRef } from "../domain/organizations/organization.ts";
import type { EconomicGroupId, OrganizationId, RequestId } from "../domain/common/ids.ts";
import type { IsoDate, Rfc3339Timestamp } from "../domain/common/time.ts";
import type { EventVersionRef, PeriodAuthorizationDecision } from "./contracts.ts";

export interface PeriodAuthorizationInput {
  readonly organization_id: OrganizationId;
  readonly requester: ActorRef;
  readonly source_request_id: RequestId;
  readonly requested_operation: PeriodAuthorizationDecision["requested_operation"];
  readonly economic_group_id: EconomicGroupId;
  readonly event_refs: readonly EventVersionRef[];
  readonly proposed_accounting_date: IsoDate;
  readonly proposed_posting_date: IsoDate;
  readonly accounting_profile: AccountingProfile;
  readonly accounting_profile_snapshot_ref: string;
  readonly accounting_period: AccountingPeriod;
  readonly decided_at: Rfc3339Timestamp;
}

function decision(input: PeriodAuthorizationInput, outcome: PeriodAuthorizationDecision["decision"], reason: string): PeriodAuthorizationDecision {
  return Object.freeze({
    contract_version: "wendy.paid-expense.period-authorization/1.0.0",
    period_authorization_decision_id: newM2Uuid(),
    organization_id: input.organization_id,
    accounting_period_id: input.accounting_period.accounting_period_id,
    observed_period_version: input.accounting_period.period_version,
    requested_operation: input.requested_operation,
    decision: outcome,
    reason_codes: Object.freeze([reason]),
    required_approval_or_escalation: outcome === "POSTING_ALLOWED" ? null : outcome === "PERIOD_DENIED" ? "PERIOD_REVIEW_OR_AUTHORIZED_ESCALATION" : "PERIOD_REVIEW_REQUIRED",
    accounting_profile_snapshot_ref: input.accounting_profile_snapshot_ref,
    period_policy_version_refs: Object.freeze(["WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-05", "WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-06"]),
    proposed_accounting_date: input.proposed_accounting_date,
    proposed_posting_date: input.proposed_posting_date,
    decided_at: input.decided_at,
  });
}

/** Period authority: it issues evidence only and never writes a Ledger record. */
export function authorizePaidExpensePeriod(input: PeriodAuthorizationInput): PeriodAuthorizationDecision {
  if (input.organization_id !== input.accounting_profile.organization_id || input.organization_id !== input.accounting_period.organization_id) return decision(input, "REVIEW_REQUIRED", "PERIOD_ORGANIZATION_MISMATCH");
  if (input.proposed_accounting_date !== input.proposed_posting_date) return decision(input, "REVIEW_REQUIRED", "M2_ACCOUNTING_AND_POSTING_DATE_MISMATCH");
  if (input.proposed_accounting_date < input.accounting_period.start_date || input.proposed_accounting_date > input.accounting_period.end_date) return decision(input, "PERIOD_DENIED", "ACCOUNTING_DATE_OUTSIDE_PERIOD");
  if (input.accounting_period.status === "OPEN") return decision(input, "POSTING_ALLOWED", "OPEN_PERIOD_POSTING_ALLOWED");
  if (input.accounting_period.status === "CLOSED") return decision(input, "PERIOD_DENIED", "CLOSED_PERIOD_DENIED");
  if (input.accounting_period.status === "LOCKED") return decision(input, "PERIOD_DENIED", "LOCKED_PERIOD_DENIED");
  return decision(input, "REVIEW_REQUIRED", "PERIOD_NOT_OPEN_FOR_NORMAL_POSTING");
}

/** Revalidation used inside the serializable Ledger transaction. */
export function revalidatePeriodAuthorization(decision: PeriodAuthorizationDecision, current: AccountingPeriod): { readonly allowed: boolean; readonly reason_code: string } {
  if (decision.decision !== "POSTING_ALLOWED") return Object.freeze({ allowed: false, reason_code: "PERIOD_AUTHORIZATION_NOT_ALLOWED" });
  if (decision.accounting_period_id !== current.accounting_period_id || decision.organization_id !== current.organization_id) return Object.freeze({ allowed: false, reason_code: "PERIOD_AUTHORIZATION_SCOPE_MISMATCH" });
  if (decision.observed_period_version !== current.period_version) return Object.freeze({ allowed: false, reason_code: "PERIOD_VERSION_STALE" });
  if (current.status !== "OPEN") return Object.freeze({ allowed: false, reason_code: current.status === "LOCKED" ? "LOCKED_PERIOD_DENIED" : "PERIOD_NO_LONGER_OPEN" });
  if (decision.proposed_accounting_date !== decision.proposed_posting_date || decision.proposed_accounting_date < current.start_date || decision.proposed_accounting_date > current.end_date) return Object.freeze({ allowed: false, reason_code: "PERIOD_AUTHORIZATION_DATE_INVALID" });
  return Object.freeze({ allowed: true, reason_code: "PERIOD_REVALIDATED" });
}
