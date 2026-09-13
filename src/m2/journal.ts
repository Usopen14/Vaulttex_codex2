import { money, sameMoney, type Money } from "../domain/common/money.ts";
import { WendyDomainError, requirePositiveInteger } from "../domain/common/errors.ts";
import type { Account } from "../domain/accounting/coa.ts";

import { newM2Uuid } from "./canonical.ts";
import { PAID_EXPENSE_RULE_ID, PAID_EXPENSE_RULE_VERSION, type JournalDraft, type JournalLine, type MappingResolutionResponse, type PaidExpensePair, type TaxImpactEligibilityDecision, type AuthorizationDecision, type PeriodAuthorizationDecision, type Fingerprint } from "./contracts.ts";

function asMinorUnits(value: Money): bigint {
  const [whole, fraction = ""] = value.value.split(".");
  return BigInt(whole!) * 100n + BigInt(`${fraction}00`.slice(0, 2));
}

function fromMinorUnits(value: bigint): Money {
  if (value <= 0n) throw new WendyDomainError("JOURNAL_UNBALANCED", "journal totals must be positive", { rule_id: "M2-BAL-001" });
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return money(`${whole.toString()}.${fraction}`, "THB");
}

export function sumMoney(values: readonly Money[]): Money {
  if (values.length === 0) throw new WendyDomainError("JOURNAL_UNBALANCED", "journal side must have at least one amount", { rule_id: "M2-BAL-001" });
  if (values.some((value) => value.currency !== "THB")) throw new WendyDomainError("RULE_VIOLATION", "PAID_EXPENSE v1 Journal amounts must be THB", { rule_id: "M2-BAL-002" });
  return fromMinorUnits(values.reduce((total, value) => total + asMinorUnits(value), 0n));
}

export function assertJournalDraftBalanced(lines: readonly JournalLine[]): { readonly total_debit: Money; readonly total_credit: Money } {
  if (lines.length !== 2) throw new WendyDomainError("JOURNAL_UNBALANCED", "PAID_EXPENSE v1 requires exactly two Journal lines", { rule_id: "M2-BAL-003" });
  const debits: Money[] = [];
  const credits: Money[] = [];
  const lineNumbers = new Set<number>();
  for (const line of lines) {
    requirePositiveInteger(line.line_number, "line_number");
    if (lineNumbers.has(line.line_number)) throw new WendyDomainError("JOURNAL_UNBALANCED", "Journal line numbers must be unique", { rule_id: "M2-BAL-004" });
    lineNumbers.add(line.line_number);
    const debitPresent = line.debit !== null;
    const creditPresent = line.credit !== null;
    if (debitPresent === creditPresent) throw new WendyDomainError("JOURNAL_UNBALANCED", "each Journal line requires debit XOR credit", { rule_id: "M2-BAL-005" });
    if (line.debit !== null) debits.push(line.debit);
    if (line.credit !== null) credits.push(line.credit);
  }
  const total_debit = sumMoney(debits);
  const total_credit = sumMoney(credits);
  if (!sameMoney(total_debit, total_credit)) throw new WendyDomainError("JOURNAL_UNBALANCED", "total debit must equal total credit", { rule_id: "M2-BAL-006" });
  return Object.freeze({ total_debit, total_credit });
}

function requireExactResolution(response: MappingResolutionResponse, expected: "wendy.paid-expense.category-account-resolution/1.0.0" | "wendy.paid-expense.payment-source-account-resolution/1.0.0"): string {
  if (response.contract_version !== expected || response.resolution !== "EXACTLY_ONE" || response.resolved_account_id === null || response.mapping_id === null || response.mapping_version === null || response.coa_version_ref === null || response.account_eligibility_evidence_ref === null) {
    throw new WendyDomainError("REVIEW_REQUIRED", "PAID_EXPENSE mapping must resolve exactly one eligible authoritative account", { rule_id: "M2-MAP-001" });
  }
  return response.resolved_account_id;
}

export interface JournalDraftInput {
  readonly pair: PaidExpensePair;
  readonly effect_fingerprint: Fingerprint;
  readonly category_mapping: MappingResolutionResponse;
  readonly payment_source_mapping: MappingResolutionResponse;
  readonly expense_account: Account;
  readonly cash_or_bank_account: Account;
  readonly tax_decision: TaxImpactEligibilityDecision;
  readonly authorization: AuthorizationDecision;
  readonly period_authorization: PeriodAuthorizationDecision;
  readonly validation_result_ref: JournalDraft["provenance"]["validation_result_ref"];
  readonly confirmation_audit_ref: string;
  readonly trace_id: JournalDraft["provenance"]["trace_id"];
}

