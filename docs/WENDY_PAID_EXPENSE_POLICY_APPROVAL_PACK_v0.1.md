# PAID_EXPENSE Policy Approval Pack v0.1

**Product:** Vault
**Engine:** Wendy
**Status:** `APPROVED_BY_PRODUCT_OWNER_FOR_M2_POLICY_BOUNDARY — CONSUMED_BY_M2_AUTHORIZATION`
**Scope:** Authorization, segregation of duties, Period posting authority, and escalation policy for the approved PAID_EXPENSE M2-entry slice
**Product Owner policy approval evidence:** Product Owner decision supplied in this Codex task on 2026-09-13
**Product Owner policy decision date:** 2026-09-13
**Accounting approval:** `COMPLETE`
**Engineering Freeze:** `COMPLETE / ACCEPTED`
**M2 authorization:** `READY / AUTHORIZED` — `M2-IMPLEMENTATION-AUTH-v1.0`

## 1. Purpose and authority boundary

This pack records the Product Owner-approved M2 policy boundary. It does not assign permissions in a running system, implement authorization, authorize a period override, or permit Ledger posting.

Existing domain roles are organization-scoped labels, not self-executing permissions. `USER_CONFIRM` confirms intended source/business facts only; it does not approve accounting treatment, tax treatment, a period override, or a Ledger posting.

The Ledger Posting Service is the only system authority permitted to create posted Ledger records. Confirmation, elevated approval, Owner Override, Accounting mapping, and Period authorization are separate controls; none creates a posted record by itself.

This clarification preserves the canonical M1 `approval_level` values. `OWNER_OVERRIDE` is an exceptional control mechanism or approval metadata under `ACCOUNTANT_OR_ADMIN_APPROVAL`; it is not a fourth approval level.

## 2. Product Owner-approved Policy decisions for M2

| Decision | Approved policy boundary | State |
|---|---|
| P-01 — Server capability matrix | Authorized `OWNER`, `ADMIN`, `ACCOUNTANT`, and authorized `MEMBER`/`USER` may submit; originator may `USER_CONFIRM`; elevated approval is available to authorized `OWNER`/`ADMIN`/`ACCOUNTANT` subject to SOD; Owner Override is Owner-only and conditional; only Ledger Posting Service writes Ledger. | `APPROVED_PRODUCT_POLICY_M2` |
| P-02 — Independent approver | Same organization; active authorized membership; `OWNER`, `ADMIN`, or `ACCOUNTANT` approval capability; canonical identity differs from originator; no SOD exclusion. Multiple eligible actors follow queue assignment; none never downgrades approval and may use permitted Owner Override only. | `APPROVED_PRODUCT_POLICY_M2` |
| P-03 — SOD | Originator may submit and `USER_CONFIRM`; may not approve own elevated exception or own correction by default. Explicit audited Owner Override is the only exception, and it never bypasses financial invariants. | `APPROVED_PRODUCT_POLICY_M2` |
| P-04 — Review queue | Primary reviewers are `ACCOUNTANT`/`ADMIN`; `OWNER` may review where organization policy permits and may be fallback where no other eligible approver exists. Mandatory review audit and revalidation-on-resubmission apply. | `APPROVED_PRODUCT_POLICY_M2` |
| P-05 — Period escalation | OPEN may post only after all controls. CLOSED and LOCKED deny normal posting with `PERIOD_DENIED`; no date shift. LOCKED has no Owner Override, reopen, or automatic adjustment. Reopen execution is outside M2. | `APPROVED_PRODUCT_POLICY_M2` |
| P-06 — Period authorization boundary | Request carries prescribed context. Decision is equivalent to `POSTING_ALLOWED`, `PERIOD_DENIED`, or `REVIEW_REQUIRED`, with period/reason/version evidence. Period Engine decides eligibility but never posts Ledger. | `APPROVED_PRODUCT_POLICY_M2` |

The canonical M1 `ActorRef` remains `USER | SERVICE`. A service never satisfies a required human confirmation or approval. Existing role labels remain organization-scoped and the server, not the client, evaluates authority.

## 3. Approved authority and review rules

### 3.1 Capability and confirmation

- Submit: authorized `OWNER`, `ADMIN`, `ACCOUNTANT`, and authorized `MEMBER`/`USER` where organization policy permits.
- `USER_CONFIRM`: the originating authorized user may confirm their source/business facts. It does not grant accounting, tax, Period-override, correction/reversal, or Ledger-posting approval.
- Elevated approval and correction approval: authorized `OWNER`, `ADMIN`, or `ACCOUNTANT`, subject to P-02/P-03.
- Correction request and Period escalation request are server-authorized request actions; they do not themselves approve or post anything.
- Ledger post: no human role writes Ledger rows directly. Ledger Posting Service is the only Ledger write authority.

