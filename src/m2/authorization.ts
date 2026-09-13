import { requireNonEmpty } from "../domain/common/errors.ts";
import type { RequestId, Uuid } from "../domain/common/ids.ts";
import type { Rfc3339Timestamp } from "../domain/common/time.ts";
import type { ActorRef } from "../domain/organizations/organization.ts";

import { newM2Uuid } from "./canonical.ts";
import type { AuthorizationDecision, CapabilityGrant, EventVersionRef, PaidExpenseOperation } from "./contracts.ts";

export const PAID_EXPENSE_CAPABILITIES = {
  submit: "PAID_EXPENSE_SUBMIT",
  user_confirm: "PAID_EXPENSE_USER_CONFIRM",
  elevated_approval: "PAID_EXPENSE_ELEVATED_APPROVAL",
  correction_approval: "PAID_EXPENSE_CORRECTION_APPROVAL",
  ledger_post: "PAID_EXPENSE_LEDGER_POST",
} as const;

export interface AuthorizationDecisionInput {
  readonly organization_id: AuthorizationDecision["organization_id"];
  readonly source_request_id: RequestId;
  readonly actor: ActorRef;
  readonly originator: ActorRef;
  readonly requested_operation: PaidExpenseOperation | "PAID_EXPENSE_CORRECTION";
  readonly affected_event_refs: readonly EventVersionRef[];
  readonly evaluated_at: Rfc3339Timestamp;
  readonly authorization_decision_id?: Uuid;
  readonly candidate_actor_ids_ref: string;
  readonly independent_eligible_actor_ids_ref: string;
  readonly user_confirmation?: { readonly candidate_hash: string | null; readonly confirmation_audit_ref: string | null };
  readonly owner_override?: { readonly enabled_by_organization_policy: boolean; readonly explicitly_requested: boolean; readonly justification: string | null };
}

function capabilityFor(operation: AuthorizationDecisionInput["requested_operation"]): string {
  switch (operation) {
    case "USER_CONFIRM_PAID_EXPENSE": return PAID_EXPENSE_CAPABILITIES.user_confirm;
    case "REQUEST_ELEVATED_APPROVAL":
    case "DECIDE_ELEVATED_APPROVAL": return PAID_EXPENSE_CAPABILITIES.elevated_approval;
    case "REQUEST_PAID_EXPENSE_CORRECTION":
    case "POST_PAID_EXPENSE_CORRECTION":
    case "PAID_EXPENSE_CORRECTION": return PAID_EXPENSE_CAPABILITIES.correction_approval;
    case "POST_PAID_EXPENSE": return PAID_EXPENSE_CAPABILITIES.submit;
    default: return PAID_EXPENSE_CAPABILITIES.submit;
  }
}

function activeGrant(grants: readonly CapabilityGrant[], organization_id: AuthorizationDecision["organization_id"], actor: ActorRef, capability: string): CapabilityGrant | undefined {
  return grants.find((grant) => grant.organization_id === organization_id && grant.actor_id === actor.actor_id && grant.membership_status === "ACTIVE" && grant.capabilities.includes(capability));
}

function response(input: AuthorizationDecisionInput, decision: AuthorizationDecision["decision"], reason_codes: readonly string[], control: AuthorizationDecision["approval_control_audit"], evidence: string): AuthorizationDecision {
  return Object.freeze({
    contract_version: "wendy.paid-expense.authorization-decision/1.0.0",
    authorization_decision_id: input.authorization_decision_id ?? newM2Uuid(),
    organization_id: input.organization_id,
    requested_operation: input.requested_operation,
    decision,
    reason_codes: Object.freeze([...reason_codes]),
    required_next_action: decision === "ALLOWED" ? null : decision === "REVIEW_REQUIRED" ? "AUTHORIZED_REVIEW_REQUIRED" : "REQUEST_DENIED",
    evaluated_at: input.evaluated_at,
    policy_version_refs: Object.freeze(["WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-01", "WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-02", "WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-03", "WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md#P-04"]),
    authorization_evidence_ref: evidence,
    independent_approver_resolution: Object.freeze({
      originator_actor_id: input.originator.actor_id,
      candidate_actor_ids_ref: input.candidate_actor_ids_ref,
      independent_eligible_actor_ids_ref: input.independent_eligible_actor_ids_ref,
      actor_identity_comparison: input.actor.actor_id === input.originator.actor_id ? "SAME" : "DIFFERENT",
      resolution_at: input.evaluated_at,
    }),
    approval_control_audit: Object.freeze(control),
  });
}

