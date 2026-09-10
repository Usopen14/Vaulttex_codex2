# Wendy Technical Specification v0.1

**Product:** Vault  
**Engine:** Wendy  
**Status:** Draft for Product Owner review; not approved for implementation  
**Specification version:** 0.1  
**Date:** 2026-09-06  
**Normative source:** Product brief supplied for this task. No prior Vault/Wendy documents were present in the repository at the time of writing.

คำว่า **MUST**, **MUST NOT**, **SHOULD**, และ **MAY** ในเอกสารนี้ใช้แสดงระดับข้อบังคับตามลำดับ เอกสารนี้กำหนด contract และ boundary ก่อน implementation โดยไม่เลือก framework, ไม่สร้าง SQL migration, API endpoint หรือ production code

---

## 1. Executive Summary

Vault คือผลิตภัณฑ์ที่ลูกค้าใช้งาน ส่วน Wendy คือ financial/intelligence engine เบื้องหลังที่รับข้อมูลการเงินหลายรูปแบบ ทำความเข้าใจ แปลงเป็นข้อมูลมาตรฐาน สร้างและตรวจ Financial Event ลงบัญชีแบบ double-entry สืบค้น/กระทบยอด/คำนวณ แล้วจึงใช้ AI อธิบายและช่วยตัดสินใจก่อนดำเนิน action และส่ง output ผ่านช่องทางสื่อสาร

Wendy v0.1 ใช้ linear pipeline:

`Input → Understand → Establish Financial Truth → Think → Act → Output`

Financial truth ต้องมาจาก deterministic code และ PostgreSQL ledger เท่านั้น AI ช่วย extraction, normalization, classification และ reasoning แต่ห้ามคำนวณหรือเขียน source-of-truth financial records โดยตรง ทุกการเปลี่ยน ledger ต้องผ่านเส้นทางเดียว:

`Financial Event → Validate → Build balanced Journal Entry → Post to Ledger`

ระบบต้องรองรับหลาย organization, มี provenance end-to-end, แยก domain logic ออกจาก Supabase และ AI provider และคง scope MVP ให้เป็น pipeline เชิงเส้น ไม่มี agent loop, multi-agent swarm หรือ complex workflow engine

### Locked outcomes of this specification

- PostgreSQL ledger แบบ double-entry เป็น financial foundation ตั้งแต่ MVP
- `TOTAL DEBIT = TOTAL CREDIT`; journal ที่ไม่สมดุลห้าม post
- AI ห้ามเขียน ledger โดยตรง และ AI output ไม่ใช่ financial truth
- Financial Action ต้องสร้าง Financial Event ใหม่และผ่าน accounting control เดียวกัน
- Financial State และตัวเลขรายงานต้อง derive จาก posted ledger ด้วย deterministic code/SQL
- Source traceability เป็น cross-cutting requirement ตั้งแต่ source ถึง output
- ทุก financial entity สำคัญต้องถูก scope ด้วย `organization_id`
- Wendy domain layer ต้องไม่ผูกกับ Supabase หรือ model provider
- MVP ใช้ linear pipeline และมี explicit review states แทน autonomous loops

---

## 2. Product Definitions

| Term | Definition |
|---|---|
| Vault | Product และ customer-facing experience |
| Wendy | Software financial/intelligence engine เบื้องหลัง Vault ซึ่งรวม AI Logic, deterministic Financial Logic, orchestration/action logic, source traceability และ infrastructure adapters |
| Supabase | Initial infrastructure provider สำหรับ PostgreSQL, Storage และอาจรวม Auth; ไม่ใช่เจ้าของ domain logic |
| PostgreSQL | Relational foundation และ source-of-truth financial data store |
| AI Model | Replaceable component ที่ Wendy เรียกผ่าน provider abstraction; ไม่ใช่ Wendy ทั้งระบบ |
| LINE | Initial communication/interface channel |
| Hermes | ไม่อยู่ใน Wendy MVP v0.1 |
| Financial Event | Intent/boundary object ที่อธิบายเหตุการณ์ทางการเงินก่อน validation และ posting |
| Journal Entry | Balanced accounting representation ของ Financial Event หนึ่งรายการหรือการปรับปรุงที่มี trace ชัดเจน |
| Journal Line | Debit หรือ credit line ภายใน Journal Entry |
| Ledger | ชุด posted journal lines ที่เป็นแหล่ง financial truth |
| Account | บัญชีใน chart of accounts ที่ journal line อ้างถึง |
| Account Balance | ผลรวม debit/credit ตามกฎของ account ซึ่ง derive จาก ledger |
| Financial State | Snapshot/query result ที่ derive จาก posted ledger ณ organization, scope และเวลาที่ระบุ |
| Output | สิ่งที่ Wendy สร้าง เช่น state, information, alert, insight หรือ action result |
| Communication | ช่องทางที่ใช้ส่ง Output เช่น LINE, Vault UI, API หรือ notification |

---

## 3. Architecture Principles

1. **Understand before truth:** raw input และ AI interpretation ต้องไม่ถูกถือเป็นบัญชีจนกว่าจะผ่าน deterministic controls
2. **One controlled write path:** ไม่มี component ใดแก้ ledger ตรง ๆ; มีเพียง Accounting/Ledger Posting service ที่ post journal ที่ผ่าน validation แล้ว
3. **AI assists; code governs:** AI ช่วยตีความความหมาย แต่ code/SQL ควบคุม arithmetic, rules, posting, balances, aggregation และ reconciliation result
4. **Event boundary:** ทุก financial origin—user, POS, bank, AI, API, automation หรือ Wendy action—ต้องสร้าง Financial Event และผ่าน control เดียวกัน
5. **Provenance by construction:** เก็บ source และ transformation lineage ไม่ใช่เพียง final transaction
6. **Organization isolation:** authorization และ query scope ต้องระบุ organization เสมอ; client-supplied `organization_id` อย่างเดียวไม่ใช่หลักฐาน authorization
7. **Provider portability:** domain ports แยก Supabase, storage, auth, communication และ AI provider ออกจาก Wendy logic
8. **Idempotent processing:** ingestion, event creation, posting และ action execution ต้องรองรับ retry โดยไม่สร้างผลซ้ำ
9. **Explicit state transitions:** status เปลี่ยนผ่าน service ที่อนุญาตและบันทึก audit เท่านั้น
10. **MVP simplicity:** pipeline เชิงเส้น, synchronous where practical, explicit Review/Resolve; ไม่สร้าง graph/loop ก่อนมีความจำเป็น
11. **Fail closed for financial writes:** validation, authorization, provenance หรือ balancing ไม่ผ่าน ต้องไม่ post
12. **UTC storage, explicit business time:** timestamp เก็บเป็น UTC; business date/period ใช้ organization context ที่ต้องกำหนดก่อน implementation

---

## 4. System Context

```text
Input producers
(LINE, POS, bank, files, photos, APIs, Wendy actions)
        |
        v
Interface / Ingestion Adapters ------ Source Artifact Storage
        |                                      |
        v                                      v
                 Wendy Backend
 Capture -> Normalize -> Classify -> Validate
                     |
                     v
 Financial Event -> Accounting Engine -> PostgreSQL Ledger
                     |                         |
                     v                         v
             Review / Resolve       Query / Reconcile / Calculate
                                               |
                                               v
                                  Reason -> Decide -> Execute
                                               |
                                               v
                              Output -> Communication Adapters

Cross-cutting: organization authorization, provenance, audit,
observability, idempotency, secrets and sensitive-data controls
```

Trust boundaries:

