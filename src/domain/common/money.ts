import { DomainValidationError, requireNonEmpty } from "./errors.ts";

export type DecimalString = string & { readonly __brand: "DecimalString" };
export type PostingCurrency = "THB";

export interface ExactMoney {
  readonly amount: DecimalString;
  readonly currency: PostingCurrency;
}

export interface SourceMoneyEvidence {
  readonly amount: DecimalString;
  readonly currency: string;
}

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export function decimalString(value: string): DecimalString {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    throw new DomainValidationError(
      "INVALID_SCHEMA",
      "amount must be a non-negative base-10 decimal string without exponent notation",
      "amount",
    );
  }

  return value as DecimalString;
}

export function exactMoney(amount: string, currency: PostingCurrency = "THB"): ExactMoney {
  if (currency !== "THB") {
    throw new DomainValidationError("RULE_VIOLATION", "M1 posting money must use THB", "currency");
  }

  return Object.freeze({ amount: decimalString(amount), currency });
}

export function sourceMoneyEvidence(amount: string, currency: string): SourceMoneyEvidence {
  requireNonEmpty(currency, "currency");
  return Object.freeze({ amount: decimalString(amount), currency });
}

export function sameExactMoney(left: ExactMoney, right: ExactMoney): boolean {
  return left.currency === right.currency && left.amount === right.amount;
}
