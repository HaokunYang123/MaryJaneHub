# S04 — QuickBooks Integration

## Status: Done

## Intent

Sync approved documents to QuickBooks Online as bills. Handle OAuth connection, vendor lookup/creation, bill creation with idempotency (reservation pattern), and post-sync reconciliation. Support dry-run validation.

**Success criteria:** An approved document syncs to QB exactly once, even under concurrent requests or retries. Sync failures are recoverable (abandon slot, retry). Post-sync reconciliation verifies the QB bill matches the sync snapshot.

**Non-goals:** QB payment tracking. Multi-company sync. Real-time webhook from QB.

## Contract

**ContractVersion: v1**

### POST /api/documents/sync

Auth: `requireRole("user")`

```typescript
// Request
{
  documentIds: string[],        // max 50
  expenseAccountId?: string,
  dryRun?: boolean
}

// Response
{
  success: true,
  data: {
    synced: Array<{
      documentId: string,
      qbBillId?: string,
      qbVendorId?: string,
      billData?: object,
      checklist?: PreSyncChecklist
    }>,
    errors: Array<{ documentId: string, error: string }>,
    dryRun: boolean
  }
}
```

Dry-run: validates and returns bill data without creating QB entries.

### Sync flow (per document)

1. Pre-sync checklist (status, flags, required fields, evidence)
2. Read sync snapshot from human_overrides (frozen at approval)
3. Claim idempotency slot (INSERT 'pending' — first writer wins)
4. Find or create vendor in QB
5. Check for duplicate bill in QB (vendor + date + total)
6. Create bill or return existing
7. Fulfill idempotency slot (UPDATE to 'complete' with qb_object_id)
8. Post-sync reconciliation (verify QB bill matches snapshot)
9. Update document: sync_status → "synced", qb_bill_id, synced_at

On failure at any step: abandon idempotency slot, set sync_status → "error".

### QB OAuth

- `GET /api/quickbooks/connect` → redirects to Intuit auth URL, sets CSRF cookie
- `GET /api/quickbooks/callback` → exchanges code for tokens, saves to DB, redirects to `/settings`

### Idempotency reservation pattern

```typescript
tryClaimIdempotencySlot(key, documentId, objectType) → { claimed: boolean, existingRecord? }
fulfillIdempotencySlot(key, qbObjectId) → void
abandonIdempotencySlot(key) → void
```

Key built from: document_id + file_hash + vendor + total + date.

## Proof

1. Syncing the same document twice returns the same qb_bill_id without creating a duplicate bill.
2. If QB API call fails after claim, the slot is abandoned and the document can be retried.
3. Dry-run returns bill data and checklist without creating any QB entity.
4. Post-sync reconciliation detects mismatch between QB bill total and sync snapshot total.
5. Documents without sync_status "approved" are rejected by the pre-sync checklist.

## Depends On

- S01 (requireRole for sync endpoint)
- S03 (approved status + sync snapshot)
- ADR-001 (service key for DB)
- ADR-002 (role hierarchy — user+ required)
- ADR-004 (audit logging)

## Files

- `lib/workflow/sync-to-quickbooks.ts` — main sync orchestrator
- `lib/quickbooks/api.ts` — QB REST API client
- `lib/quickbooks/idempotency.ts` — reservation pattern (claim/fulfill/abandon)
- `lib/quickbooks/auth.ts` — OAuth token refresh
- `lib/quickbooks/token-store.ts` — token persistence
- `lib/quickbooks/invoice-to-bill.ts` — extraction → QB bill mapping
- `lib/quickbooks/config.ts` — QB configuration
- `lib/quickbooks/types.ts`
- `app/api/documents/sync/route.ts`
- `app/api/quickbooks/connect/route.ts`
- `app/api/quickbooks/callback/route.ts`