- External input is untrusted until parsed and validated
- AI response is untrusted structured input until schema and deterministic validation pass
- Wendy application services may request posting but cannot bypass Accounting Engine
- Database access is organization-scoped; privileged service operations require explicit server-side authorization
- Communication providers receive only data necessary for a specific output

---

## 5. Wendy Core Pipeline

### 5.1 INPUT

- **Purpose:** รับ message, file, transaction feed, API payload หรือ internally generated event โดยไม่ตีความว่าเป็น financial truth
- **Input:** LINE message, POS, bank data, receipt, invoice, platform data, photo, screenshot, PDF, CSV/Excel, pasted text, external API หรือ Wendy Action
- **Output:** ingestion envelope พร้อม organization context, channel metadata และ payload/artifact reference
- **Responsible component:** Interface/Ingestion Adapter
- **AI or deterministic:** Deterministic transport handling
- **Validation:** authentication, authorization, supported content, payload limit, basic format, idempotency key
- **Failure conditions:** unauthenticated/unauthorized, unknown organization, corrupted/unsupported payload, storage failure, duplicate delivery
- **Traceability requirements:** สร้าง `source_id`, `source_type`, `source_channel`, `original_reference`, `organization_id`, `captured_at`; เก็บ raw artifact หรือ immutable reference ตาม retention policy
- **Example:** LINE ส่งรูป payment slip → source envelope ชนิด `photo`, ไม่สรุปว่าเป็น receipt

### 5.2 CAPTURE / EXTRACT

- **Purpose:** แปลง raw source เป็น machine-readable observations โดยรักษาตำแหน่งและหลักฐานต้นทาง
- **Input:** source envelope และ source artifact
- **Output:** extracted text/entities/tables/image observations พร้อม confidence และ location reference
- **Responsible component:** Capture Service ผ่าน parser/OCR/vision/document adapters
- **AI or deterministic:** AI ได้สำหรับ OCR/vision/document understanding; deterministic parser ใช้กับ structured formats
- **Validation:** output schema, type/size limits, artifact hash, required extraction metadata
- **Failure conditions:** unreadable content, encrypted document, parser/model timeout, malformed AI output, unsupported encoding
- **Traceability requirements:** `processing_run_id`, source/artifact IDs, provider/model/task, confidence, schema version, timestamp และ span/page/region reference เมื่อทำได้
- **Example:** PDF invoice → extracted seller, date, total และ page coordinates; ยังไม่ลงบัญชี

### 5.3 NORMALIZE

- **Purpose:** map observations จากหลายรูปแบบเข้าสู่ canonical financial schema โดยไม่สร้าง accounting truth
- **Input:** extraction output หรือ structured external payload
- **Output:** normalized candidate record พร้อม original values, normalized values และ unresolved fields
- **Responsible component:** Normalization Service
- **AI or deterministic:** deterministic mappings ก่อน; AI ช่วย semantic/date/merchant mapping ได้
- **Validation:** canonical schema, decimal/currency/date parsing, locale/timezone rules, allowed enum, no silent truncation
- **Failure conditions:** ambiguous amount/date/currency, incompatible units, missing critical field, invalid schema
- **Traceability requirements:** field-level mapping จาก normalized field ไป extraction/source, transformation version และ AI metadataถ้ามี
- **Example:** `฿3,500`, `3500 THB` → candidate amount `3500.00`, currency `THB`; date ambiguity ถูก flag

### 5.4 CLASSIFY

- **Purpose:** เสนอ event type, category และ account mapping candidate
- **Input:** normalized candidate + organization context/chart of accounts
- **Output:** classification candidates เช่น Revenue, Expense, COGS, Asset, Liability, Transfer, Tax, Refund, Fee พร้อม confidence/reasons
- **Responsible component:** Classification Service
- **AI or deterministic:** rules และ AI ร่วมกัน; final accept/review routing เป็น deterministic policy
- **Validation:** class/category/account must exist and be allowed for organization; confidence is not truth
- **Failure conditions:** no permitted mapping, conflicting classifications, stale account reference, confidence/policy requires review
- **Traceability requirements:** candidate set, selected candidate, rule/model version, confidence, reviewer override
- **Example:** “จ่ายค่า Meta Ads 3,500” → Expense / Marketing candidate

### 5.5 VALIDATE

- **Purpose:** ตรวจว่า candidate สามารถเป็น Financial Event และเข้าสู่ accounting control ได้หรือไม่
- **Input:** normalized/classified candidate, source lineage, organization rules
- **Output:** validated Financial Event, `REVIEW_REQUIRED`, duplicate disposition หรือ rejection with error codes
- **Responsible component:** Validation Service
- **AI or deterministic:** Deterministic; AI confidence ใช้ routing เท่านั้น
- **Validation:** amount, currency, date, accounts, category, required fields, ownership, duplicates, status transition และ event-type rules
- **Failure conditions:** rule failure, missing provenance, unauthorized organization, duplicate conflict, invalid state
- **Traceability requirements:** ruleset version, checks and results, duplicate candidates, actor, timestamp
- **Example:** valid Meta Ads event proceeds; ambiguous funding account → `REVIEW_REQUIRED`

### 5.6 DOUBLE-ENTRY / LEDGER

- **Purpose:** สร้าง balanced journal จาก validated event แล้ว post แบบ atomic
- **Input:** validated Financial Event และ deterministic posting rule
- **Output:** posted Journal Entry/Lines และ ledger references หรือ posting rejection
- **Responsible component:** Accounting Engine + Ledger Posting Service
- **AI or deterministic:** Deterministic only
- **Validation:** event eligible, accounts active/owned, lines non-zero where required, currency policy, total debit = total credit, idempotency, single posting per event/version
- **Failure conditions:** unbalanced entry, missing rule/account, concurrent/duplicate post, invalid period/state, database transaction failure
- **Traceability requirements:** event ID, posting rule/version, journal ID, ledger references, actor/service and transaction timestamp
- **Example:** Debit Marketing Expense 3,500 / Credit Bank 3,500 in one database transaction

### 5.7 QUERY / RECONCILE / CALCULATE

- **Purpose:** derive balances/states, compare source recordsกับ ledger และคำนวณ deterministic metrics
- **Input:** posted ledger, accounts, periods, reconciliation candidates and query parameters
- **Output:** query result, calculated Financial State, match record หรือ `REVIEW_REQUIRED`
- **Responsible component:** Financial Query Service + Reconciliation Service
- **AI or deterministic:** Deterministic code/SQL
- **Validation:** authorized organization scope, defined period/currency/accounting basis, result lineage, reconciliation rules/tolerance
- **Failure conditions:** undefined policy, incomplete period/data, mismatch, stale projection, database error
- **Traceability requirements:** query/calculation version, parameters, ledger cut-off, contributing journal/line IDs, reconciliation record
- **Example:** monthly marketing expense increase calculated from posted lines, not LLM arithmetic

### 5.8 REASON

- **Purpose:** อธิบาย structured financial results, anomalies และ comparisons ด้วย business context
- **Input:** verified Financial State, query/calculation results, allowed business context and provenance links
- **Output:** reasoned explanation/insight draft พร้อม claim-to-data references
- **Responsible component:** Reasoning Service via `AIService`
- **AI or deterministic:** AI-assisted; numeric facts supplied by deterministic layer and must not be recomputed
- **Validation:** structured input/output schemas, every financial claim references supplied data, no unsupported numbers, policy/content checks
- **Failure conditions:** missing evidence, model timeout, schema violation, unsupported claim, sensitive-data boundary violation
- **Traceability requirements:** model/provider/task, prompt/template version, input dataset/query IDs, output claims, confidence and timestamp
- **Example:** “กำไรลดเพราะค่า marketing เพิ่ม” อ้างอิง deterministic period comparison

