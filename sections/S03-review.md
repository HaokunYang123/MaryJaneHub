# S03 — Review & Approval

## Status: Done

## Intent

Evaluate processed documents for sync readiness. Generate review flags. Allow human approve/reject decisions. Freeze extraction data into a sync snapshot at approval time to prevent drift.

**Success criteria:** Every processed invoice gets a sync status (auto_approved, pending_review, or needs_attention) based on confidence and flags. Approved documents have a frozen snapshot that won't change if extraction re-runs. All review actions are audit-logged.

**Non-goals:** Batch approval optimization (known N+1, deferred). Automated re-review on extraction update.

## Contract

**ContractVersion: v1**

### Sync status lifecycle

```
not_applicable (non-invoice)
    or
auto_approved (confidence ≥ 95%, no blocking flags)
    or
pending_review (confidence < 95%)
    or
needs_attention (blocking flags present)
    ↓
approved → synced | error
    or
rejected
```

### POST /api/documents/:id/approve

Auth: `requireRole("user")`

```typescript
// Request
{ qbVendorId?: string, reviewedBy?: string, force?: boolean }

// Response
{ success: true, data: Document, last_audit_id: string }
```

Side effects: creates sync snapshot, writes audit log.

### POST /api/documents/:id/reject

Auth: `requireRole("user")`

```typescript
// Request
{ reason?: string, reviewedBy?: string }

// Response
{ success: true, data: Document, last_audit_id: string }
```

### PATCH /api/documents/:id/fields

Auth: `requireRole("user")`

```typescript
// Request
{
  updates: Record<string, unknown>,   // only editable fields
  reason: string,                      // min 3 chars
  reviewedBy?: string,
  evidence?: Record<string, { value: string, confidence: number, quote?: string } | null>
}

// Response
{ success: true, data: Document }
```

Side effects: updates field_evidence (confidence=1 for manual edits), writes audit log with before/after.

### Review flags

```typescript
type ReviewFlag =
  | "vendor_not_found"
  | "high_amount"
  | "missing_field"
  | "duplicate_invoice"
  | "low_confidence"
```

### Sync snapshot

Frozen at approval in `human_overrides.sync_snapshot_lock`:
```typescript
{
  vendor: string,
  invoice_date: string,
  total: number,
  line_items: LineItem[],
  confidence: number,
  field_evidence: FieldEvidenceMap
}
```

## Proof

1. An invoice with extraction confidence ≥ 0.95 and no blocking flags gets sync_status = "auto_approved".
2. Approving a document creates a sync snapshot in human_overrides; subsequent extraction changes do not alter the snapshot.
3. Rejecting a document sets sync_status = "rejected" and prevents QB sync.
4. Field edit with reason < 3 chars returns 400.
5. All approve/reject/field-edit actions produce an audit_logs entry with actor and before/after.

## Depends On

- S01 (requireRole for write endpoints)
- S02 (processed document with extraction + confidence)
- ADR-001 (service key for DB)
- ADR-002 (role hierarchy — user+ required)
- ADR-004 (audit logging)

## Files

- `lib/workflow/approve-document.ts` — approval + snapshot creation
- `lib/workflow/review-flags.ts` — flag analysis + sync status determination
- `lib/workflow/sync-snapshot.ts` — snapshot capture/restore
- `lib/workflow/field-evidence.ts` — field evidence management
- `lib/workflow/pre-sync-checklist.ts` — validation gate
- `lib/workflow/types.ts` — SyncStatus, ReviewFlag types
- `app/api/documents/[id]/approve/route.ts`
- `app/api/documents/[id]/reject/route.ts`
- `app/api/documents/[id]/fields/route.ts`
