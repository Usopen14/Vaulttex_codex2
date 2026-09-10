import { DomainValidationError, requireNonEmpty, requirePositiveInteger } from "../common/errors.ts";
import type {
  EconomicGroupId,
  FinancialEventId,
  FinancialEventRelationId,
  OrganizationId,
  TraceId,
} from "../common/ids.ts";
import type { ExactMoney } from "../common/money.ts";

export type FinancialEffect = "NONE" | "CANDIDATE" | "REQUIRED";

export interface FinancialEventIdentity {
  readonly eventId: FinancialEventId;
  readonly organizationId: OrganizationId;
  readonly eventType: string;
  readonly eventDomain: string;
  readonly eventVersion: number;
  readonly economicGroupId?: EconomicGroupId;
  readonly sourceRefs: readonly string[];
  readonly traceId: TraceId;
  readonly status: string;
  readonly accountingEffect: FinancialEffect;
  readonly taxEffect: FinancialEffect;
  readonly cashEffect: FinancialEffect;
}

export interface FinancialEventRelation {
  readonly relationId: FinancialEventRelationId;
  readonly organizationId: OrganizationId;
  readonly fromEventId: FinancialEventId;
  readonly toEventId: FinancialEventId;
  readonly relationType: string;
  readonly traceId: TraceId;
}

export interface FirstExpensePaymentEventSet {
  readonly organizationId: OrganizationId;
  readonly economicGroupId: EconomicGroupId;
  readonly traceId: TraceId;
  readonly sourceRefs: readonly string[];
  readonly confirmationRef?: string;
  readonly approvalLevel: "USER_CONFIRM";
  readonly expenseRecognized: FinancialEventIdentity & {
    readonly eventType: "ExpenseRecognized";
    readonly eventDomain: "ACCOUNTING_RECOGNITION";
    readonly effectiveDate: string;
    readonly amount: ExactMoney;
    readonly categoryRole: "marketing_advertising_expense";
  };
  readonly paymentMade: FinancialEventIdentity & {
    readonly eventType: "PaymentMade";
    readonly eventDomain: "PAYMENT";
    readonly paymentDate: string;
    readonly amount: ExactMoney;
    readonly paymentAccountRole: "cash_on_hand" | "bank";
  };
  readonly relation: FinancialEventRelation;
}

const FINANCIAL_EFFECTS: ReadonlySet<string> = new Set(["NONE", "CANDIDATE", "REQUIRED"]);

export function createFinancialEventIdentity(input: FinancialEventIdentity): FinancialEventIdentity {
  requireNonEmpty(input.eventType, "eventType");
  requireNonEmpty(input.eventDomain, "eventDomain");
  requirePositiveInteger(input.eventVersion, "eventVersion");
  requireNonEmpty(input.status, "status");

  if (input.sourceRefs.length === 0 || input.sourceRefs.some((reference) => reference.trim().length === 0)) {
    throw new DomainValidationError("SOURCE_MISSING", "Financial Event requires non-empty source references", "sourceRefs");
  }

  for (const effect of [input.accountingEffect, input.taxEffect, input.cashEffect]) {
    if (!FINANCIAL_EFFECTS.has(effect)) {
      throw new DomainValidationError("INVALID_SCHEMA", "financial effect is not supported", "effect");
    }
  }

  return Object.freeze({ ...input, sourceRefs: Object.freeze([...input.sourceRefs]) });
}

export function createFinancialEventRelation(input: FinancialEventRelation): FinancialEventRelation {
  requireNonEmpty(input.relationType, "relationType");
  if (input.fromEventId === input.toEventId) {
    throw new DomainValidationError("RULE_VIOLATION", "Financial Event relation cannot self-reference", "toEventId");
  }

  return Object.freeze({ ...input });
}

export function assertRelatedEventsShareOrganization(
  relation: FinancialEventRelation,
  fromEvent: FinancialEventIdentity,
  toEvent: FinancialEventIdentity,
): void {
  if (
    relation.organizationId !== fromEvent.organizationId ||
    relation.organizationId !== toEvent.organizationId ||
    relation.fromEventId !== fromEvent.eventId ||
    relation.toEventId !== toEvent.eventId
  ) {
    throw new DomainValidationError(
      "RULE_VIOLATION",
      "Financial Event relation must link events in the same organization",
      "organizationId",
    );
  }
}
