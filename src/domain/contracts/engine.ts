import { DomainValidationError, requireNonEmpty } from "../common/errors.ts";
import type { OrganizationId, RequestId, TraceId } from "../common/ids.ts";

export type ActorType = "USER" | "SERVICE" | "AI_PROPOSAL" | "INTEGRATION";
export type EngineErrorSeverity = "WARNING" | "REVIEW" | "BLOCKING" | "SYSTEM";

export type EngineErrorCode =
  | "INVALID_SCHEMA"
  | "SOURCE_MISSING"
  | "DUPLICATE_SOURCE"
  | "DUPLICATE_EVENT"
  | "CLASSIFICATION_UNCERTAIN"
  | "REVIEW_REQUIRED"
  | "RULE_VIOLATION"
  | "ACCOUNT_NOT_FOUND"
  | "TAX_PROFILE_MISSING"
  | "PERIOD_CLOSED"
  | "PERIOD_LOCKED"
  | "JOURNAL_UNBALANCED"
  | "LEDGER_POST_FAILED"
  | "RECONCILIATION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "STALE_FINANCIAL_STATE"
  | "INTERNAL_ERROR";

export interface EngineActor {
  readonly actorType: ActorType;
  readonly actorId?: string;
}

export interface EngineRequest<Payload> {
  readonly contractVersion: string;
  readonly requestId: RequestId;
  readonly traceId: TraceId;
  readonly idempotencyKey: string;
  readonly organizationId: OrganizationId;
  readonly actor: EngineActor;
  readonly requestedAt: string;
  readonly payload: Payload;
}

export interface EngineError {
  readonly errorCode: EngineErrorCode;
  readonly severity: EngineErrorSeverity;
  readonly message: string;
  readonly field?: string;
  readonly ruleId?: string;
  readonly retryable: boolean;
  readonly traceId: TraceId;
}

const ACTOR_TYPES: ReadonlySet<string> = new Set(["USER", "SERVICE", "AI_PROPOSAL", "INTEGRATION"]);
const ERROR_SEVERITIES: ReadonlySet<string> = new Set(["WARNING", "REVIEW", "BLOCKING", "SYSTEM"]);

export function createEngineRequest<Payload>(input: EngineRequest<Payload>): EngineRequest<Payload> {
  requireNonEmpty(input.contractVersion, "contractVersion");
  requireNonEmpty(input.idempotencyKey, "idempotencyKey");
  requireNonEmpty(input.requestedAt, "requestedAt");

  if (!ACTOR_TYPES.has(input.actor.actorType)) {
    throw new DomainValidationError("INVALID_SCHEMA", "actorType is not supported", "actor.actorType");
  }

  return Object.freeze({
    ...input,
    actor: Object.freeze({ ...input.actor }),
  });
}

export function createEngineError(input: EngineError): EngineError {
  if (!ERROR_SEVERITIES.has(input.severity)) {
    throw new DomainValidationError("INVALID_SCHEMA", "severity is not supported", "severity");
  }

  return Object.freeze({
    ...input,
    message: requireNonEmpty(input.message, "message"),
  });
}
