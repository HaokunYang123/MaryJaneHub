# S07 — Documents UI

## Status: Done

## Intent

Provide the main documents workspace: list documents with filters, preview documents (PDF-first with field highlights), and perform review actions (approve/reject). Display extraction metadata, confidence scores, and status badges.

**Success criteria:** User can browse documents, open a preview drawer with the original PDF, see highlighted extracted fields, and approve or reject documents — all without leaving the workspace page.

**Non-goals:** Drag-and-drop upload. Bulk selection UI. Mobile-optimized layout.

## Contract

**ContractVersion: v1**

### DocumentsWorkspace

Main page component at `/dashboard/documents`.

**Data sources (API calls):**
- `GET /api/documents` — list with pagination (limit/offset) and filters (status, type)
- `GET /api/documents/summary` — status/type counts for badges
- `GET /api/documents/:id` — full document for preview
- `GET /api/documents/:id/preview` — signed GCS URL or Drive fallback

**User actions:**
- Filter by status, document type
- Open preview drawer (anchored right, shows PDF + extraction)
- Approve document (calls POST /api/documents/:id/approve)
- Reject document (calls POST /api/documents/:id/reject)
- Open in Google Drive (external link)

### PdfHighlightViewer

Renders PDF pages using pdf.js with overlay highlights.

- Loads pdf.js dynamically with web worker
- Renders pages to canvas at device pixel ratio
- Auto-scrolls to first highlighted page
- Draws highlight boxes from field evidence coordinates

### Document list item

Displays: file name, document type badge, sync status badge, confidence score, vendor, date, total, created_at.

## Proof

1. Documents list renders with pagination; changing page fetches next offset.
2. Clicking a document opens the preview drawer with PDF rendered via pdf.js.
3. Field highlights appear as overlay boxes on the PDF at the correct coordinates.
4. Approve button calls the approve API and updates the document's status badge without page reload.
5. Summary badges show correct counts by status.

## Depends On

- S02 (document data structure)
- S03 (approve/reject API, sync status)
- S05 (search integration in workspace)

## Files

- `components/documents/DocumentsWorkspace.tsx` — main workspace
- `components/documents/PdfHighlightViewer.tsx` — PDF renderer with highlights
- `components/documents/` — supporting components
