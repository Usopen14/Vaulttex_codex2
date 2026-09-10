import assert from "node:assert/strict";
import test from "node:test";

import * as wendyDomain from "../src/index.ts";

test("M1 exports contracts only and exposes no posting, tax, reconciliation, or state builder command", () => {
  const forbiddenM1Exports = [
    "postJournal",
    "postBalancedEntry",
    "calculateTax",
    "reconcile",
    "buildFinancialState",
    "sendLineMessage",
    "executeAI",
  ];

  for (const exportName of forbiddenM1Exports) {
    assert.equal(exportName in wendyDomain, false, `${exportName} is outside M1 scope`);
  }
});
