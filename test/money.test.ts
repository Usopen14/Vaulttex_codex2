import assert from "node:assert/strict";
import test from "node:test";

import { DomainValidationError, decimalString, exactMoney, sourceMoneyEvidence } from "../src/index.ts";

test("exact money preserves a base-10 decimal string and THB", () => {
  assert.deepEqual(exactMoney("3500.00"), { amount: "3500.00", currency: "THB" });
  assert.equal(decimalString("0.125"), "0.125");
});

test("exact money rejects binary-float-like and exponent inputs", () => {
  assert.throws(() => decimalString("3.5e3"), DomainValidationError);
  assert.throws(() => decimalString("3500.0 "), DomainValidationError);
  assert.throws(() => exactMoney("3500.00", "USD"), DomainValidationError);
});

test("foreign source money remains evidence without reinterpreting its source currency", () => {
  assert.deepEqual(sourceMoneyEvidence("100.00", "USD"), { amount: "100.00", currency: "USD" });
  assert.deepEqual(sourceMoneyEvidence("100.00", "foreign-currency-as-received"), {
    amount: "100.00",
    currency: "foreign-currency-as-received",
  });
});