/**
 * Resolves M2 authority from active server-side membership/capability grants.
 * Role labels alone never authorize a decision.
 */
export function decidePaidExpenseAuthorization(input: AuthorizationDecisionInput, grants: readonly CapabilityGrant[]): AuthorizationDecision {
  const baseAudit = {
    control_mechanism: "NOT_APPLICABLE" as const,
    self_approved: false,
    owner_override_reason: null,
    source_request_id: input.source_request_id,
    affected_event_refs: Object.freeze([...input.affected_event_refs]),
    policy_version_ref: "WENDY_PAID_EXPENSE_POLICY_APPROVAL_PACK_v0.1.md",
  };
  const needed = capabilityFor(input.requested_operation);
  const actorGrant = activeGrant(grants, input.organization_id, input.actor, needed);
  if (actorGrant === undefined) return response(input, "DENIED", ["ACTOR_NOT_ACTIVE_OR_CAPABLE"], baseAudit, "server:authorization:denied");

  if (input.requested_operation === "USER_CONFIRM_PAID_EXPENSE") {
    if (input.actor.actor_type !== "USER" || input.actor.actor_id !== input.originator.actor_id || input.user_confirmation?.candidate_hash === null || input.user_confirmation?.candidate_hash === undefined || input.user_confirmation.confirmation_audit_ref === null || input.user_confirmation.confirmation_audit_ref === undefined) {
      return response(input, "DENIED", ["USER_CONFIRM_BOUNDARY_VIOLATION"], baseAudit, "server:authorization:user-confirm-denied");
    }
    return response(input, "ALLOWED", ["USER_CONFIRM_FACTS_ONLY"], baseAudit, actorGrant.membership_evidence_ref);
  }

  const elevated = input.requested_operation === "DECIDE_ELEVATED_APPROVAL" || input.requested_operation === "PAID_EXPENSE_CORRECTION" || input.requested_operation === "POST_PAID_EXPENSE_CORRECTION";
  if (!elevated) return response(input, "ALLOWED", ["SERVER_CAPABILITY_VERIFIED"], baseAudit, actorGrant.membership_evidence_ref);

  if (input.actor.actor_id !== input.originator.actor_id) {
    return response(input, "ALLOWED", ["INDEPENDENT_APPROVER_VERIFIED"], {
      ...baseAudit,
      control_mechanism: "STANDARD_INDEPENDENT_APPROVAL",
    }, actorGrant.membership_evidence_ref);
  }

  const override = input.owner_override;
  const independentEligible = grants.filter((grant) => grant.organization_id === input.organization_id && grant.membership_status === "ACTIVE" && grant.actor_id !== input.originator.actor_id && ["OWNER", "ADMIN", "ACCOUNTANT"].includes(grant.role) && grant.capabilities.includes(needed));
  const ownerOverrideAllowed = override?.enabled_by_organization_policy === true && override.explicitly_requested === true && typeof override.justification === "string" && override.justification.trim().length > 0 && actorGrant.role === "OWNER" && independentEligible.length === 0;
  if (!ownerOverrideAllowed) return response(input, "DENIED", ["SELF_APPROVAL_PROHIBITED"], baseAudit, "server:authorization:self-approval-denied");
  return response(input, "ALLOWED", ["OWNER_OVERRIDE_AUDITED"], {
    ...baseAudit,
    control_mechanism: "OWNER_OVERRIDE",
    self_approved: true,
    owner_override_reason: override!.justification!.trim(),
  }, actorGrant.membership_evidence_ref);
}

export function assertLedgerServiceCapability(actor: ActorRef, organization_id: AuthorizationDecision["organization_id"], grants: readonly CapabilityGrant[]): void {
  if (actor.actor_type !== "SERVICE" || activeGrant(grants, organization_id, actor, PAID_EXPENSE_CAPABILITIES.ledger_post) === undefined) {
    throw new Error("Ledger Posting Service identity is the only permitted posted-Ledger writer");
  }
}

export function assertAuthorizationDecisionAllowed(decision: AuthorizationDecision, organization_id: AuthorizationDecision["organization_id"], expectedOperations: readonly AuthorizationDecision["requested_operation"][]): void {
  requireNonEmpty(decision.authorization_evidence_ref, "authorization_evidence_ref");
  if (decision.organization_id !== organization_id || decision.decision !== "ALLOWED" || !expectedOperations.includes(decision.requested_operation)) {
    throw new Error("authorization decision is not allowed for this M2 operation");
  }
}