### 5.9 DECIDE

- **Purpose:** แปลง validated state/insight เป็น proposed outcome เช่น inform, alert, request approval หรือ action plan
- **Input:** reasoning result, deterministic policy, actor permissions, risk/context
- **Output:** Decision record พร้อม disposition, rationale, required approval and proposed actions
- **Responsible component:** Decision Service
- **AI or deterministic:** AI เสนอได้; deterministic policy/authorization เป็นผู้อนุญาต route
- **Validation:** allowed decision type, evidence references, permission, approval policy, action risk classification
- **Failure conditions:** insufficient evidence, prohibited action, missing approver/policy, conflicting decision
- **Traceability requirements:** decision ID, inputs, policy version, AI interpretation if used, actor/approver and timestamps
- **Example:** mismatch → request human review; ไม่สั่งแก้ ledgerเอง

### 5.10 EXECUTE

- **Purpose:** ดำเนิน non-financial action หรือสร้าง Financial Event ใหม่สำหรับ financial action
- **Input:** authorized Decision และ action parameters
- **Output:** Action record/result; สำหรับ financial action เป็น new Financial Event เท่านั้น
- **Responsible component:** Action Orchestrator + outbound adapters; Financial Event Service for financial actions
- **AI or deterministic:** Deterministic orchestration/authorization; AI ห้าม execute ledger write
- **Validation:** approval, permission, idempotency, destination allowlist, parameter schema; financial classification
- **Failure conditions:** missing approval, adapter timeout, duplicate attempt, unauthorized destination, event validation failure
- **Traceability requirements:** decision/action IDs, requester/approver, attempts, external reference, execution timestamps, resulting event ID
- **Example:** send LINE alert เป็น non-financial; refund request สร้าง `REFUND` Financial Event แล้วกลับผ่าน validation/posting boundary

### 5.11 RECORD + TRACE

- **Purpose:** รับประกัน audit/provenance ของทุก stage; เป็น cross-cutting operation ไม่ใช่ปลายทางอย่างเดียว
- **Input:** stage transition, source/processing/financial/decision/action metadata
- **Output:** immutable/append-oriented audit and lineage records
- **Responsible component:** Traceability/Audit Service; transactionally coupled where financial integrity requires
- **AI or deterministic:** Deterministic
- **Validation:** required identifiers, organization consistency, actor/time/action, no broken parent reference
- **Failure conditions:** audit/provenance write failure, organization mismatch, missing correlation ID
- **Traceability requirements:** full source-to-output chain and processing versions; financial post must fail if mandatory trace cannot be recorded atomically
- **Example:** insight traces to calculation → journal lines → event → photo source

### 5.12 RESPOND

- **Purpose:** สร้าง channel-neutral response จาก Output และ disclosure/provenance policy
- **Input:** approved Output, recipient context, localization and access scope
- **Output:** response payload/content model
- **Responsible component:** Response Composer
- **AI or deterministic:** deterministic template หรือ AI-assisted wording; financial facts remain fixed
- **Validation:** recipient authorization, no unsupported claim, channel/privacy constraints, references retained
- **Failure conditions:** unauthorized recipient, rendering/schema error, missing output evidence
- **Traceability requirements:** output/decision IDs, template/model version, recipient scope and rendered content hash/reference
- **Example:** สรุปค่าใช้จ่ายพร้อมช่วงเวลาและ “ดูที่มา” link model

### 5.13 OUTPUT

- **Purpose:** ส่ง Financial State, information, alert, insight หรือ action result ผ่าน communication adapter
- **Input:** response payload + target channel
- **Output:** delivery result and external message/reference
- **Responsible component:** Communication Adapter (LINE first; future Vault UI/API/notification)
- **AI or deterministic:** Deterministic delivery
- **Validation:** recipient-channel binding, organization access, delivery idempotency, payload limits
- **Failure conditions:** provider unavailable, invalid recipient, expired token, rate limit, delivery rejection
- **Traceability requirements:** output ID, channel, recipient reference, attempts/status, provider reference; never log secrets or unnecessary sensitive content
- **Example:** LINE adapter ส่ง insight เดิมที่อาจส่งผ่าน Vault UI ได้โดยไม่เปลี่ยน domain output

---

## 6. Input Architecture

### 6.1 Source envelope

ทุก adapter MUST สร้าง channel-neutral envelope ก่อน processing:

```text
SourceEnvelope
- source_id
- organization_id
- source_type
- source_channel
- original_reference
- captured_at
- received_at
- content_type
- artifact_refs[] / structured_payload_ref
- sender/principal reference
- idempotency_key
- checksum(s)
- metadata (allowlisted)
```

`source_type` อธิบาย nature ของ source (เช่น photo, bank transaction, PDF) ส่วน `source_channel` อธิบาย transport (เช่น LINE, POS API, upload) ทั้งสองห้ามรวมเป็น field เดียว Photo MUST NOT imply Receipt

### 6.2 Minimum supported source classes

| Source | Ingestion concern | Capture strategy |
|---|---|---|
| LINE message | sender mapping, retry, attachment expiry | text parser / artifact fetch |
| POS | external IDs, batches, timezone | structured adapter |
| Bank transaction/statement | immutable references, sign conventions | structured parser/import |
| Receipt / Invoice | pages, totals, line items, tax fields | OCR/document understanding |
| Shop/e-commerce | order/refund/fee separation | platform adapter |
| Photo / Screenshot | unknown document kind | vision classification then extraction |
| PDF | text/image/encryption/multiple pages | PDF parser + OCR fallback |
| CSV / Excel | column mapping, locale, formulas | deterministic tabular parser |
| Copy/Paste text | ambiguity and missing metadata | text/entity extraction |
| External API | auth, version, replay | typed adapter |

### 6.3 Ingestion rules

- Preserve raw artifact or durable provider reference according to retention policy
- Hash artifacts/payloads for duplicate detection; source ID and external reference remain separately searchable
- Virus/malware scanning and file limits belong at the trust boundary; exact controls are an OPEN QUESTION
- Parsing failure must not destroy source; allow a new processing run against the same source
- Adapter errors and financial validation errors use separate error families

---

## 7. Canonical Financial Schema

The canonical schema is a versioned transport/domain candidate, not a posted ledger record.

```text
CanonicalFinancialCandidate
- schema_version
- organization_id
- source_ids[]
- candidate_id
- event_type_candidate
- occurred_at / business_date_candidate
- amount { value: decimal-string, currency }
- direction_candidate
- counterparty { raw_name, normalized_name, external_ref? }
- description
- document { number?, issue_date?, due_date? }
- line_items[] { description, quantity?, unit_price?, amount?, tax_candidate? }
- category_candidate
- account_candidates[]
- payment_account_candidate
- tax_candidates[]
- external_references[]
- extracted_fields[] { value, source_locator, confidence }
- classification_confidence
- unresolved_fields[]
- provenance_ref
```

Schema rules:

- Monetary values cross boundaries as decimal strings plus ISO currency code; floating-point is forbidden for accounting arithmetic
- Preserve original and normalized value for transformed fields
- Unknown/ambiguous values remain explicit `unresolved_fields`; do not silently default
- Schema versions are immutable and parsers/mappers declare supported versions
- Canonical candidate can produce zero, one or multiple proposed Financial Events only through an explicit, traced transformation
- Tax fields are candidates until a Product Owner-approved tax policy/rule validates them

---

