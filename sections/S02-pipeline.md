# S02 — Document Processing Pipeline

## Status: Done

## Intent

Process financial documents end-to-end: receive file buffer → OCR → classify (7 types) → extract structured data → generate field evidence → create embeddings → upload to GCS archive → save to database. Includes job queue with adaptive concurrency for batch processing.

**Success criteria:** A PDF dropped into Drive inbox is fully processed (OCR, classified, extracted, embedded, archived) within one cron cycle. Duplicates are detected by SHA256 hash and skipped. Partial failures save what succeeded.

**Non-goals:** Real-time streaming. Manual upload UI. Re-processing already-succeeded documents.

## Contract

**ContractVersion: v1**

### processDocument(fileBuffer, mimeType, fileName, options?) → ProcessedDocument

Main entry point. Returns full processing result.

```typescript
// Input
{
  fileBuffer: Buffer,
  mimeType: string,           // "application/pdf" | "image/jpeg" | ...
  fileName: string,
  options?: {
    skipDuplicateCheck?: boolean,
    skipEmbedding?: boolean
  }
}

// Output
{
  id: string,                  // document UUID
  fileHash: string,            // SHA256
  isDuplicate: boolean,
  documentType: "invoice" | "receipt" | "bank_statement" | "contract" | "tax_form" | "correspondence" | "other",
  extraction: DocumentExtraction,  // type-specific structured data
  confidence: number,          // 0-1, extraction confidence
  syncStatus: SyncStatus,
  reviewFlags: string[],
  gcsPath: string | null,
  timings: Record<string, number>,  // per-step ms
  error?: string
}
```

### Document types (7)

invoice, receipt, bank_statement, contract, tax_form, correspondence, other

### Pipeline steps (in order)

1. Hash check (SHA256 dedup)
2. OCR via Document AI → rawText + layout
3. Classify via Gemini → documentType + confidence
4. Extract via Gemini (type-specific) → structured fields
5. Key-field fallback if extraction confidence < threshold
6. Field evidence → per-field source text + page + coordinates
7. Review analysis → syncStatus + reviewFlags
8. GCS upload → WORM archive
9. DB save → Supabase documents table
10. Embedding → 768-dim vector via Gemini

### Cron entry: GET /api/cron/process-inbox

Auth: `CRON_SECRET` bearer token.

```json
// Response
{
  "success": true,
  "timestamp": "...",
  "queued": 5,
  "processed": 5,
  "succeeded": 4,
  "failed": 1,
  "skipped": 0,
  "duration": 12345
}
```

### Worker behavior

- Adaptive concurrency: starts at configured level, backs off on throttle
- Configurable via env: `WORKER_CONCURRENCY`, `WORKER_BATCH_SIZE`, `WORKER_MAX_RUNTIME_MS`
- Job states: pending → processing → completed | failed (with retry)

## Proof

1. Given a valid PDF, processDocument returns a ProcessedDocument with non-null documentType, extraction, and id.
2. Processing the same file twice (same SHA256) returns isDuplicate=true and skips re-processing.
3. If OCR fails, the document is saved with error status; GCS upload and embedding are skipped but not the DB save.
4. Each pipeline step's duration is recorded in timings.
5. Cron endpoint without valid CRON_SECRET returns 401.

## Depends On

- S01 (cron auth)
- ADR-001 (service key for DB operations)

## Files

- `lib/pipeline/process-document.ts` — main orchestrator
- `lib/pipeline/types.ts` — ProcessedDocument, timings types
- `lib/document-ai/ocr.ts` — Document AI OCR
- `lib/gemini/classify-document.ts` — classification
- `lib/gemini/extract-document.ts` — extraction router
- `lib/gemini/extract-invoice.ts`, `extract-receipt.ts`, `extract-bank-statement.ts`, `extract-contract.ts`, `extract-tax-form.ts`, `extract-correspondence.ts` — type-specific extractors
- `lib/gemini/extract-key-fields.ts` — fallback extraction
- `lib/gemini/field-evidence.ts` — evidence generation
- `lib/gemini/embeddings.ts` — embedding generation
- `lib/gcs/upload.ts` — GCS archive upload
- `lib/supabase/documents.ts` — DB save
- `lib/supabase/document-layouts.ts` — layout storage
- `lib/queue/worker.ts` — job processing worker
- `lib/queue/job-manager.ts` — job lifecycle
- `app/api/cron/process-inbox/route.ts` — cron entry point
