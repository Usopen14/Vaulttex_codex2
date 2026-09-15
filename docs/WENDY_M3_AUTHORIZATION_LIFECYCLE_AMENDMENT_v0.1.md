# Wendy M3 — Authorization Lifecycle Amendment v0.1

**Status:** `COMPLETE / APPROVED / FROZEN — IMPLEMENTATION REVISION REQUIRED`

**Purpose:** Approved amendment for trusted M3 authorization target binding, lifecycle, consumption-time revalidation, CreationIntent, denial audit, and consumption provenance. It addresses the M3 implementation-review authorization finding only.

**Approval evidence:** `M3-AUTH-LIFECYCLE-AMENDMENT-v1.0` — Dr. Masato, Product Owner / Engineering Owner / CEO, 15 Sep 2026.

**Scope:** Protected M3 Source & Evidence operations only. This approval does not alter the frozen M3 v0.1 artifacts, change accepted M1/M2 behavior, mark M3 accepted/complete, authorize deployment, commit, or push.

## 1. Governing relationship

The normative governing set is:

```text
Frozen M3 Source & Evidence bundle v0.1
+ approved M3 Authorization Lifecycle Amendment v0.1
```

This amendment must not rewrite the frozen content or SHA-256 values of:

| Frozen artifact | SHA-256 |
|---|---|
| `WENDY_M3_SOURCE_EVIDENCE_SPEC_v0.1.md` | `f5c3253fc6499ecc69aaaf3e1e3768ce38fc7424edb76787a667cd3fd110a835` |
| `WENDY_M3_SOURCE_EVIDENCE_SCHEMA_v0.1.md` | `97b5a87d250824d27999b3714ee2beb94dd3bba5134e9dc7431fef534c3ca98b` |
| `WENDY_M3_SOURCE_EVIDENCE_TEST_CONTRACT_v0.1.md` | `572cc657ab4464a20a15fd3936dd4c6e20bb0cb942179220962a4a406f0c2cf6` |

**Approved amendment contract version:** `wendy.m3.authorization-lifecycle/0.1.0`

## 2. Approved target-scope contract

### 2.1 Canonical authorization decision

Every protected M3 authorization decision MUST authorize exactly one operation and exactly one target scope. Wildcard targets are prohibited in M3 v1.

```ts
type M3ProtectedAuthorizationOperation =
  | "READ_RAW_ARTIFACT"
  | "READ_RAW_SOURCE_RECORD"
  | "READ_EVIDENCE"
  | "CORRECT_SOURCE_RECORD"
  | "MARK_ARTIFACT_UNAVAILABLE"

type M3AuthorizationTargetType =
  | "SOURCE_ARTIFACT"
  | "SOURCE_RECORD"
  | "EVIDENCE"

AuthorizationTargetBinding {
  target_type: M3AuthorizationTargetType
  target_id: string
  target_content_identity: ContentHash
}

M3TargetBoundAuthorizationDecision {
  authorization_decision_id: M3AuthorizationDecisionId
  organization_id: OrganizationId
  authorized_principal: ActorRef
  operation: M3ProtectedAuthorizationOperation
  target: AuthorizationTargetBinding
  authorization_contract_version: "wendy.m3.authorization-lifecycle/0.1.0"
  issued_at: RFC3339Timestamp
  expires_at: RFC3339Timestamp | null
  issuer: {
    actor: ActorRef
    capability_evidence_ref: string
    authority_provenance_ref: string
  }
  immutable_evidence_provenance_ref: string
  decision_integrity_hash: ContentHash
}
```

`target_content_identity` is the frozen identity of the target at authorization time:

| Operation | Target type | Exact target content identity |
|---|---|---|
| `READ_RAW_ARTIFACT` | `SOURCE_ARTIFACT` | Artifact `content_hash` |
| `READ_RAW_SOURCE_RECORD` | `SOURCE_RECORD` | SourceRecord `canonical_content_hash` |
| `READ_EVIDENCE` | `EVIDENCE` | Evidence `content_hash` |
| `CORRECT_SOURCE_RECORD` | `SOURCE_RECORD` | Predecessor SourceRecord `canonical_content_hash` |
| `MARK_ARTIFACT_UNAVAILABLE` | `SOURCE_ARTIFACT` | Artifact `content_hash` |

