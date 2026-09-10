import assert from "node:assert/strict";
import test from "node:test";

import {
  DomainValidationError,
  assertSameOrganization,
  createAccountingProfile,
  createOrganization,
  createOrganizationMembership,
  createTaxProfile,
  membershipId,
  organizationId,
  taxProfileId,
  userId,
} from "../src/index.ts";

const organizationA = organizationId("org-a");
const organizationB = organizationId("org-b");

test("organization boundary requires every compared entity to have the same organization", () => {
  const organization = createOrganization({
    organizationId: organizationA,
    legalName: "Vault Demo Co., Ltd.",
    displayName: "Vault Demo",
    status: "ACTIVE",
  });
  const membership = createOrganizationMembership({
    membershipId: membershipId("membership-a"),
    organizationId: organizationA,
    userId: userId("user-a"),
    roleKey: "unresolved-role",
    status: "ACTIVE",
  });

  assertSameOrganization(organizationA, organization, membership);
  assert.throws(() => assertSameOrganization(organizationA, { organizationId: organizationB }), DomainValidationError);
});

test("AccountingProfile is THB-only while fiscal dates and timezone remain explicit", () => {
  const profile = createAccountingProfile({
    organizationId: organizationA,
    fiscalYearStart: "2026-01-01",
    fiscalYearEnd: "2026-12-31",
    accountingStandard: "approved-standard-ref",
    entityType: "approved-entity-type-ref",
    functionalCurrency: "THB",
    timezone: "Asia/Bangkok",
  });

  assert.equal(profile.functionalCurrency, "THB");
  assert.throws(
    () => createAccountingProfile({ ...profile, functionalCurrency: "USD" as "THB" }),
    DomainValidationError,
  );
});

test("TaxProfile is configuration metadata only and has no tax calculation", () => {
  const profile = createTaxProfile({
    taxProfileId: taxProfileId("tax-profile-a"),
    organizationId: organizationA,
    jurisdiction: "approved-jurisdiction-ref",
    status: "configuration-pending",
    effectiveFrom: "2026-01-01",
  });

  assert.equal(profile.status, "configuration-pending");
  assert.throws(
    () => createTaxProfile({ ...profile, effectiveTo: "2025-12-31" }),
    DomainValidationError,
  );
});

test("profiles reject calendar-impossible dates", () => {
  assert.throws(
    () => createAccountingProfile({
      organizationId: organizationA,
      fiscalYearStart: "2026-02-29",
      fiscalYearEnd: "2026-12-31",
      accountingStandard: "approved-standard-ref",
      entityType: "approved-entity-type-ref",
      functionalCurrency: "THB",
      timezone: "Asia/Bangkok",
    }),
    DomainValidationError,
  );
});