/** Builds a non-posted, two-line PAID_EXPENSE v1 JournalDraft. */
export function buildPaidExpenseJournalDraft(input: JournalDraftInput): JournalDraft {
  const expenseAccountId = requireExactResolution(input.category_mapping, "wendy.paid-expense.category-account-resolution/1.0.0");
  const cashAccountId = requireExactResolution(input.payment_source_mapping, "wendy.paid-expense.payment-source-account-resolution/1.0.0");
  if (input.expense_account.account_id !== expenseAccountId || input.cash_or_bank_account.account_id !== cashAccountId || input.expense_account.organization_id !== input.pair.expense.organization_id || input.cash_or_bank_account.organization_id !== input.pair.expense.organization_id) {
    throw new WendyDomainError("REVIEW_REQUIRED", "resolved Journal account does not match authoritative organization mapping", { rule_id: "M2-MAP-002" });
  }
  if (input.expense_account.account_type !== "EXPENSE" || input.expense_account.normal_balance !== "DEBIT" || input.expense_account.posting_mode !== "POSTABLE") throw new WendyDomainError("REVIEW_REQUIRED", "expense account is not debit-eligible", { rule_id: "M2-MAP-003" });
  if (input.cash_or_bank_account.account_type !== "ASSET" || input.cash_or_bank_account.normal_balance !== "DEBIT" || input.cash_or_bank_account.posting_mode !== "POSTABLE" || !["ASSET.CASH.BANK", "ASSET.CASH.ON_HAND"].includes(input.cash_or_bank_account.reporting_tag ?? "")) throw new WendyDomainError("REVIEW_REQUIRED", "Cash/Bank account is not credit-eligible", { rule_id: "M2-MAP-004" });
  if (input.tax_decision.outcome !== "NO_SEPARATE_ACCOUNTING_IMPACT_CONFIRMED") throw new WendyDomainError("REVIEW_REQUIRED", "tax-impact eligibility is not confirmed", { rule_id: "M2-TAX-001" });
  if (input.authorization.decision !== "ALLOWED" || input.period_authorization.decision !== "POSTING_ALLOWED") throw new WendyDomainError("RULE_VIOLATION", "JournalDraft requires allowed authorization and period decisions", { rule_id: "M2-JRN-001" });
  if (input.pair.expense.accounting_date !== input.pair.expense.effective_date || input.pair.payment.accounting_date !== input.pair.expense.accounting_date || input.period_authorization.proposed_accounting_date !== input.pair.expense.accounting_date || input.period_authorization.proposed_posting_date !== input.pair.expense.accounting_date) throw new WendyDomainError("RULE_VIOLATION", "PAID_EXPENSE v1 accounting and posting date must derive from expense effective date", { rule_id: "M2-DATE-001" });
  const amount = input.pair.expense.amount;
  if (!sameMoney(amount, input.pair.payment.amount) || amount.currency !== "THB") throw new WendyDomainError("JOURNAL_UNBALANCED", "PAID_EXPENSE event amounts must be equal exact THB Money", { rule_id: "M2-BAL-007" });
  const lines: [JournalLine, JournalLine] = [
    Object.freeze({ line_id: newM2Uuid(), line_number: 1, account_id: input.expense_account.account_id, debit: amount, credit: null, line_provenance_ref: `mapping:${input.category_mapping.mapping_id}:${input.category_mapping.mapping_version}` }),
    Object.freeze({ line_id: newM2Uuid(), line_number: 2, account_id: input.cash_or_bank_account.account_id, debit: null, credit: amount, line_provenance_ref: `mapping:${input.payment_source_mapping.mapping_id}:${input.payment_source_mapping.mapping_version}` }),
  ];
  const totals = assertJournalDraftBalanced(lines);
  return Object.freeze({
    contract_version: "wendy.paid-expense.journal-draft/1.0.0",
    journal_draft_id: newM2Uuid(),
    organization_id: input.pair.expense.organization_id,
    financial_effect_fingerprint: input.effect_fingerprint,
    event_refs: Object.freeze([
      Object.freeze({ event_id: input.pair.expense.event_id, event_version: input.pair.expense.event_version, event_type: "ExpenseRecognized" }),
      Object.freeze({ event_id: input.pair.payment.event_id, event_version: input.pair.payment.event_version, event_type: "PaymentMade" }),
    ]) as JournalDraft["event_refs"],
    economic_group_id: input.pair.expense.economic_group_id,
    fulfills_relationship_ref: input.pair.fulfills_relationship.relationship_id,
    accounting_rule: Object.freeze({ rule_id: PAID_EXPENSE_RULE_ID, immutable_rule_version: PAID_EXPENSE_RULE_VERSION }),
    accounting_date: input.pair.expense.accounting_date,
    posting_date: input.pair.expense.accounting_date,
    currency: "THB",
    mapping_provenance: Object.freeze({ category_mapping: input.category_mapping, payment_source_mapping: input.payment_source_mapping }),
    lines: Object.freeze(lines),
    total_debit: totals.total_debit,
    total_credit: totals.total_credit,
    provenance: Object.freeze({
      source_refs: Object.freeze([...input.pair.expense.source_refs, ...input.pair.payment.source_refs]),
      evidence_refs: Object.freeze([...input.pair.expense.evidence_refs, ...input.pair.payment.evidence_refs]),
      confirmation_audit_ref: input.confirmation_audit_ref,
      validation_result_ref: input.validation_result_ref,
      tax_impact_eligibility_decision_ref: input.tax_decision.tax_impact_eligibility_decision_id,
      authorization_decision_ref: input.authorization.authorization_decision_id,
      period_authorization_ref: input.period_authorization.period_authorization_decision_id,
      trace_id: input.trace_id,
    }),
  });
}

/** Exact inverse of a posted original; it deliberately takes no mapping or rule resolver. */
export function exactFullReversalLines(original: JournalDraft): readonly [JournalLine, JournalLine] {
  const reversed = original.lines.map((line) => Object.freeze({
    line_id: newM2Uuid(),
    line_number: line.line_number,
    account_id: line.account_id,
    debit: line.credit,
    credit: line.debit,
    line_provenance_ref: `exact-reversal-of:${line.line_id}`,
  })) as [JournalLine, JournalLine];
  assertJournalDraftBalanced(reversed);
  return Object.freeze(reversed);
}
