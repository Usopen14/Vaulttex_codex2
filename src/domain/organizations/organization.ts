import { DomainValidationError, requireNonEmpty } from "../common/errors.ts";
import type { MembershipId, OrganizationId, UserId } from "../common/ids.ts";

export interface Organization {
  readonly organizationId: OrganizationId;
  readonly legalName: string;
  readonly displayName: string;
  readonly status: string;
}

export interface OrganizationMembership {
  readonly membershipId: MembershipId;
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly roleKey: string;
  readonly status: string;
}

export interface OrganizationScoped {
  readonly organizationId: OrganizationId;
}

export function createOrganization(input: Organization): Organization {
  return Object.freeze({
    ...input,
    legalName: requireNonEmpty(input.legalName, "legalName"),
    displayName: requireNonEmpty(input.displayName, "displayName"),
    status: requireNonEmpty(input.status, "status"),
  });
}

export function createOrganizationMembership(input: OrganizationMembership): OrganizationMembership {
  return Object.freeze({
    ...input,
    roleKey: requireNonEmpty(input.roleKey, "roleKey"),
    status: requireNonEmpty(input.status, "status"),
  });
}

export function assertSameOrganization(
  expectedOrganizationId: OrganizationId,
  ...entities: OrganizationScoped[]
): void {
  for (const entity of entities) {
    if (entity.organizationId !== expectedOrganizationId) {
      throw new DomainValidationError(
        "RULE_VIOLATION",
        "organization-scoped entities must belong to the same organization",
        "organizationId",
      );
    }
  }
}
