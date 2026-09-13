# PAID_EXPENSE Engineering Contract Freeze Draft v0.1

**Product:** Vault
**Engine:** Wendy
**Status:** `SUPERSEDED_BY_ENGINEERING_CONTRACT_v1 — HISTORICAL_DRAFT_ONLY`
**Scope:** Historical pre-freeze planning record only; it is not a current normative contract
**Engineering owner:** `PENDING/TBD`
**Freeze date:** `PENDING/TBD`

> Historical status note: the remaining sections record the blocked state before Accounting Gate completion. They are superseded in full by `WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_v1.md`, `WENDY_PAID_EXPENSE_ENGINEERING_DTO_SCHEMA_v1.md`, and `WENDY_PAID_EXPENSE_TEST_CONTRACT_v1.md`. Do not use their former `BLOCKED_*` labels as current M2 gate status.

## 1. Dependency rule (historical)

Engineering must not freeze a posting contract before Accounting defines what one approved financial effect is. That condition is now satisfied by the immutable `PAID_EXPENSE v1` Accounting Rule. This historical draft is superseded by [`WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_v1.md`](WENDY_PAID_EXPENSE_ENGINEERING_CONTRACT_v1.md), its versioned DTO/schema companion, and its test contract. Those documents freeze technical mechanics only; they do not implement an idempotency store, lock, transaction, Ledger API, or retry mechanism.

```text
Accounting rule approval + recorded Product Owner policy boundary
                ↓
Engineering contract freeze
                ↓
Approved contract / invariant / concurrency / authorization tests
                ↓
Immutable rule and contract versions
                ↓
M2 READY / AUTHORIZED
```

## 2. Contract decisions and dependencies (historical)

| Contract area | Constraint already known | Required upstream decision | Engineering decision still to freeze | State |
|---|---|---|---|---|
| Idempotency scope | Same operation key with changed approved input must conflict; duplicate replay produces no second financial effect. | The approved financial-effect identity, authorized operation, and result semantics. | Operation identity, organization scope, key lifetime, input/result hash boundary, retention, conflict response, and canonical duplicate result. | `BLOCKED_BY_ACCOUNTING_APPROVAL` |
| Event fingerprint canonicalization | M1 stores an `event_fingerprint`; its exact algorithm is deferred. | Approved event/accounting/period dimensions that define economic or posting equivalence. | Exact inputs, normalization, ordering, encoding, hash algorithm, collision handling, versioning, and relationship to duplicate detection. | `BLOCKED_BY_ACCOUNTING_APPROVAL` |
| Exactly-once financial effect | A duplicate must not create a second accounting or Ledger effect. | Definition of one approved accounting result and who may request it. | Result identity, commit criteria, duplicate lookup order, observable result reference, and testable exactly-once invariant. | `BLOCKED_BY_ACCOUNTING_APPROVAL` |
| Atomic Ledger-posting boundary | Posting cannot bypass validation, authorization, provenance, or the Ledger authority boundary. | Approved accounting result, Period authorization contract, and required audit evidence. | Records committed atomically, transaction/commit boundary, immutable result identity, provenance/audit write set, and response boundary. | `BLOCKED_BY_ACCOUNTING_APPROVAL` |
| Concurrency / locking | Concurrent requests must not produce two effects for one approved operation. | Approved idempotency/fingerprint identity and result semantics. | Isolation/locking strategy, contention behavior, stale-version behavior, loser response, timeout/retry behavior, and concurrency tests. | `BLOCKED_BY_ACCOUNTING_APPROVAL` |
| Retry semantics | An idempotent replay is not a second post; existing result may be returned where permitted. | Authorized caller/result visibility rules and approved post outcome model. | Safe retry inputs, retry result DTO, in-progress/unknown outcome handling, and changed-input conflict behavior. | `BLOCKED_BY_ACCOUNTING_APPROVAL` |
| Failure rollback semantics | A failed or denied request must not post. | Approved accounting/period/authorization preconditions and required durable evidence. | Rollback set, no-effect invariant, after-commit failure behavior, recovery protocol, and audit/error response. | `BLOCKED_BY_ACCOUNTING_APPROVAL` |

### 2.1 Authorization-control preparation constrained by approved Product Owner policy

