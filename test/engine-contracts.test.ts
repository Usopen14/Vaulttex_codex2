import assert from "node:assert/strict";
import test from "node:test";

import {
  DomainValidationError,
  createEngineError,
  createEngineRequest,
  organizationId,
  requestId,
  traceId,
} from "../src/index.ts";

const baseRequest = {
  contractVersion: "0.1",
  requestId: requestId("request-1"),
  traceId: traceId("trace-1"),
  idempotencyKey: "idempotency-1",
  organizationId: organizationId("org-a"),
  actor: { actorType: "USER" as const, actorId: "user-a" },
  requestedAt: "2026-09-10T00:00:00.000Z",
  payload: { kind: "domain-contract-test" },
};

test("mutation-capable EngineRequest requires organization, actor, trace, and idempotency context", () => {
  const request = createEngineRequest(baseRequest);
  assert.equal(request.idempotencyKey, "idempotency-1");
  assert.throws(() => createEngineRequest({ ...baseRequest, idempotencyKey: "" }), DomainValidationError);
  assert.throws(
    () => createEngineRequest({ ...baseRequest, actor: { actorType: "UNKNOWN" as "USER" } }),
    DomainValidationError,
  );
});

test("EngineError has a controlled severity and trace reference", () => {
  const error = createEngineError({
    errorCode: "REVIEW_REQUIRED",
    severity: "REVIEW",
    message: "Confirmation is required",
    retryable: false,
    traceId: traceId("trace-1"),
  });

  assert.equal(error.errorCode, "REVIEW_REQUIRED");
  assert.throws(
    () => createEngineError({ ...error, severity: "OTHER" as "REVIEW" }),
    DomainValidationError,
  );
});
