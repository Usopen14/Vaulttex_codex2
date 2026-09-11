import assert from "node:assert/strict";
import test from "node:test";
import * as Wendy from "../src/index.ts";
import {
  WendyDomainError,
  accountId,
  accountingPeriodId,
  assertActiveCompatibleAccountPath,
  assertPaidExpensePair,
  assertUniqueAccountCodes,
  coaVersionId,
  createAccount,
  createAccountingPeriod,
  createEventRelationship,
  transitionAccountingPeriod,
  validateMinimumCOASeed,
  type Account,
} from "../src/index.ts";
import { expenseEvent, fulfillsRelationship, ids, paymentEvent, user } from "./m1-fixtures.ts";

function assertDomainError(callback: () => unknown, code: WendyDomainError["error_code"]): void {
  assert.throws(callback, (error: unknown) => error instanceof WendyDomainError && error.error_code === code);
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    account_id: accountId("0ac58877-f02d-4f6d-b38e-aa2191053c27"),
    organization_id: ids.organization,
    code: "6110",
    name: "Marketing expense",
    account_type: "EXPENSE",
    normal_balance: "DEBIT",
    parent_account_id: null,
    posting_mode: "POSTABLE",
    control: "SYSTEM",
    status: "ACTIVE",
    reporting_tag: "EXPENSE.OPERATING.MARKETING",
    system_key: "SYS.EXPENSE.MARKETING",
    coa_version_id: coaVersionId("1ac58877-f02d-4f6d-b38e-aa2191053c27"),
    created_at: ids.timestamp,
    created_by: user,
    ...overrides,
  };
}

test("AccountingPeriod has the normative deterministic M1 transition graph", () => {
  let period = createAccountingPeriod({
    accounting_period_id: accountingPeriodId("2ac58877-f02d-4f6d-b38e-aa2191053c27"),
    organization_id: ids.organization,
    start_date: ids.date,
    end_date: ids.date,
    status: "OPEN",
    period_version: 1,
    created_at: ids.timestamp,
    created_by: user,
  });
  for (const to_status of ["PRE_CLOSE", "REVIEW", "ADJUSTING", "READY_TO_CLOSE", "CLOSED", "LOCKED"] as const) {
    period = transitionAccountingPeriod(period, {
      accounting_period_id: period.accounting_period_id,
      from_status: period.status,
      to_status,
      expected_period_version: period.period_version,
      transitioned_at: ids.timestamp,
      transitioned_by: user,
    });
  }
  assert.equal(period.status, "LOCKED");
  assertDomainError(() => transitionAccountingPeriod(period, { accounting_period_id: period.accounting_period_id, from_status: "LOCKED", to_status: "CLOSED", expected_period_version: period.period_version, transitioned_at: ids.timestamp, transitioned_by: user }), "RULE_VIOLATION");
});

test("COA seed is exact and account invariants reject policy-breaking shape", () => {
  validateMinimumCOASeed();
  assert.equal(Wendy.MINIMUM_COA_SEED.length, 33);
  assert.equal(Wendy.MINIMUM_COA_SEED.find((seed) => seed.system_key === "SYS.EXPENSE.MARKETING")?.posting_mode, "POSTABLE");
  assert.equal(Wendy.MINIMUM_COA_SEED.find((seed) => seed.system_key === "SYS.ASSET.CASH.BANK")?.posting_mode, "HEADER");
  assertDomainError(() => validateMinimumCOASeed(Wendy.MINIMUM_COA_SEED.slice(1)), "RULE_VIOLATION");
  assertDomainError(() => createAccount(account({ posting_mode: "HEADER", reporting_tag: "EXPENSE.OPERATING.MARKETING" })), "RULE_VIOLATION");
  assertDomainError(() => createAccount(account({ control: "CUSTOM", system_key: "SYS.IMPERSONATION" })), "RULE_VIOLATION");
  const root = createAccount(account({ account_id: accountId("3ac58877-f02d-4f6d-b38e-aa2191053c27"), code: "6000", name: "Operating expenses", posting_mode: "HEADER", reporting_tag: null, system_key: "SYS.EXPENSE.OPERATING" }));
  const child = createAccount(account({ parent_account_id: root.account_id }));
  assertActiveCompatibleAccountPath(child, [root]);
  assertDomainError(() => assertUniqueAccountCodes([root, account({ account_id: accountId("4ac58877-f02d-4f6d-b38e-aa2191053c27"), code: root.code })]), "RULE_VIOLATION");
});

test("paid expense invariant preserves two events and exactly one directional FULFILLS link", () => {
  const expense = Wendy.createFinancialEvent(expenseEvent());
  const payment = Wendy.createFinancialEvent(paymentEvent());
  const relationship = createEventRelationship(fulfillsRelationship());
  assertPaidExpensePair(expense, payment, [relationship]);
  assertDomainError(() => assertPaidExpensePair(expense, payment, []), "RULE_VIOLATION");
  assertDomainError(() => assertPaidExpensePair(expense, payment, [relationship, relationship]), "RULE_VIOLATION");
  assertDomainError(() => assertPaidExpensePair(expense, payment, [createEventRelationship(fulfillsRelationship({ from_event_id: expense.event_id, to_event_id: payment.event_id }))]), "RULE_VIOLATION");
});

test("M1 public surface excludes M2 engines and mutable financial outputs", () => {
  for (const forbiddenExport of ["JournalDraft", "PostingAuthorization", "Ledger", "postBalancedEntry", "calculateTax", "reconcile", "buildFinancialState", "LINE", "AIIntegration"]) {
    assert.equal(Object.hasOwn(Wendy, forbiddenExport), false, `${forbiddenExport} must not be exported in M1`);
  }
});