This section prepares, but does not freeze or implement, the authorization decision contract. The canonical persisted `approval_level` remains unchanged:

```text
AUTO_POST
USER_CONFIRM
ACCOUNTANT_OR_ADMIN_APPROVAL
```

`OWNER_OVERRIDE` must be represented as an approval/control mechanism or audit metadata under `ACCOUNTANT_OR_ADMIN_APPROVAL`; it is not a new approval level. The final serialized field names, DTO shape, retention, and storage contract remain `PENDING_ENGINEERING_FREEZE`.

| Contract concern | Product Owner constraint | Engineering work still blocked/pending |
|---|---|---|
| Authorization decision | `USER_CONFIRM` may be performed by the originator and confirms facts only. Elevated approval is separate. | Product policy is approved; freeze request/evidence/result contract after Accounting defines the financial effect. |
| Eligible approver resolution | Eligible independent Owner/Admin/Accountant has active organization-scoped server-authorized capability and differs from originator by canonical identity; self-approval is prohibited by default. | Define authoritative membership/capability lookup, eligibility snapshot, independent-approver test, queue assignment, and stale-membership behavior. |
| Self-approval detection | Originator and elevated approver must be compared for the same source request/elevated exception. | Define canonical originator reference, comparison identity, relationship to delegated/service actions, and error/review output. |
| Owner Override | Only explicitly enabled authorized-Owner override with no independent eligible approver; must be explicit and justified. | Freeze audit metadata for actor, timestamp, source request, affected event(s), policy version, `SELF_APPROVED`/`OWNER_OVERRIDE`, reason, and eligibility-resolution evidence. |
| Non-overridable controls | Override cannot bypass the Product Owner listed financial invariants or LOCKED period. | Freeze control-classification source, enforcement point, and response behavior after Accounting approval. |
| Period behavior | OPEN only after all controls pass; CLOSED/LOCKED deny normal post with no automatic date shift; LOCKED is not unlockable by override. The Period policy returns the equivalent of `POSTING_ALLOWED`, `PERIOD_DENIED`, or `REVIEW_REQUIRED`. | Freeze Period authorization request/response and review/escalation interface after A-04 determines accounting-date semantics. Reopening remains out of M2. |

## 3. Constraints that are already fixed but do not complete the freeze (historical)

- Exact decimal money is required; no binary-float accounting arithmetic.
- Unknown or unresolved mappings fail closed or route to `REVIEW_REQUIRED`; no silent Suspense, guessed account, or guessed tax treatment.
- `USER_CONFIRM` is not Ledger-posting authority.
- `ACCOUNTANT_OR_ADMIN_APPROVAL` remains distinct from `USER_CONFIRM`; `OWNER_OVERRIDE` is control metadata, not an approval-level enum value.
- Owner Override cannot bypass hard financial invariants, missing mappings, idempotency conflict, immutable history, or a LOCKED period.
- Unauthorized, invalid, or Period-denied requests do not post.
- Posted history is immutable; any approved correction preserves lineage.
- M2 has no Tax Engine, FinancialObligation, Payroll, LINE, reconciliation, or Financial State implementation.

These are boundaries, not a complete Engineering contract. They cannot define idempotency/fingerprint/atomicity in isolation.

## 4. Engineering decisions that may proceed only after upstream approval (historical)

No core posting-contract decision in §2 is finalizable without Accounting approval. The authorization-control preparation in §2.1 may now be refined against the approved Product Owner policy, but cannot be frozen until Accounting defines the financial effect, mapping, posting-date, and correction inputs. After those inputs are approved, Engineering must produce a versioned contract that covers each row, then obtain approval for:

1. request/response/error DTOs and version compatibility;
2. idempotency/fingerprint algorithm and data retention;
3. authorization and Period authorization interfaces;
4. atomic transaction, concurrency, rollback, recovery, and retry behavior; and
5. unit, contract, invariant, concurrency, and authorization tests.

## 5. Engineering freeze evidence (historical)

The Engineering freeze cannot be marked complete until all required upstream approvals, a named Engineering owner, immutable contract version(s), test acceptance criteria, and durable approval evidence are recorded. Until then, M2 remains `NOT READY` and no production implementation may start.