## 8. AI Logic

### 8.1 Allowed responsibilities

- Capture/Extract: OCR, vision, document/text/entity understanding
- Normalize: semantic mapping, merchant normalization, date interpretation
- Classify: event/category/account candidates
- Reason: explanation, anomaly interpretation, comparison narrative and contextual reasoning over supplied structured data

### 8.2 Prohibited responsibilities

AI MUST NOT be the source of truth for arithmetic, balance, journal posting, VAT/tax rule execution, reconciliation result, aggregation, debit/credit balancing or financial statements. AI MUST NOT receive database credentials or a tool that can directly mutate ledger tables.

### 8.3 Provider abstraction

```text
AIService.execute(task, context) -> AIResult

AIContext
- organization_scope
- task_schema_version
- allowed structured inputs / artifact refs
- prompt_template_version
- privacy policy
- timeout / cost policy

AIResult
- provider
- model
- task
- structured_output
- confidence
- schema_version
- processing_timestamp
- usage metadata
- safety/error metadata
```

Domain services depend on `AIService`, never `call_openai()`, `call_gemini()` or provider SDKs. MVP MAY implement one provider; conformance tests protect replaceability.

### 8.4 AI guardrails

- Validate model output against strict versioned schema
- Treat free text and tool/model output as untrusted
- Supply only necessary organization data and avoid cross-organization context
- Reject invented numeric facts not present in approved structured inputs
- Store model/provider/task/confidence/schema/timestamp and input reference, subject to retention policy
- Prompt injection in documents must not change system permissions or invoke actions
- Confidence only informs `AUTO_ACCEPT` versus `REVIEW_REQUIRED`; threshold remains an OPEN QUESTION

---

## 9. Validation Layer

Validation is deterministic and returns stable machine-readable error codes plus human-readable context.

| Control | Required behavior |
|---|---|
| Amount | valid decimal, permitted sign/range by event type; exact limits OPEN QUESTION |
| Currency | valid supported code; multi-currency policy OPEN QUESTION |
| Date | parseable, allowed business period, timezone policy applied |
| Account | exists, active, correct organization and permitted for event |
| Category | valid organization/system category |
| Required fields | event-type schema complete |
| Organization | all referenced entities share authorized `organization_id` |
| Duplicate | evaluate idempotency key, source hash/reference and event fingerprint |
| Bank/POS overlap | create match candidate; do not silently double-post |
| Balance | total debit equals total credit before posting |
| Event status | transition allowed and version/current state unchanged |
| Provenance | mandatory source and processing references present |

Suggested status results (names are specification-level; final enums may change after review):

- `VALIDATED`: eligible for accounting transformation
- `REVIEW_REQUIRED`: ambiguity/mismatch/policy threshold needs resolution
- `REJECTED`: structurally or authoritatively invalid
- `DUPLICATE`: confirmed duplicate; must point to canonical record

`AUTO_ACCEPT` is a routing outcome only after deterministic validation and approved confidence policy. Failed validation MUST NOT post.

---

## 10. Financial Event Model

Financial Event is the exclusive input boundary to the accounting engine.

Lifecycle:

```text
DRAFT -> PENDING_VALIDATION -> VALIDATED -> POSTED
                         \-> REVIEW_REQUIRED -> (resolved) -> PENDING_VALIDATION
                         \-> REJECTED
POSTED -> no in-place accounting edit; correction uses a new linked event
```

Exact cancellation/reversal states depend on accounting policy and are OPEN QUESTIONS.

Core invariants:

- Event belongs to exactly one organization
- Event retains one or more source/provenance references; internally generated financial actions reference decision/action as source lineage
- Event amount/date/type never mutates after posting in a way that rewrites accounting history
- An event can be posted at most once per valid event version/idempotency contract
- Corrections, refunds, transfers and adjustments are new events linked to predecessors where applicable
- Only validated events may enter journal construction
- All creation origins use the same service boundary and validation controls

Example:

```text
Financial Event: EXPENSE
Amount: THB 3,500.00
Category candidate: Marketing
Funding account: Bank
Source: LINE text

Journal Entry:
Debit  Marketing Expense  THB 3,500.00
Credit Bank               THB 3,500.00
```

---

## 11. Double-entry Accounting Engine

Responsibilities:

1. Receive a validated Financial Event
2. Select an approved, versioned deterministic posting rule
3. Resolve organization-owned accounts
4. Construct Journal Entry and Journal Lines
5. Validate all invariants
6. Atomically write journal, lines, posting status, audit and mandatory provenance
7. Return immutable identifiers

Hard invariants:

```text
SUM(debit) = SUM(credit)
Unbalanced -> DO NOT POST
AI -> NO DIRECT LEDGER WRITE
Financial Action -> NEW Financial Event -> validation -> accounting engine
```

Additional controls:

- Journal lines use exact decimal/numeric values; no float
- Each line has one side only (debit XOR credit) and references one valid account
- Entry and lines share organization and currency/accounting context
- Database transaction must roll back entirely on failure
- Database permissions SHOULD deny ledger mutations to AI, interface and action adapter roles
- Posted entries are append-oriented; correction/reversal must preserve history
- Posting rules and journal entry store version/reference needed to reproduce why the posting occurred

Account hierarchy, normal balances, opening balance policy, retained earnings, period close and multi-currency treatment require Product Owner/accounting decisions.

---

## 12. Ledger Architecture

The Ledger is the set of posted Journal Entries and Journal Lines, not a mutable balance field. Balance/projection tables MAY exist for performance but are rebuildable and never supersede the ledger as truth.

Controlled write contract:

```text
Authorized Financial Event Service
  -> deterministic Validation
  -> Accounting Engine
  -> LedgerRepository.postBalancedEntry(...)
       [single DB transaction + idempotency + audit/provenance]
```

Forbidden paths include AI → ledger, adapter → ledger, action executor → ledger, manual SQL from application roles → ledger and reconciliation mismatch → ledger.

Ledger read contract always includes:

- authorized `organization_id`
- effective business date/period and ledger cut-off
- included status (`POSTED` only for financial truth)
- currency/account scope
- query/calculation version where relevant

Immutability mechanism (database privileges, triggers, append-only conventions, reversal model) is an implementation decision after accounting policy review, but the observable invariant is locked: posted financial history cannot be silently overwritten.

---

## 13. Reconciliation

Required v0.1 flow:

```text
LEDGER -> RECONCILE -> MATCH?
                       | YES -> MATCHED -> continue
                       | NO  -> REVIEW_REQUIRED / RESOLVE
```

Mismatch MUST NOT post or mutate ledger directly. Resolution that has financial impact MUST create a new Financial Event and re-enter validation/accounting flow.

Reconciliation Service responsibilities:

- Create candidate pairs/groups across source records and ledger references
- Apply deterministic exact-match and approved tolerance rules
- Store rule/version, compared values, score/reasons and evidence
- Record `MATCHED`, `REVIEW_REQUIRED` and resolved outcome
- Keep human/actor decision and any resulting event trace

MVP does not implement a complex reconciliation loop. Matching tolerance, partial/split match, many-to-one handling and auto-resolution are OPEN QUESTIONS.

---

## 14. Query & Calculation

Financial Query Service uses deterministic code/SQL over posted ledger to produce:

- current cash and bank balance
- revenue, expenses, COGS, gross profit and net profit
- accounts receivable (AR) and accounts payable (AP)
- unreconciled transactions
- period comparison

Every result MUST include or be able to resolve:

- organization, currency/account and period scope
- ledger cut-off/as-of timestamp
- accounting/calculation rule version
- contributing account/journal/line IDs or a reproducible query reference
- completeness/warning status

