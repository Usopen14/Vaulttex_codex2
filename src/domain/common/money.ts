import { WendyDomainError } from "./errors.ts";

export type DecimalString = string & { readonly __brand: "DecimalString" };
export type Currency = "THB";

export interface Money {
  readonly value: DecimalString;
  readonly currency: Currency;
}

const CANONICAL_DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

export function canonicalDecimal(value: string): DecimalString {
  if (typeof value !== "string" || !CANONICAL_DECIMAL_PATTERN.test(value)) {
    throw new WendyDomainError(
      "INVALID_SCHEMA",
      "money value must be canonical base-10 decimal text without sign, exponent, separators, or redundant leading zeroes",
      { field: "amount.value", rule_id: "MON-001" },
    );
  }

  return value as DecimalString;
}

export function money(value: string, currency: Currency): Money {
  const canonicalValue = canonicalDecimal(value);
  if (currency !== "THB") {
    throw new WendyDomainError("RULE_VIOLATION", "M1/M5 Money currency must be THB", {
      field: "amount.currency",
      rule_id: "MON-003",
    });
  }

  const fractionalDigits = canonicalValue.split(".")[1]?.length ?? 0;
  if (fractionalDigits > 2) {
    throw new WendyDomainError("RULE_VIOLATION", "M1/M5 Money supports at most two fractional digits", {
      field: "amount.value",
      rule_id: "MON-003",
    });
  }

  if (canonicalValue === "0" || canonicalValue === "0.0" || canonicalValue === "0.00") {
    throw new WendyDomainError("RULE_VIOLATION", "first-slice Money value must be greater than zero", {
      field: "amount.value",
      rule_id: "MON-002",
    });
  }

  return Object.freeze({ value: canonicalValue, currency });
}

export function sameMoney(left: Money, right: Money): boolean {
  if (left.currency !== right.currency) {
    throw new WendyDomainError("RULE_VIOLATION", "Money currency mismatch", {
      field: "amount.currency",
      rule_id: "PAIR-001",
    });
  }

  return normalizeComparableDecimal(left.value) === normalizeComparableDecimal(right.value);
}

/**
 * The normative decimal grammar permits both `1` and `1.00`. Compare their
 * exact decimal values without binary floating point or implicit rounding.
 */
function normalizeComparableDecimal(value: DecimalString): string {
  const [whole, fractional = ""] = value.split(".");
  const trimmedFractional = fractional.replace(/0+$/, "");
  return trimmedFractional.length === 0 ? whole! : `${whole}.${trimmedFractional}`;
}
