export class DomainValidationError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "DomainValidationError";
    this.code = code;
    this.field = field;
  }
}

export function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainValidationError("INVALID_SCHEMA", `${field} is required`, field);
  }

  return value;
}

export function requireIsoDate(value: string, field: string): string {
  requireNonEmpty(value, field);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new DomainValidationError("INVALID_SCHEMA", `${field} must use YYYY-MM-DD`, field);
  }

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new DomainValidationError("INVALID_SCHEMA", `${field} must be a real calendar date`, field);
  }

  return value;
}

export function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DomainValidationError("INVALID_SCHEMA", `${field} must be a positive safe integer`, field);
  }

  return value;
}
