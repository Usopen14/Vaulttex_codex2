import { WendyDomainError, requireNonEmpty } from "../common/errors.ts";
import type { OrganizationId, RuleId, RuleSetId, RuleVersion } from "../common/ids.ts";
import { assertDateNotBefore, type IsoDate } from "../common/time.ts";

export interface RuleSet {
  readonly rule_set_id: RuleSetId;
  readonly organization_id: OrganizationId;
  readonly domain: string;
  readonly status: string;
}

export interface VersionedRule {
  readonly rule_id: RuleId;
  readonly rule_set_id: RuleSetId;
  readonly rule_version: RuleVersion;
  readonly effective_from: IsoDate;
  readonly effective_to?: IsoDate;
  readonly logic_ref: string;
  readonly change_reason: string;
}

export function createRuleSet(input: RuleSet): RuleSet {
  return Object.freeze({
    ...input,
    domain: requireNonEmpty(input.domain, "domain"),
    status: requireNonEmpty(input.status, "status"),
  });
}

export function createVersionedRule(input: VersionedRule): VersionedRule {
  if (input.effective_to !== undefined) {
    assertDateNotBefore(input.effective_from, input.effective_to, "effective_to");
  }

  return Object.freeze({
    ...input,
    logic_ref: requireNonEmpty(input.logic_ref, "logic_ref"),
    change_reason: requireNonEmpty(input.change_reason, "change_reason"),
  });
}

export function assertRuleBelongsTo(rule: VersionedRule, rule_set: RuleSet): void {
  if (rule.rule_set_id !== rule_set.rule_set_id) {
    throw new WendyDomainError("RULE_VIOLATION", "rule must belong to its rule_set", { field: "rule_set_id" });
  }
}