An LLM MAY verbalize a result but MUST NOT calculate or replace the returned numbers. Definitions of revenue recognition, COGS, profit, AR/AP, cash basis/accrual basis and period close are BLOCKING accounting-policy questions.

---

## 15. Reasoning Layer

Reasoning consumes only authorized, structured financial state/query/calculation data plus permitted business context.

Example flow for “ทำไมกำไรเดือนนี้ลด?”:

```text
Query approved periods
-> deterministic comparison
-> deterministic change contributors
-> AI explanation using supplied facts
-> claim/evidence validation
-> traceable Insight
```

Reasoning output requirements:

- Separate fact, inference and recommendation
- Each numeric claim references a query/calculation result
- State period, currency and material data limitations
- Never invent missing amounts or silently choose accounting policy
- On insufficient evidence, answer that review/data is required

---

## 16. Decision Layer

A Decision is a durable, traceable disposition over evidence, not an autonomous authority grant.

Minimum decision types for specification purposes:

- `INFORM`
- `ALERT`
- `REQUEST_REVIEW`
- `REQUEST_APPROVAL`
- `PROPOSE_ACTION`
- `NO_ACTION`

Decision records reference financial state/query/insight inputs, policy version, rationale, proposer, required approver and status. AI MAY propose a decision; deterministic authorization and approval policy govern whether an action can proceed. Approval thresholds and roles are OPEN QUESTIONS.

---

## 17. Execute / Action Layer

### 17.1 Non-Financial Action

Examples: send LINE, notification, report, request approval, task, external API call. These do not enter ledger, but require authorization, idempotency, status/attempt logging and audit.

### 17.2 Financial Action

Examples: create transaction, refund, adjustment, transfer, journal entry intent. Executor MUST NOT mutate ledger. It creates a new Financial Event referencing `decision_id` and `action_id`, then the normal validation → accounting path applies.

Suggested action lifecycle:

`PROPOSED → PENDING_APPROVAL → AUTHORIZED → EXECUTING → SUCCEEDED | FAILED | UNKNOWN`

`UNKNOWN` is required when an external call times out and outcome cannot be safely inferred; retry requires provider/idempotency reconciliation first. Exact approval policy remains open.

---

## 18. Source Traceability

Traceability is a cross-cutting graph:

```text
Original Source
-> Source Artifact
-> Processing Run / Extraction
-> Normalization / Classification (AI interpretations where used)
-> Validation
-> Financial Event
-> Journal Entry / Journal Lines
-> Ledger query / Calculation / Reconciliation
-> Insight / Decision
-> Action
-> Output / Delivery
```

Minimum metadata:

| Layer | Required metadata |
|---|---|
| Source | `source_id`, type, channel, original reference, organization, captured time |
| Processing | `processing_run_id`, operation, input/output refs, schema/rule version, status/timestamps |
| AI | provider, model, task, confidence, schema version, processing timestamp |
| Financial | `financial_event_id`, `journal_entry_id`, journal/ledger references |
| Decision/action | `decision_id`, `action_id`, approver/actor, `executed_at`, external ref |
| Output | output ID, evidence refs, communication/delivery reference |

Requirements:

- No final transaction may orphan its original source lineage
- Field-level lineage SHOULD be retained for extracted financial facts where technically available
- Mandatory posting provenance is written atomically with the journal
- Corrections append lineage; they do not erase earlier interpretation/history
- Access to lineage follows source and organization authorization
- Retention/deletion must reconcile privacy/legal needs with accounting/audit obligations; policy is OPEN QUESTION

---

## 19. Output Architecture

Output is channel-neutral domain content; Communication is delivery.

```text
Output
- output_id
- organization_id
- type: FINANCIAL_STATE | INFORMATION | ALERT | INSIGHT | ACTION_RESULT
- content/data schema version
- as_of / period / currency
- evidence_refs[]
- sensitivity
- created_at

CommunicationDelivery
- output_id
- channel
- recipient_ref
- rendered_content_ref/hash
- status / attempts / provider_ref / timestamps
```

The same Output can be rendered for LINE, Vault UI, API or notification without re-running financial logic. Example insight “Marketing expense เพิ่มขึ้น 31%” must trace to calculation → lines → journal → event → source. Recipient authorization is checked at delivery time as well as output creation time.

---

## 20. Multi-Organization Architecture

### 20.1 Isolation rules

- Every important financial entity has non-null `organization_id` or inherits it through an immutable parent with database-enforced consistency
- Server derives permitted organization scope from authenticated membership/role, not solely request input
- Repository methods require organization context; unscoped financial repository methods are forbidden in application code
- Cross-organization joins/analytics require a separate explicit privileged use case and audit; none is in MVP scope
- Artifact paths/keys, AI context, caches, jobs, logs and idempotency namespaces are organization-scoped
- Foreign keys/composite constraints SHOULD prevent cross-organization references
- PostgreSQL/Supabase Row Level Security SHOULD provide defense in depth; service-role bypass must be narrowly controlled and audited

### 20.2 Vault company data

Vault Company is an organization distinct from Customer Organization A/B. Operational platform data and each customer ledger must not be conflated. Whether Vault Company uses the same accounting product instance is an OPEN QUESTION; isolation is mandatory either way.

---

## 21. Data Model

This is conceptual—not a SQL migration. IDs, timestamps, status/version and `organization_id` are expected where applicable. Exact types/indexes/enums follow review.

### 21.1 `organizations`

- **Purpose:** tenant/financial boundary
- **Important fields:** id, legal/display name, status, base currency candidate, timezone candidate, created_at
- **Relationships:** users through membership; owns accounts, events, ledger, sources and actions
- **Invariants:** organization identity cannot be changed to move financial records; policy fields require explicit versioning/audit

### 21.2 `users` and organization memberships

- **Purpose:** authenticated principals and organization authorization
- **Important fields:** user id, auth-provider subject, status; membership organization, role/status
- **Relationships:** actor/reviewer/approver on records
- **Invariants:** authentication identity is distinct from authorization; membership required for access unless explicit service policy
- **Note:** brief lists `users`; a membership relation is necessary conceptually for multi-organization access. Exact table design is OPEN QUESTION.

### 21.3 `accounts`

- **Purpose:** organization chart of accounts
- **Important fields:** id, organization, code/name, account type, parent candidate, normal balance, currency policy, active status
- **Relationships:** referenced by journal lines; optional hierarchy
- **Invariants:** unique/valid within organization; posted references cannot be invalidated by destructive deletion

### 21.4 `sources`

- **Purpose:** original input identity/envelope
- **Important fields:** id, organization, type, channel, original reference, captured/received time, checksum, idempotency key, status
- **Relationships:** has artifacts and processing runs; linked to events
- **Invariants:** unique delivery/reference policy; immutable original identity; organization-scoped

### 21.5 `source_artifacts`

- **Purpose:** raw file/payload references and metadata
- **Important fields:** id, source, organization, storage reference, content type, size, checksum, encryption/access metadata, created_at
- **Relationships:** belongs to source; consumed by processing runs
- **Invariants:** source and artifact organization match; content mutation changes version/checksum, not history

### 21.6 `processing_runs`

- **Purpose:** record each extraction/normalization/classification attempt
- **Important fields:** id, organization, source, stage/task, input/output refs, schema/rule version, status, error code, started/completed time
- **Relationships:** has AI interpretations; may yield Financial Event candidates
- **Invariants:** retry creates a distinct run; inputs/versions reproducible; no cross-org input

### 21.7 `ai_interpretations`