The consuming requester, operation, target type, target ID, and target content identity MUST match exactly. An organization membership, uploader identity, role name, client resource reference, or possession of an opaque decision ID is not sufficient authority.

### 2.2 Creation and derived-resource authorization — D-04

No wildcard authorization is permitted because a target resource does not yet exist. Creation and derived operations MUST use an immutable server-authoritative `CreationIntent`; the authorization decision binds to that exact intent.

```ts
M3CreationIntent {
  creation_intent_id: Uuid
  organization_id: OrganizationId
  operation: string
  requesting_principal: ActorRef
  proposed_target_resource_type: string
  proposed_target_resource_id: string
  creation_payload_hash: ContentHash
  parent_resource_identity: string | null
  content_hash: ContentHash | null
  authorization_contract_version: "wendy.m3.authorization-lifecycle/0.1.0"
  created_at: RFC3339Timestamp
  integrity_provenance_hash: ContentHash
}
```

The intent is not permission by itself. Consumption MUST reload/revalidate the authorization and require exact match of organization, principal, operation, proposed target identity/type, payload/content hash, and parent/input scope.

| Creation / derived operation | Required bound scope |
|---|---|
| `CREATE_SOURCE` | Reserved Source ID and source creation payload hash. |
| `CREATE_ARTIFACT` | Exact Source parent, proposed Artifact ID, content hash, and creation payload hash. |
| `CREATE_SOURCE_RECORD` | Exact Artifact parent, proposed SourceRecord ID, record locator, and creation payload hash. |
| `NORMALIZE` / `CREATE_CANDIDATE` | Exact Evidence input set, proposed derived ID, transformation/input hash. |
| `CREATE_REPLACEMENT` / `CORRECT_SOURCE_RECORD` | Exact predecessor, proposed replacement ID, operation, and replacement payload/content hash. |

Changing any bound value invalidates the intent and requires a new intent plus a new authorization decision.

## 3. Approved immutable lifecycle model — D-01

The authorization decision itself is immutable. Lifecycle changes append a separate immutable fact and never update the original decision.

```ts
type M3AuthorizationLifecycleOutcome =
  | "ACTIVE"
  | "SUPERSEDED"
  | "REVOKED"
  | "EXPIRED"

type M3AuthorizationLifecycleAction = "SUPERSEDED" | "REVOKED"

M3AuthorizationLifecycleFact {
  authorization_lifecycle_fact_id: Uuid
  lifecycle_version: positive_integer
  organization_id: OrganizationId
  affected_authorization_decision_id: M3AuthorizationDecisionId
  action: M3AuthorizationLifecycleAction
  replacement_authorization_decision_id: M3AuthorizationDecisionId | null
  occurred_at: RFC3339Timestamp
  authority: ActorRef
  authority_evidence_ref: string
  reason_ref: string
  immutable_provenance_hash: ContentHash
}
```

An authorization begins effectively `ACTIVE`. The only explicit terminal lifecycle actions are `SUPERSEDED` and `REVOKED`; they are mutually exclusive and terminal for the same decision. Database/persistence correctness MUST permit at most one terminal lifecycle fact per decision.

If concurrent terminal facts are attempted, the first successfully committed terminal fact is authoritative and the competing transition MUST fail deterministically. A terminal decision can never return to `ACTIVE`. A replacement always requires a new immutable authorization decision.

Derived consumption outcomes are as follows:

| Outcome | Meaning for a new protected operation |
|---|---|
| `ACTIVE` | Eligible only after every consumption-time validation in §5 passes. |
| `SUPERSEDED` | Cannot authorize a new operation. |
| `REVOKED` | Cannot authorize a new operation. |
| `EXPIRED` | Cannot authorize a new operation. |

`SUPERSEDED` requires a same-organization replacement decision reference. `REVOKED` MUST NOT claim a replacement decision. `EXPIRED` is not a competing mutable terminal fact: it is derived only when no terminal fact exists and a non-null expiry has been reached. The original and every lifecycle fact remain auditable.

## 4. Approved expiry and authoritative-time semantics — D-02

