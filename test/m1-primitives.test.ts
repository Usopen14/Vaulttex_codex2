import assert from "node:assert/strict";
import test from "node:test";
import {
  WendyDomainError,
  actorId,
  actorRef,
  assertSameOrganization,
  canonicalDecimal,
  createAccountingProfile,
  createOrganization,
  createOrganizationMembership,
  createTaxPeriod,
  isoDate,
  membershipId,
  money,
  organizationId,
  rfc3339Timestamp,
  sameMoney,
  taxPeriodId,
  uuid,
} from "../src/index.ts";
import { ids } from "./m1-fixtures.ts";

function assertDomainError(callback: () => unknown, code: WendyDomainError["error_code"]): void {
  assert.throws(callback, (error: unknown) => error instanceof WendyDomainError && error.error_code === code);
}

test("M1 identity primitives require lowercase RFC 4122 UUIDs and real dates", () => {
  assert.equal(uuid("8dc58877-f02d-4f6d-b38e-aa2191053c27"), ids.organization);
  assertDomainError(() => uuid("8DC58877-F02D-4F6D-B38E-AA2191053C27"), "INVALID_SCHEMA");
  assertDomainError(() => isoDate("2026-02-30"), "INVALID_SCHEMA");
  assert.equal(rfc3339Timestamp("2026-09-10T10:00:00+07:00"), ids.timestamp);
});

test("M1 Money is positive canonical THB with at most two fractional digits", () => {
  assert.deepEqual(money("3500.00", "THB"), { value: "3500.00", currency: "THB" });
  assert.equal(canonicalDecimal("0.01"), "0.01");
  assert.equal(sameMoney(money("1", "THB"), money("1.00", "THB")), true);
  for (const value of ["01", "+1", "1e2", "-0", "0", "1.000"]) {
    assert.throws(() => money(value, "THB"));
  }
});

test("M1 organization boundary keeps roles scoped and ActorRef limited to USER or SERVICE", () => {
  const organization = createOrganization({
    organization_id: ids.organization,
    legal_name: "Vault Test Co., Ltd.",
    display_name: "Vault Test",
    status: "ACTIVE",
  });
  assert.equal(organization.organization_id, ids.organization);
  const membership = createOrganizationMembership({
    membership_id: membershipId("0dc58877-f02d-4f6d-b38e-aa2191053c27"),
    organization_id: ids.organization,
    actor_id: actorId("1dc58877-f02d-4f6d-b38e-aa2191053c27"),
    role: "ACCOUNTANT",
    status: "ACTIVE",
  });
  assert.equal(membership.role, "ACCOUNTANT");
  assertDomainError(() => actorRef({ actor_type: "AI_PROPOSAL" as never, actor_id: ids.actor, display_name: null }), "INVALID_SCHEMA");
  assertSameOrganization(ids.organization, organization, membership);
  assertDomainError(() => assertSameOrganization(ids.organization, { organization_id: organizationId("9dc58877-f02d-4f6d-b38e-aa2191053c27") }), "RULE_VIOLATION");
});

test("M1 profiles preserve THB boundary and TaxPeriod is structural without workflow state", () => {
  const accountingProfile = createAccountingProfile({
    organization_id: ids.organization,
    fiscal_year_start: isoDate("2026-01-01"),
    fiscal_year_end: isoDate("2026-12-31"),
    accounting_standard: "TBD by organization policy",
    entity_type: "TBD by organization policy",
    functional_currency: "THB",
    timezone: "Asia/Bangkok",
  });
  assert.equal(accountingProfile.functional_currency, "THB");
  const taxPeriod = createTaxPeriod({
    tax_period_id: taxPeriodId("adc58877-f02d-4f6d-b38e-aa2191053c27"),
    organization_id: ids.organization,
    start_date: isoDate("2026-09-01"),
    end_date: isoDate("2026-09-30"),
  });
  assert.deepEqual(Object.keys(taxPeriod).sort(), ["end_date", "organization_id", "start_date", "tax_period_id"]);
});
