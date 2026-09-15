export type M3ErrorCode =
  | "M3_CONTRACT_VIOLATION"
  | "M3_AUTHORIZATION_DENIED"
  | "M3_IMMUTABLE_HISTORY"
  | "M3_ADMISSION_REJECTED"
  | "M3_SCHEMA_VERSION_UNSUPPORTED"
  | "M3_INFRASTRUCTURE_FAILURE";

/** Typed operational error used only by the M3 source/evidence substrate. */
export class M3ContractError extends Error {
  readonly code: M3ErrorCode;
  readonly reason_code: string;

  constructor(code: M3ErrorCode, message: string, reason_code: string) {
    super(message);
    this.name = "M3ContractError";
    this.code = code;
    this.reason_code = reason_code;
  }
}

/** Internal boundary signal: commit the standalone denial audit, never a protected mutation. */
export class M3AuthorizationDeniedError extends M3ContractError {
  constructor(reason_code: string) {
    super("M3_AUTHORIZATION_DENIED", "a matching trusted authorization is required", reason_code);
    this.name = "M3AuthorizationDeniedError";
  }
}