### 3.2 Independent approval and SOD

- Compare originator and candidate approver by canonical actor/user identity, not display name, email text, or mutable profile metadata.
- An eligible independent approver is organization-scoped, active, server-authorized, holds `OWNER`/`ADMIN`/`ACCOUNTANT` approval capability, differs from the originator, and is not excluded by SOD.
- Any currently eligible independent approver may review according to queue-assignment policy. The assignment rule does not change the recorded approver identity.
- Where no independent approver exists, the system must not silently downgrade approval. Only an explicitly enabled and fully auditable Owner Override may be considered.
- Originator → submit and Originator → `USER_CONFIRM` are allowed. Originator → own elevated approval and Originator → own correction approval are prohibited by default.

### 3.3 Review and escalation

- Primary reviewers are `ACCOUNTANT` and `ADMIN`. An `OWNER` may review where organization policy permits and may be fallback where no other eligible approver exists.
- Every elevated review retains organization, originator, affected event/economic group, reason code, relevant evidence references, requested action, reviewer, decision, timestamp, policy/rule version, and an optional or required explanation according to decision type.
- Corrected or resubmitted input returns through normal validation. Review approval never directly mutates Ledger.
- An escalation request does not grant posting permission. Period reopen execution is outside M2 and needs a separate future Period policy.

### 3.4 Period authorization boundary

The future Period authorization request must carry at least `organization_id`, requester/actor identity, financial-event/economic-group reference, proposed `posting_date`, organization timezone or AccountingProfile reference, accounting-period identity, posting-rule identity/version, approval context, and requested operation.

The Period authority must return a deterministic decision equivalent to `POSTING_ALLOWED`, `PERIOD_DENIED`, or `REVIEW_REQUIRED`, plus `accounting_period_id`, reason codes, any required approval/escalation, and period/rule/policy version references. Only `POSTING_ALLOWED` permits posting eligibility. Period Engine does not post the Ledger.

## 4. Product Owner-approved elevated self-approval control

For an elevated exception requiring `ACCOUNTANT_OR_ADMIN_APPROVAL`, the default flow is:

```text
originator → elevated review → different eligible authorized Owner/Admin/Accountant → approval or rejection
```

Self-approval by the originator is prohibited by default whenever another eligible independent approver exists.

An `OWNER_OVERRIDE` may be used only when all of the following are true:

1. organization policy explicitly enables the mechanism;
2. no other eligible independent approver exists;
3. the actor is an authorized `OWNER`;
4. the actor performs an explicit override action with a reason/justification; and
5. audit metadata records actor, timestamp, source request, affected event(s), policy version, and that the decision is `SELF_APPROVED` / `OWNER_OVERRIDE`.

The mechanism is fully auditable and cannot be silent or inferred merely because an Owner originated a transaction.

`OWNER_OVERRIDE` is approval mechanism only. It must not override organization authorization failure, invalid or unbalanced journal, unsupported currency, missing required account mapping, Ledger invariant failure, idempotency conflict, immutable posted history, a LOCKED accounting period, or any control explicitly classified as non-overridable.

## 5. Required routing boundaries

The following Product Owner-approved meanings constrain the policy; policy may not collapse them:

- `REVIEW_REQUIRED`: plausible but incomplete or ambiguous; no post.
- `REJECTED`: hard-invalid, unauthorized, unsupported, or invariant-violating; no post.
- `PERIOD_DENIED`: no posting authorization for the requested period; distinct from `REJECTED`; no post.
- `DUPLICATE`: no second financial effect.

Unknown account or tax treatment never receives a guessed value. A policy may not create a silent Suspense or Miscellaneous Expense fallback.

## 6. Approval evidence and remaining boundaries

Product Owner approval evidence is the Product Owner decision supplied in this Codex task on 2026-09-13. It approves P-01 through P-06 for the M2 policy boundary. This record does not approve any Accounting decision, exact Engineering DTO/schema, idempotency/fingerprint/atomic-posting contract, M2 code, Period reopening, or Ledger posting.

The downstream Accounting, T-01, and Engineering gates are complete. M2 implementation authorization is recorded in `WENDY_M2_IMPLEMENTATION_AUTHORIZATION_v1.md`; the resulting implementation must consume this approved policy without trusting client-supplied role claims.
