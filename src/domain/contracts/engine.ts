import { WendyDomainError, type WendyErrorCode, type WendyErrorSeverity, requireNonEmpty } from "../common/errors.ts";
import type { ContentHash, IdempotencyKey, OrganizationId, RequestId, SchemaVersion, TraceId } from "../common/ids.ts";
import type { Rfc3339Timestamp } from "../common/time.ts";

export type EngineActorType = "USER" | "SERVICE" | "AI_PROPOSAL" | "INTEGRATION";
export type ValidationDisposition = "PASS" | "REVIEW_REQUIRED" | "REJECT" | "DUPLICATE";

export interface EngineActorRef {
  readonly actor_type: EngineActorType;
  readonly actor_id?: string;
}

export interface EngineContract {
  readonly contract_name: string;
  readonly contract_version: SchemaVersion;
}

export interface EngineRequest<Payload> {
  readonly contract_version: SchemaVersion;
  readonly request_id: RequestId;
  readonly trace_id: TraceId;
  readonly idempotency_key?: IdempotencyKey;
  readonly organization_id: OrganizationId;
  readonly actor: EngineActorRef;
  readonly requested_at: Rfc3339Timestamp;
  readonly payload: Payload;
}

export interface EngineResponse<Data> {
  readonly contract_version: SchemaVersion;
  readonly request_id: RequestId;
  readonly trace_id: TraceId;
  readonly organization_id: OrganizationId;
  readonly data?: Data;
  readonly errors: readonly WendyError[];
}

export interface WendyError {
  readonly error_code: WendyErrorCode;
  readonly severity: WendyErrorSeverity;
  readonly message: string;
  readonly field?: string;
  readonly rule_id?: string;
  readonly retryable: boolean;
  readonly trace_id: TraceId;
}

const ENGINE_ACTOR_TYPES: ReadonlySet<string> = new Set(["USER", "SERVICE", "AI_PROPOSAL", "INTEGRATION"]);
const ERROR_SEVERITIES: ReadonlySet<string> = new Set(["WARNING", "REVIEW", "BLOCKING", "SYSTEM"]);

export function createEngineContract(input: EngineContract): EngineContract {
  return Object.freeze({ ...input, contract_name: requireNonEmpty(input.contract_name, "contract_name") });
}

export function createEngineRequest<Payload>(input: EngineRequest<Payload>): EngineRequest<Payload> {
  if (!ENGINE_ACTOR_TYPES.has(input.actor.actor_type)) {
    throw new WendyDomainError("INVALID_SCHEMA", "EngineRequest actor_type is invalid", { field: "actor.actor_type" });
  }
  if (input.actor.actor_id !== undefined) requireNonEmpty(input.actor.actor_id, "actor.actor_id");

  return Object.freeze({
    ...input,
    actor: Object.freeze({ ...input.actor }),
  });
}

export function requireMutationIdempotency<Payload>(request: EngineRequest<Payload>, operation: string): IdempotencyKey {
  requireNonEmpty(operation, "operation");
  if (request.idempotency_key === undefined) {
    throw new WendyDomainError("INVALID_SCHEMA", "mutation-capable request requires idempotency_key", {
      field: "idempotency_key",
      rule_id: "IDEMP-001",
    });
  }
  return request.idempotency_key;
}

export function assertIdempotencyInputMatches(
  existing_idempotency_key: IdempotencyKey,
  incoming_idempotency_key: IdempotencyKey,
  existing_input_hash: ContentHash,
  incoming_input_hash: ContentHash,
): void {
  if (existing_idempotency_key === incoming_idempotency_key && existing_input_hash !== incoming_input_hash) {
    throw new WendyDomainError("IDEMPOTENCY_CONFLICT", "idempotency key cannot be reused with changed input", {
      rule_id: "IDEMP-002",
    });
  }
}

export function createEngineResponse<Data>(input: EngineResponse<Data>): EngineResponse<Data> {
  return Object.freeze({ ...input, errors: Object.freeze([...input.errors]) });
}

export function createWendyError(input: WendyError): WendyError {
  if (!ERROR_SEVERITIES.has(input.severity)) {
    throw new WendyDomainError("INVALID_SCHEMA", "WendyError severity is invalid", { field: "severity" });
  }
  return Object.freeze({ ...input, message: requireNonEmpty(input.message, "message") });
}

export function assertOnlyKnownFields(value: Record<string, unknown>, allowed_fields: readonly string[]): void {
  const allowed = new Set(allowed_fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new WendyDomainError("INVALID_SCHEMA", `unknown field: ${key}`, { rule_id: "EVT-CORE-002", field: key });
    }
  }
}