- **Purpose:** persist AI-assisted observation/classification/reasoning metadata
- **Important fields:** id, processing run, organization, provider, model, task, confidence, schema/prompt version, structured output ref, timestamp
- **Relationships:** belongs to run; may be evidence for candidate/insight, never ledger authority
- **Invariants:** cannot directly reference itself as ledger posting authority; schema validated; sensitive raw prompts governed by retention policy

### 21.8 `financial_events`

- **Purpose:** exclusive accounting intent boundary
- **Important fields:** id, organization, type, business date/time, amount/currency, status, category, counterparty, provenance ref, predecessor/correction ref, version, idempotency key
- **Relationships:** sources/processing evidence; yields journal entry; may result from action
- **Invariants:** validated before journal construction; posted event accounting fields immutable; at-most-once post contract

### 21.9 `journal_entries`

- **Purpose:** balanced accounting unit created from validated event
- **Important fields:** id, organization, financial event, posting date, status, rule/version, description, posted_at, reversal/reference fields candidate
- **Relationships:** has 2+ journal lines; references one event under MVP contract
- **Invariants:** only Accounting Engine creates/posts; organization matches event/lines; posted only when balanced

### 21.10 `journal_lines`

- **Purpose:** debit/credit movements composing journal entry and ledger
- **Important fields:** id, organization, journal entry, account, debit, credit, currency, sequence, memo
- **Relationships:** belongs to journal entry and account
- **Invariants:** debit XOR credit; non-negative exact amounts; account/entry same organization; posted lines immutable

### 21.11 `transactions`

- **Purpose:** customer-facing/business projection that groups or presents financial activity without replacing event/journal truth
- **Important fields:** id, organization, event/journal refs, display type/status, counterparty/description, occurred_at
- **Relationships:** projection from event/journal; may link reconciliation
- **Invariants:** not an independent ledger write path; derived/rebuildable where possible
- **OPEN QUESTION:** whether MVP needs a separate `transactions` entity or Financial Event plus read model is sufficient

### 21.12 `reconciliation_records`

- **Purpose:** compare external/source facts with ledger records
- **Important fields:** id, organization, source/event/journal refs, rule/version, status, compared amounts/dates, reason/score, reviewer/resolution, timestamps
- **Relationships:** evidence refs; resolution may lead to new event
- **Invariants:** mismatch never mutates ledger; matched refs share organization; resolution audited

### 21.13 `decisions`

- **Purpose:** durable disposition linking evidence to proposed outcome
- **Important fields:** id, organization, type, status, rationale, evidence refs, policy version, proposer, approver, timestamps
- **Relationships:** may create actions/outputs
- **Invariants:** permission/approval enforced; AI proposal is distinguishable from authorized decision

### 21.14 `actions`

- **Purpose:** idempotent external/internal execution record
- **Important fields:** id, organization, decision, type, financial flag, status, parameters ref, idempotency key, attempt count, external ref, executed_at/error
- **Relationships:** belongs to decision; financial action creates a new event; non-financial action may create output delivery
- **Invariants:** financial action cannot point directly to ledger mutation; retries do not duplicate effect

### 21.15 `audit_logs`

- **Purpose:** append-oriented security/business/control trail
- **Important fields:** id, organization, actor/service, action, entity type/id, before/after or change ref, correlation ID, timestamp, result, reason
- **Relationships:** covers all sensitive transitions
- **Invariants:** application users cannot silently alter/delete; secrets and unnecessary sensitive payloads excluded

### 21.16 Relationship summary

```text
Organization --< Membership >-- User
Organization --< Account
Organization --< Source --< SourceArtifact
Source --< ProcessingRun --< AIInterpretation
Source/Run --< FinancialEvent --1 JournalEntry --< JournalLine >-- Account
FinancialEvent/JournalEntry --< Transaction (optional read model)
Source/Event/Journal --< ReconciliationRecord
Evidence --< Decision --< Action --(financial)--> New FinancialEvent
Decision/Calculation --< Output --< CommunicationDelivery
All controlled changes --< AuditLog
```

---

## 22. Service / Module Boundaries

| Module | Owns | Must not own |
|---|---|---|
| Ingestion | envelopes, adapter auth, idempotent receipt | financial interpretation/posting |
| Source/Artifact | source metadata, storage refs, access | accounting state |
| Capture | parsers/OCR/vision orchestration | ledger writes |
| Normalization | canonical mapping | final accounting policy |
| Classification | candidates/confidence | authoritative balance/posting |
| Validation | deterministic checks/routing | AI-generated truth |
| Financial Event | event lifecycle and idempotency | direct journal SQL |
| Accounting Engine | posting rules, balanced journals | channel/provider concerns |
| Ledger | atomic controlled persistence/read | AI or action decisions |
| Reconciliation | match evidence/status | mismatch-to-ledger shortcut |
| Query/Calculation | deterministic financial state | narrative invention |
| Reasoning | evidence-grounded explanation | arithmetic/authorization |
| Decision | disposition and approval state | adapter execution |
| Action | authorized idempotent execution | direct ledger mutation |
| Output/Response | channel-neutral output/rendering | financial recalculation |
| Audit/Trace | lineage/control logs | business-rule bypass |
| Authorization | principal/org permissions | trusting client org ID |

Key ports:

- `TransactionRepository`
- `LedgerRepository`
- `SourceRepository`
- `FileStorage`
- `AIService`
- `AuthService` / authorization policy port
- `CommunicationService`
- provider-specific adapters implement ports outside domain modules

---

## 23. Repository / Code Structure Proposal

This proposal is framework-neutral and must not be created until Product Owner approval.

```text
docs/
  WENDY_TECHNICAL_SPEC_v0.1.md
src/
  domain/
    organizations/
    sources/
    financial-events/
    accounting/
    ledger/
    reconciliation/
    decisions/
    actions/
    outputs/
  application/
    ingestion/
    processing/
    posting/
    queries/
    reasoning/
    execution/
  ports/
    repositories/
    ai/
    storage/
    auth/
    communication/
  adapters/
    supabase/
    ai-provider/
    line/
    file-parsers/
  infrastructure/
    configuration/
    observability/
tests/
  unit/
  integration/
  contract/
  invariant/
```

Dependencies point inward: adapters → ports/application → domain. Domain imports neither Supabase SDK, LINE SDK nor provider-specific AI SDK.

---

## 24. Infrastructure

Initial MVP:

- **Database:** PostgreSQL hosted by Supabase
- **Storage:** Supabase Storage behind `FileStorage`
- **Auth:** Supabase Auth or an approved abstraction behind authentication/authorization boundary
- **Interface:** LINE via a communication/ingestion adapter
- **Backend:** Wendy Backend / Business Logic Layer
- **AI:** one initial provider behind `AIService`; provider choice remains open

Rules:

- Wendy owns business logic
- PostgreSQL owns financial data
- Supabase hosts initial infrastructure, not domain semantics
- Migrations, queues, deployment region, backup/PITR, environments and runtime/framework are not selected in this version
- Async jobs MAY be required for OCR/large files, but MVP orchestration remains a linear stage machine with durable statuses rather than a workflow graph

---

## 25. Security Boundaries

Minimum architecture requirements:

- **Organization isolation:** authorization on every operation; RLS/constraints as defense in depth
- **Accounting control:** database roles restrict journal/line writes to posting service path
- **Audit trail:** actor/service, operation, target, result, reason and correlation ID for sensitive transitions
- **Controlled records:** posted accounting records are append-oriented; corrections are linked new records
- **Source access:** signed/short-lived artifact access, organization scope and least privilege
- **AI boundary:** minimum necessary data, no ledger write tools/credentials, provider/data-processing policy review
- **Secrets:** managed secret store/environment injection, rotation, no source/log storage
- **API authentication:** signed provider callbacks where supported, replay protection, idempotency and rate limits
- **Sensitive financial data:** encryption in transit/at rest via infrastructure, data minimization, redaction in logs, controlled exports
- **Service operations:** privileged Supabase/service credentials only server-side, narrowly scoped and audited
- **Supply/input boundary:** validate files/payloads and treat document instructions as data, not executable policy

Legal/regulatory classification, data residency, consent, retention, breach obligations and exact security standards are OPEN QUESTIONS and require specialist review.

---

## 26. Failure & Error Handling

### 26.1 Error families

- `INGESTION_*`: auth, payload, channel, artifact receipt
- `EXTRACTION_*`: unreadable, unsupported, timeout, malformed output
- `NORMALIZATION_*`: ambiguous/invalid canonical field
- `VALIDATION_*`: deterministic rule failure
- `DUPLICATE_*`: replay/source/event collision
- `ACCOUNTING_*`: mapping, balance, period, posting conflict
- `RECONCILIATION_*`: mismatch/insufficient evidence
- `AI_*`: provider, timeout, schema, unsupported claim
- `ACTION_*`: authorization, approval, provider, unknown outcome
- `DELIVERY_*`: channel failure/rate limit
- `SECURITY_*`: unauthorized/cross-organization/policy violation

### 26.2 Handling rules

- Financial write failures fail closed and leave no partial journal
- Retry only transient operations and always with idempotency protection
- Validation/business errors are not blind-retried; route to review/rejection
- External timeout can become `UNKNOWN`; confirm remote state before retry
- Original source and prior run remain available when processing fails
- Error records include correlation/run IDs and safe diagnostics, never secrets
- Poison/repeated failures need operator-visible status; queue/dead-letter implementation remains open
- User-facing messages distinguish “not processed”, “needs review” and “delivery uncertain” without claiming false financial state

---

## 27. Observability / Audit

### 27.1 Operational observability

- Structured logs with correlation, source, processing run, event, decision/action and organization-safe identifiers
- Metrics: stage latency/error rate, review rate, duplicate rate, AI schema failure, unbalanced rejection, posting success/conflict, reconciliation mismatch, action/delivery outcome
- Traces across adapter → Wendy service → database/provider boundaries
- Alerts for unauthorized access attempts, posting invariant violation, audit/provenance write failure and sustained provider failure

### 27.2 Audit requirements

- Append-oriented records for status transitions, approvals, overrides, posting, reconciliation resolution, action and sensitive data access
- Record actor type (`USER`, `SERVICE`, `AI_PROPOSAL`) distinctly
- Store policy/rule/model/schema versions needed to explain an outcome
- Audit access itself is organization/role controlled
- Logs are not the sole audit source; durable audit records are required

SLOs, alert thresholds, log/audit retention and personally identifiable information policy remain open.

---

## 28. MVP Scope

Wendy v0.1 scope is the smallest end-to-end, auditable linear slice:

- Multi-organization domain foundation and authorization boundary
- Source envelope/artifact provenance
- Canonical candidate schema
- Financial Event lifecycle
- Deterministic validation and duplicate controls
- Double-entry accounting and controlled ledger posting
- Basic reconciliation states (`MATCHED`, `REVIEW_REQUIRED`, resolution trace)
- Deterministic core queries/calculations after accounting definitions are approved
- AI-assisted capture/classification/reasoning through one provider abstraction
- Decision and action distinction, including financial-action event rule
- LINE as initial interface/communication adapter
- Audit, observability and invariant tests sufficient to prove controls

Delivery breadth per source type and exact first vertical slice require prioritization; “supports” in the architecture means the envelope/schema can accommodate the source, not that every connector/parser ships simultaneously.

---

## 29. Non-Goals

Wendy v0.1 is not:

- a full ERP or replacement for a professional accountant
- banking-license functionality, Virtual Bank, card issuing or payment infrastructure
- stablecoin settlement
- an autonomous financial agent
- Hermes integration
- multi-agent swarm or complex workflow engine
- simultaneous production integration of multiple AI providers
- a complete tax compliance engine
- a license to auto-resolve policy ambiguity or bypass human approval

---

## 30. Testing Strategy

Tests run at domain-unit, repository integration, database constraint/transaction, adapter contract and end-to-end levels. Financial invariant tests are release-blocking.

| Required test | Expected assertion |
|---|---|
| Debit = Credit | every posted entry has exact equal totals |
| Unbalanced journal cannot post | transaction rejected; zero journal/line/posting side effects |
| AI cannot directly update Ledger | architecture/dependency test + DB permission/integration test denies mutation |
| Every posted event has provenance | post fails without required source/processing or internal decision/action lineage |
| Financial Action creates Event | executor returns event ref; no ledger mutation before normal posting flow |
| Organization isolation | cross-org reads/writes/foreign refs rejected at service and database layers |
| Duplicate source handling | repeated delivery/process/post is idempotent; no duplicate ledger effect |
| Failed validation cannot post | all invalid statuses/rules denied |
| Reconciliation mismatch → Review | mismatch persists review state and does not alter ledger |
| Financial State derives from Ledger | recomputed state equals posted journal-line aggregation; AI value ignored |

Additional suites:

- Property-based tests generate journal lines/events to exercise balance, precision and state invariants
- State-machine tests reject invalid transitions and posted-record mutation
- Transaction/concurrency tests prove at-most-once posting and atomic audit/provenance
- Golden/fixture tests cover Thai text, dates, currencies, images/PDF/CSV mapping without treating extraction as truth
- AI contract tests use provider-neutral fixtures: schema validation, unsupported-number rejection, timeout/fallback-to-review
- Reconciliation tests cover exact match, duplicate candidate, mismatch and reviewed resolution
- Adapter contract tests cover LINE retries/signature/idempotency and provider error mapping
- Security tests cover RLS/authorization, service role, artifact access and prompt-injection isolation
- Traceability tests walk both source → output and output → source chains
- Disaster/rebuild test verifies projections/balances can be regenerated from ledger

Acceptance gate: no release if any hard invariant, organization isolation or provenance test fails.

---

## 31. Implementation Milestones

No implementation begins until this specification and BLOCKING questions for the relevant milestone are approved.

### Milestone 1 — Core domain model + Database foundation

Define approved accounting terminology/policies, organization boundary, entity/state contracts, exact-money type, repository ports, database access roles and test harness. Do not optimize projections yet.

**Exit:** domain invariants and isolation contract approved; conceptual model converted into reviewed migrations only after this gate.

### Milestone 2 — Financial Event + Double-entry Ledger

Implement event lifecycle, posting rule interface, balanced journal construction, atomic controlled posting, immutability/correction mechanism and invariant tests.

**Exit:** end-to-end deterministic event posts exactly once; unbalanced/unauthorized/invalid events cannot post.

### Milestone 3 — Source Traceability

Implement source/artifact/run lineage, mandatory posting provenance, bidirectional trace query and access controls.

### Milestone 4 — Validation

Implement field/account/organization/status validation, duplicate strategy and explicit review/reject routes.

### Milestone 5 — Capture / Extract / Normalize / Classify

Implement prioritized source vertical slice, canonical schema/versioning and AI/provider-neutral contracts. Start with one selected AI provider only.

### Milestone 6 — Query / Calculate / Reconcile

Implement approved deterministic definitions, as-of/period queries and MVP reconciliation status flow.