`expires_at` is either an RFC 3339 timestamp or `null`.

- `null` means no automatic time expiry.
- If non-null and authoritative current time is at or after `expires_at`, the derived outcome is `EXPIRED`.
- Expiry does not mutate a decision or create an implicit replacement.
- An expired decision cannot be silently extended, refreshed, or reused. A replacement requires a new immutable decision.

Authorization expiry and consumption time MUST use a trusted server/database runtime time source. Client timestamps are never authoritative. State-changing evaluation MUST occur inside the same correctness transaction as the protected mutation, capture one authoritative evaluation timestamp, and use it consistently for expiry evaluation and consumption provenance.

Persist timestamps in UTC/RFC-3339-compatible form according to repository conventions. A `TrustedClock` / `AuthoritativeTimeProvider` may support deterministic tests, but production callers must not supply arbitrary time. Host/runtime clock synchronization remains a deployment/operations dependency.

## 5. Approved consumption-time revalidation contract

A prior validation is not sufficient. Every protected operation MUST, at consumption time, reload authoritative authorization and lifecycle state and verify all of the following:

1. The decision exists in the trusted authority store.
2. The decision integrity hash is valid under the amendment contract version.
3. Organization and authorized principal match the request context.
4. Operation, target type, target ID, and frozen target content identity match exactly.
5. The amendment policy/version is supported.
6. Issuer identity and capability/evidence are valid.
7. No authoritative lifecycle fact makes the decision `SUPERSEDED` or `REVOKED`.
8. The decision is not `EXPIRED` under authoritative current time.
9. Caller-supplied lifecycle state, embedded authorization object, target version, or capability conclusion is ignored and rejected as authority input.

Any failure MUST deny/fail closed, perform no protected operation, and avoid disclosing cross-organization resource existence.

## 6. Approved TOCTOU correctness boundary

For state-changing protected operations (`CORRECT_SOURCE_RECORD`, `MARK_ARTIFACT_UNAVAILABLE`), revalidation and the protected mutation MUST run in one correctness boundary.

The preferred M3 v1 implementation is one SQLite transaction containing:

```text
reload decision + reload lifecycle facts + validate exact target/version
→ append consumption provenance
→ append correction or availability facts
→ commit
```

If a separate authority store makes this impossible, an approved equivalent MUST compare an immutable lifecycle/version token at commit and roll back on a mismatch. A process-local cache is not a correctness boundary.

For protected reads, authorization/lifecycle state MUST be reloaded and revalidated at access time.

## 7. Approved immutable consumption provenance and denial audit — D-03

Each protected authorization consumption MUST append an immutable record. It grants no authority.

```ts
M3AuthorizationConsumption {
  authorization_consumption_id: Uuid
  organization_id: OrganizationId
  authorization_decision_id: M3AuthorizationDecisionId
  decision_integrity_hash: ContentHash
  authorization_contract_version: string
  observed_lifecycle_outcome: M3AuthorizationLifecycleOutcome
  observed_lifecycle_version: positive_integer | null
  principal: ActorRef
  operation: M3ProtectedAuthorizationOperation
  target: AuthorizationTargetBinding
  consumed_at: RFC3339Timestamp
  request_id: RequestId
  trace_id: TraceId
  result: "ALLOWED"
  policy_version_ref: string
  immutable_provenance_hash: ContentHash
}
```

An earlier successful consumption remains immutable and traceable if its decision is revoked or superseded later.

A denied authorization evaluation is not an authorization consumption. While retained, it MUST be a separate immutable, non-financial, non-authoritative security/audit record containing at least: evaluation/audit ID; authorized organization context; requesting principal; requested operation; supplied decision ID when present; non-disclosing opaque target reference; authoritative evaluation time; `DENIED` outcome; stable reason code; request/trace references; and policy/contract version. It MUST NOT imply target existence, mutate the decision, create evidence truth, or grant authority. Its retention follows approved Security/Audit policy and is not permanent financial-history retention.

## 8. Explicit fail-closed matrix

