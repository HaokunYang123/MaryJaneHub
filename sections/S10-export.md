# S10 — Data Export

## Status: Done

## Intent

Export document data for due diligence review. Support CSV and Excel formats with filtering by type, status, date range, and amount range. Excel exports include multiple sheets (summary, by-type breakdowns, issues).

**Success criteria:** User can download a filtered export of all documents in CSV or Excel format. Excel includes executive summary, per-type sheets, and an issues sheet.

**Non-goals:** Scheduled/automated exports. PDF report generation. Export of raw OCR text by default.

## Contract

**ContractVersion: v1**

### GET /api/export

Auth: `verifyAuth()`

```typescript
// Query params
{
  format?: "csv" | "xlsx",            // default: "csv"
  types?: string,                      // comma-separated document types
  dateFrom?: string,                   // YYYY-MM-DD
  dateTo?: string,
  minAmount?: number,
  maxAmount?: number,
  status?: string,                     // comma-separated sync statuses
  includeRawText?: boolean,            // default: false
  includeLowConfidence?: boolean       // default: false
}

// Response: file download
// CSV: Content-Type: text/csv
// XLSX: Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// Content-Disposition: attachment; filename="..."
```

### GET /api/export/summary

Auth: `verifyAuth()`

Same query params (except format). Returns JSON summary stats.

```typescript
{
  total: number,
  byType: Record<DocumentType, number>,
  byStatus: Record<SyncStatus, number>,
  qualityMetrics: { avgConfidence: number, lowConfidenceCount: number, flaggedCount: number },
  dateRange: { earliest: string, latest: string },
  totalAmount: number
}
```

### Excel sheets (when format=xlsx)

1. Executive Summary — totals, by-type, quality metrics
2. All Documents — comprehensive flat table
3. Receipts — receipt-specific fields (if any)
4. Invoices — invoice-specific fields (if any)
5. Bank Statements — (if any)
6. Issues & Flags — documents with review flags or low confidence
7. Monthly Summary — time-series breakdown

## Proof

1. GET /api/export?format=csv returns a valid CSV file with Content-Disposition header.
2. GET /api/export?format=xlsx returns a valid Excel file with multiple sheets.
3. Filtering by types=invoice returns only invoice documents in the export.
4. GET /api/export/summary returns JSON with correct total matching the filtered document count.
5. Excel Issues sheet includes only documents with non-empty review_flags or confidence < threshold.

## Depends On

- S01 (verifyAuth)
- S02 (document data structure)
- ADR-001 (service key for DB queries)

## Files

- `lib/export/index.ts` — CSV, Excel, and summary generation
- `lib/export/types.ts` — export types
- `app/api/export/route.ts`
- `app/api/export/summary/route.ts`
