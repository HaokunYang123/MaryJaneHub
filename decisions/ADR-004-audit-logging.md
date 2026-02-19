# ADR-004 — Audit Logging Convention

## Status: Accepted

## Context

The system processes financial documents and syncs to accounting software. Actions need to be traceable for compliance and debugging.

## Decision

All state-changing actions write to the `audit_logs` table with a consistent structure.

### What gets logged

- Document approve/reject (S03)
- Field edits with before/after values (S03)
- QB sync attempts and results (S04)
- Assistant interactions with intent, confidence, citations (S06)
- Admin operations on whitelist, Drive (S09)

### Audit log structure

```typescript
{
  id: uuid,
  document_id: uuid | null,
  action: string,           // "approve", "reject", "field_edit", "sync", "assistant_query", ...
  actor: string,            // user email or "system" or "cron"
  before: jsonb | null,     // previous state
  after: jsonb | null,      // new state
  metadata: jsonb | null,   // extra context (reason, error, intent, etc.)
  created_at: timestamp
}
```

### Assistant audit (extended)

Assistant interactions use an in-memory audit buffer (`lib/audit/logger.ts`) with:
- Input/output hashing (PII minimization)
- Redaction of sensitive fields (ocr, raw_text)
- Citation tracking with verification ratio
- Final flush to audit_logs on request completion

## Rules

- Never log raw OCR text or full extraction in audit — use hashes and summaries
- Text fields truncated to 280 chars in audit
- Read operations are not logged (only state changes)

## Consequences

- Audit table grows with every action. No retention policy yet — may need pruning later.
- In-memory buffer means assistant audit is lost if the process crashes mid-request (acceptable for non-critical data).

## Affected Sections

S03, S04, S06, S09