| Condition | Required behavior |
|---|---|
| Nonexistent or forged decision ID/payload | Deny; no protected operation. |
| Wrong organization or principal | Deny without target existence disclosure. |
| Wrong operation, target type, target ID, or target content identity | Deny; no protected operation. |
| Unsupported authorization policy/version | Deny. |
| Invalid integrity hash or unauthorized issuer | Deny. |
| `REVOKED`, `SUPERSEDED`, or `EXPIRED` decision | Deny. |
| Caller lifecycle override | Deny; authoritative store decides lifecycle. |
| Lifecycle changes before commit | Deny and roll back state-changing mutation. |

## 9. Approved release-blocking test amendment

The existing 29 frozen M3 test IDs remain unmodified. The following additional, independent release-blocking IDs are frozen:

| Test ID | Required assertion |
|---|---|
| `M3-AUTH-LC-01` | A valid exact existing-resource decision/principal/operation/target/content identity succeeds; CreationIntent binding succeeds where the operation creates a resource. |
| `M3-AUTH-LC-02` | Wrong target ID or target type fails without resource disclosure. |
| `M3-AUTH-LC-03` | Wrong target content identity/version fails. |
| `M3-AUTH-LC-04` | Wrong operation fails. |
| `M3-AUTH-LC-05` | Nonexistent decision and caller-supplied embedded/forged decision payload fail. |
| `M3-AUTH-LC-06` | Wrong organization or principal fails without cross-org disclosure. |
| `M3-AUTH-LC-07` | Modified integrity hash, unsupported policy version, or unauthorized issuer fails. |
| `M3-AUTH-LC-08` | Revoked decision fails. |
| `M3-AUTH-LC-09` | Superseded decision fails. |
| `M3-AUTH-LC-10` | Expired decision fails; `expires_at = null` remains eligible subject to all other controls. |
| `M3-AUTH-LC-11` | Replacement decision works only for its own exact operation and target/CreationIntent scope. |
| `M3-AUTH-LC-12` | Earlier/cached validation cannot authorize a later operation after lifecycle change. |
| `M3-AUTH-LC-13` | Lifecycle change racing correction blocks commit and leaves no partial mutation. |
| `M3-AUTH-LC-14` | Lifecycle change racing availability transition blocks commit and leaves no partial mutation. |
| `M3-AUTH-LC-15` | Immutable consumption provenance survives later revocation/supersession. |

## 10. Compatibility and conflicts

### Frozen M3 v0.1 bundle

There is no semantic conflict. This is a separately approved, versioned supplement. The v0.1 trusted authorization record intentionally lacks target binding, lifecycle, expiry, revalidation, CreationIntent, request/trace consumption, denial-audit, and lifecycle-fact fields; this amendment adds them without modifying v0.1 hashes or weakening its fail-closed boundary.

### M1 and M2

No conflict is identified. M1 identities (`OrganizationId`, `ActorRef`, `RequestId`, `TraceId`, `ContentHash`) are reused. M2 authorization, T-01, fingerprints, Period, Journal, and Ledger semantics remain untouched. M3 lifecycle facts must use a distinct M3 namespace and MUST NOT reuse M2 correction, reversal, or authorization semantics.

## 11. Approval record

| Field | Value |
|---|---|
| Product / Security / Engineering decision | `APPROVE / FREEZE WITH D-01 THROUGH D-04` |
| Approver | `Dr. Masato` |
| Approver role | `Product Owner / Engineering Owner / CEO` |
| Decision date | `15 Sep 2026` |
| Evidence reference | `M3-AUTH-LIFECYCLE-AMENDMENT-v1.0` |
| Approved amendment version | `wendy.m3.authorization-lifecycle/0.1.0` |

## 12. Freeze and implementation-status relationship

This amendment is complete, approved, and frozen under `M3-AUTH-LIFECYCLE-AMENDMENT-v1.0`. Original M3 Contract Freeze remains `COMPLETE / ACCEPTED`. M3 Implementation is `REVISION REQUIRED`; M3 Implementation Acceptance is `NOT APPROVED`; Production Deployment is `NOT AUTHORIZED`.

The earlier M3 implementation authorization remains usable only for an implementation revision conforming to the combined original frozen M3 bundle plus this approved amendment. It does not accept the existing implementation or authorize deployment.

**Implementation-revision status:** `AUTHORIZED AGAINST THE COMBINED FROZEN CONTRACT SET`
