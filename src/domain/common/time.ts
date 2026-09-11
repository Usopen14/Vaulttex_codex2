import { WendyDomainError, requireNonEmpty } from "./errors.ts";

export type IsoDate = string & { readonly __brand: "IsoDate" };
export type Rfc3339Timestamp = string & { readonly __brand: "Rfc3339Timestamp" };

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RFC3339_OFFSET_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isoDate(value: string, field = "date"): IsoDate {
  requireNonEmpty(value, field);
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    throw new WendyDomainError("INVALID_SCHEMA", `${field} must use YYYY-MM-DD`, { field });
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new WendyDomainError("INVALID_SCHEMA", `${field} must be a real calendar date`, { field });
  }

  return value as IsoDate;
}

export function rfc3339Timestamp(value: string, field = "timestamp"): Rfc3339Timestamp {
  requireNonEmpty(value, field);
  if (!RFC3339_OFFSET_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new WendyDomainError("INVALID_SCHEMA", `${field} must be RFC 3339 with an explicit UTC offset`, { field });
  }

  return value as Rfc3339Timestamp;
}

export function assertDateNotBefore(start: IsoDate, end: IsoDate, field: string): void {
  if (end < start) {
    throw new WendyDomainError("INVALID_SCHEMA", `${field} must not be before its start date`, { field });
  }
}
