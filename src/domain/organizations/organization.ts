import { WendyDomainError, requireNonEmpty } from "../common/errors.ts";
import type { ActorId, MembershipId, OrganizationId } from "../common/ids.ts";

export const ORGANIZATION_ROLES = [
  "OWNER",
  "ADMIN",
  "PREPARER",
  "REVIEWER",
  "APPROVER",
  "ACCOUNTANT",
  "TAX_PREPARER",
  "TAX_APPROVER",
  "CLOSE_ADMIN",
  "AUDITOR_READ_ONLY",
  "SERVICE",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];
export type ActorType = "USER" | "SERVICE";

export interface ActorRef {
  readonly actor_type: ActorType;
  readonly actor_id: ActorId;
  readonly display_name: string | null;
}

export interface Organization {
  readonly organization_id: OrganizationId;
  readonly legal_name: string;
  readonly display_name: string;
  readonly status: string;
}

export interface OrganizationMembership {
  readonly membership_id: MembershipId;
  readonly organization_id: OrganizationId;
  readonly actor_id: ActorId;
  readonly role: OrganizationRole;
  readonly status: string;
}

export interface OrganizationScoped {
  readonly organization_id: OrganizationId;
}

const ORGANIZATION_ROLE_SET: ReadonlySet<string> = new Set(ORGANIZATION_ROLES);

export function actorRef(input: ActorRef): ActorRef {
  if (input.actor_type !== "USER" && input.actor_type !== "SERVICE") {
    throw new WendyDomainError("INVALID_SCHEMA", "ActorRef actor_type must be USER or SERVICE", { field: "actor_type" });
  }

  if (input.display_name !== null && input.display_name.trim().length === 0) {
    throw new WendyDomainError("INVALID_SCHEMA", "display_name must be null or non-empty", { field: "display_name" });
  }

  return Object.freeze({ ...input });
}

export function createOrganization(input: Organization): Organization {
  return Object.freeze({
    ...input,
    legal_name: requireNonEmpty(input.legal_name, "legal_name"),
    display_name: requireNonEmpty(input.display_name, "display_name"),
    status: requireNonEmpty(input.status, "status"),
  });
}

export function createOrganizationMembership(input: OrganizationMembership): OrganizationMembership {
  if (!ORGANIZATION_ROLE_SET.has(input.role)) {
    throw new WendyDomainError("INVALID_SCHEMA", "role is not a defined OrganizationRole", { field: "role" });
  }

  return Object.freeze({ ...input, status: requireNonEmpty(input.status, "status") });
}

export function assertSameOrganization(
  expected_organization_id: OrganizationId,
  ...entities: readonly OrganizationScoped[]
): void {
  for (const entity of entities) {
    if (entity.organization_id !== expected_organization_id) {
      throw new WendyDomainError("RULE_VIOLATION", "all referenced records must share organization_id", {
        field: "organization_id",
        rule_id: "EVT-ORG-001",
      });
    }
  }
}
