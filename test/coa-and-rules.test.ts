import assert from "node:assert/strict";
import test from "node:test";

import {
  DomainValidationError,
  accountId,
  assertAccountUsesCOAVersion,
  assertRuleVersionBelongsTo,
  coaVersionId,
  createAccount,
  createCOAVersion,
  createReportingMapping,
  createRuleSet,
  createRuleVersion,
  organizationId,
  ruleSetId,
  ruleVersionId,
} from "../src/index.ts";

const organizationA = organizationId("org-a");
const organizationB = organizationId("org-b");

test("COA accounts use stable keys, version identities, and organization-scoped versions", () => {
  const version = createCOAVersion({
    coaVersionId: coaVersionId("coa-a-v1"),
    organizationId: organizationA,
    version: "0.1",
    effectiveFrom: "2026-01-01",
    status: "DRAFT",
  });
  const account = createAccount({
    accountId: accountId("account-marketing"),
    organizationId: organizationA,
    stableKey: "system.expense.marketing_advertising",
    displayName: "Marketing / Advertising Expense",
    accountClass: "OPERATING_EXPENSE",
    accountRole: "marketing_advertising_expense",
    coaVersionId: version.coaVersionId,
    active: true,
  });

  assertAccountUsesCOAVersion(account, version);
  assert.throws(
    () => assertAccountUsesCOAVersion({ ...account, organizationId: organizationB }, version),
    DomainValidationError,
  );
});

test("reporting mapping revisions are effective-dated and never depend on a display name", () => {
  const mapping = createReportingMapping({
    mappingId: "mapping-1",
    reportingTag: "approved-reporting-tag-ref",
    mappingVersion: "0.1",
    effectiveFrom: "2026-01-01",
  });

  assert.equal(mapping.mappingVersion, "0.1");
  assert.throws(
    () => createReportingMapping({ ...mapping, effectiveTo: "2025-12-31" }),
    DomainValidationError,
  );
});

test("rule foundations preserve identity and effective-date versioning without executing rules", () => {
  const ruleSet = createRuleSet({
    ruleSetId: ruleSetId("rule-set-expense"),
    organizationId: organizationA,
    domain: "ACCOUNTING",
    status: "DRAFT",
  });
  const version = createRuleVersion({
    ruleVersionId: ruleVersionId("rule-version-expense-1"),
    ruleSetId: ruleSet.ruleSetId,
    version: "0.1",
    effectiveFrom: "2026-01-01",
    logicRef: "approved-rule-artifact-ref",
    changeReason: "initial approved rule artifact",
  });

  assertRuleVersionBelongsTo(version, ruleSet);
  assert.throws(
    () => assertRuleVersionBelongsTo({ ...version, ruleSetId: ruleSetId("other-rule-set") }, ruleSet),
    DomainValidationError,
  );
});
