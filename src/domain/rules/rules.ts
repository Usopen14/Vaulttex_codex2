import { DomainValidationError, requireIsoDate, requireNonEmpty } from "../common/errors.ts";
import type { OrganizationId, RuleSetId, RuleVersionId } from "../common/ids.ts";

export interface RuleSet {
  readonly ruleSetId: RuleSetId;
  readonly organizationId: OrganizationId;
  readonly domain: string;
  readonly status: string;
}

export interface RuleVersion {
  readonly ruleVersionId: RuleVersionId;
  readonly ruleSetId: RuleSetId;
  readonly version: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly logicRef: string;
  readonly changeReason: string;
}

export function createRuleSet(input: RuleSet): RuleSet {
  return Object.freeze({
    ...input,
    domain: requireNonEmpty(input.domain, "domain"),
    status: requireNonEmpty(input.status, "status"),
  });
}

export function createRuleVersion(input: RuleVersion): RuleVersion {
  const effectiveFrom = requireIsoDate(input.effectiveFrom, "effectiveFrom");
  const effectiveTo = input.effectiveTo === undefined ? undefined : requireIsoDate(input.effectiveTo, "effectiveTo");

  if (effectiveTo !== undefined && effectiveTo < effectiveFrom) {
    throw new DomainValidationError("INVALID_SCHEMA", "effectiveTo must not be before effectiveFrom", "effectiveTo");
  }

  return Object.freeze({
    ...input,
    version: requireNonEmpty(input.version, "version"),
    logicRef: requireNonEmpty(input.logicRef, "logicRef"),
    changeReason: requireNonEmpty(input.changeReason, "changeReason"),
    effectiveFrom,
    effectiveTo,
  });
}

export function assertRuleVersionBelongsTo(ruleVersion: RuleVersion, ruleSet: RuleSet): void {
  if (ruleVersion.ruleSetId !== ruleSet.ruleSetId) {
    throw new DomainValidationError("RULE_VIOLATION", "rule version must belong to its rule set", "ruleSetId");
  }
}
