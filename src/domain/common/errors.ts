export type WendyErrorCode =
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
  | "EVENT_SEMANTICS_UNSUPPORTED"
  | "INTERNAL_ERROR";

export type WendyErrorSeverity = "WARNING" | "REVIEW" | "BLOCKING" | "SYSTEM";

export class WendyDomainError extends Error {
  readonly error_code: WendyErrorCode;
  readonly field?: string;
  readonly rule_id?: string;

  constructor(
    error_code: WendyErrorCode,
    message: string,
    options: { field?: string; rule_id?: string } = {},
  ) {
    super(message);
    this.name = "WendyDomainError";
    this.error_code = error_code;
    if (options.field !== undefined) this.field = options.field;
    if (options.rule_id !== undefined) this.rule_id = options.rule_id;
  }
}

export function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WendyDomainError("INVALID_SCHEMA", `${field} is required`, { field });
  }

  return value;
}

export function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new WendyDomainError("INVALID_SCHEMA", `${field} must be a positive safe integer`, { field });
  }

  return value;
}

export function requireArrayNotEmpty<T>(value: readonly T[], field: string): readonly T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new WendyDomainError("INVALID_SCHEMA", `${field} must contain at least one item`, { field });
  }

  return value;
}
