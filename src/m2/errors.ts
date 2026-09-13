export type M2ErrorCode =
  | "FINGERPRINT_COLLISION"
  | "AUTHORIZATION_DENIED"
  | "INVALID_LEDGER_WRITER"
  | "IMMUTABLE_HISTORY"
  | "M2_CONTRACT_VIOLATION"
  | "INFRASTRUCTURE_FAILURE";

export class M2ContractError extends Error {
  readonly code: M2ErrorCode;
  readonly reason_code: string;

  constructor(code: M2ErrorCode, message: string, reason_code: string) {
    super(message);
    this.name = "M2ContractError";
    this.code = code;
    this.reason_code = reason_code;
  }
}