### Milestone 7 — Reason / Decide

Ground explanations in query IDs and introduce durable decisions/approval boundaries.

### Milestone 8 — Execute / Action

Implement non-financial execution and financial-action-to-event routing with idempotency and uncertain-outcome handling.

### Milestone 9 — LINE integration

Connect LINE ingestion/delivery, identity-to-organization mapping and source/output trace.

### Milestone 10 — AI provider integration / benchmarking

Harden selected provider adapter, evaluate accuracy/schema adherence/latency/cost/privacy on approved datasets and prove provider contract replaceability. This milestone may begin with adapter work in Milestone 5; broader benchmarking follows a working financial core.

### Recommended first implementation milestone

Begin only with **Milestone 1**, after resolving its BLOCKING questions. The first proof should be a framework-neutral domain test suite plus reviewed data/access design demonstrating exact money, organization isolation and the exclusive posting boundary. This reduces the highest risk—building ingestion/AI around an undefined accounting truth model.

---

## 32. Open Questions

These are decisions for the Product Owner with accounting, legal/regulatory and security specialists where applicable. They are not resolved by this document.

### 32.1 BLOCKING — before implementation or before the named capability

1. **Accounting basis and policies:** cash vs accrual, revenue/expense recognition, COGS, AR/AP, opening balances, closing periods and correction/reversal rules (blocks financial model, posting and queries)
2. **Chart of accounts:** minimum account hierarchy/template, organization customization, normal balances and account mapping ownership (blocks accounting engine)
3. **Currency policy:** THB-only MVP or multi-currency; FX source, rounding and gains/losses if multi-currency (blocks money schema/posting)
4. **Tax/VAT policy:** whether MVP records tax candidates only or applies approved rules; rates, inclusive/exclusive handling and jurisdiction/effective-date source (blocks any tax posting/calculation)
5. **Financial Event taxonomy and posting rules:** exact event types and required fields for the first vertical slice (blocks Milestone 2)
6. **Correction/immutability model:** reversal vs adjusting entries, void semantics, backdating and closed-period behavior (blocks posted-record design)
7. **User/membership/roles:** organization membership model and who may view, submit, review, approve, post or resolve (blocks authorization schema)
8. **Approval thresholds:** actions/events requiring approval, approver roles and segregation of duties (blocks auto-accept/action behavior)
9. **Source provenance minimum:** whether every event must have an external source or whether internal/manual source records are allowed and how they are evidenced (blocks mandatory provenance constraint)
10. **Duplicate policy:** canonical keys/fingerprints, bank/POS overlap handling and human override semantics (blocks idempotent ingestion/validation)
11. **Reconciliation tolerance:** exact/date/amount tolerance, split/many-to-one rules and who can resolve (blocks reconciliation implementation)
12. **AI confidence policy:** thresholds per task/source for auto-accept vs review and behavior when provider is unavailable (blocks automated AI routing, not deterministic core)
13. **Initial vertical slice:** prioritized source + event type + query/output; architectural support does not mean all source adapters ship at once (blocks scoped delivery plan)
14. **Business time:** organization timezone, business date cutoff and period calendar (blocks date validation/query consistency)
15. **Transactions entity:** separate customer-facing projection or Financial Event/read model only (blocks final schema for that entity)
16. **Legal/regulatory classification:** Vault/Wendy service classification and constraints on bookkeeping, advice, data processing and customer communication in launch jurisdiction (blocks launch and may alter capabilities)

### 32.2 NON-BLOCKING — can be decided after the core boundary is approved

1. LINE conversational UX, commands, review/approval interaction and evidence display
2. Initial AI provider/model and benchmark weights, provided it conforms to `AIService`
3. Supabase Auth versus another auth adapter, subject to membership/authorization contract
4. Runtime language/framework and deployment topology
5. Queue/job technology for large/asynchronous processing
6. Exact retention/deletion/archive policy for sources, prompts, AI outputs, logs and audit records—must be decided before production data
7. Data residency, backup/PITR, RPO/RTO and environment separation—must be decided before production launch
8. File types/sizes, malware scanning provider and encrypted-document UX
9. Notification channels after LINE and Vault UI/API roadmap
10. Materiality thresholds for alerts/anomalies and decision explanation style
11. Query projection/cache strategy after correctness baseline and measured performance
12. SLOs, operational alert thresholds and cost budgets
13. Whether Vault Company uses the same tenant/accounting instance pattern as customers
14. External platform connector order beyond the first vertical slice
15. Localization/language support beyond initial Thai/required financial formats

---

## Final Review Checklist

| Criterion | Result in v0.1 |
|---|---|
| Developer understands Wendy | Defined as a software engine and decomposed by pipeline/modules |
| Vault vs Wendy separated | Product and engine explicitly separated |
| AI / Financial / Action logic separated | Separate responsibilities, services and forbidden paths |
| AI prevented from financial truth | Schema validation, DB/architecture boundary and tests specified |
| Double-entry is foundation | Required event-to-balanced-journal flow |
| Single controlled ledger write path | Accounting Engine/Ledger Posting Service only |
| End-to-end source traceability | Cross-cutting graph, metadata and bidirectional tests |
| Financial Action validated | Must create new Financial Event |
| Multi-organization support | organization-scoped entities, authorization, RLS defense |
| Not over-coupled to Supabase | ports/adapters and provider-neutral domain |
| AI provider replaceable | `AIService.execute(task, context)` contract |
| Linear, non-over-engineered MVP | explicit stage machine/review states; no agent loops |
| Automated invariants testable | release-blocking matrix and additional suites |
| Unknowns not guessed | blocking/non-blocking Open Questions |

---

## End-of-Work Summary (≤ 1 page)

### Architecture decisions locked

Wendy v0.1 is a linear, modular financial/intelligence pipeline behind the Vault product. PostgreSQL double-entry ledger is the sole financial truth, and every ledger change follows Financial Event → deterministic validation → balanced journal → atomic posting. AI may extract, normalize, classify and explain, but cannot calculate authoritative totals, validate accounting truth or write ledger records. Financial actions create new events rather than bypassing controls. Provenance spans original source through processing, ledger, calculation, decision, action and output. All critical data and operations are isolated by organization. Supabase is the initial host behind repositories/adapters, while AI and communication providers remain replaceable.

### Open questions

Before the financial core is implemented, the Product Owner must approve accounting basis/policies, chart of accounts, currencies, tax scope, event taxonomy/posting rules, correction model, roles/approval thresholds, provenance minimum, duplicate strategy, reconciliation tolerance, business time and first vertical slice. AI confidence and legal/regulatory classification must be resolved before automated routing or launch. LINE UX, implementation framework, provider choice, retention and operational targets can follow but must be settled before their production gates.

### Principal risks

- Undefined accounting/tax policy could make technically balanced entries economically wrong
- Weak tenant scoping or privileged Supabase access could expose cross-organization financial data
- AI confidence may be mistaken for validation unless the boundary is enforced in code and database permissions
- Duplicate bank/POS/source ingestion could overstate results without idempotency and review
- Missing provenance/immutability would make outputs unauditable
- Building all connectors or AI features before the ledger core would expand scope and hide correctness defects
- Regulatory/data-retention decisions may constrain storage, AI processing and customer-facing claims

### Recommended first milestone

After Product Owner/accounting review, execute only Milestone 1: lock the accounting vocabulary and policies for one vertical slice, finalize organization/authorization and conceptual entities, define exact-money and state-transition contracts, and create release-blocking domain/invariant tests. Then implement Milestone 2’s controlled double-entry path before adding AI or LINE integration.

