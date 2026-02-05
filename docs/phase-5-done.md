# Phase 5: Evidence Coordinates (Document AI)

## Goal

Provide field-level evidence with page numbers and bounding boxes by carrying Document AI layout data through the pipeline.

## Tasks

- [x] Decide storage strategy for OCR layout (JSON in `documents`, separate table, or GCS JSON) — documented tradeoffs and size limits
- [x] Extend Document AI OCR output to include layout tokens/lines with page + bounding boxes — no regression in raw text output
- [x] Persist layout data alongside each document — schema/migration + backfill plan for new docs
- [x] Upgrade field evidence builder to resolve coordinates using layout data — fallback to text-only when no match
- [x] Expose coordinates in API responses (`/api/documents/[id]/fields`) — includes `page`, `quote`, `coords`
- [x] Update evidence packet export to include coordinates — verified in output JSON
- [x] Add tests + sample fixtures — minimum 10 labeled docs, ≥90% coords coverage on key invoice fields
- [x] Publish design memo (quality/speed/cost tradeoffs + recommendation)

## Progress

Storage strategy: Done — separate table (`document_layouts`) keyed by `document_id`.
Design memo: Done.
Layout capture: Done — lines + bounding boxes stored in `document_layouts`.
Evidence coords: Done — field evidence now resolves page + bbox when layout exists.
API exposure: Done — `/api/documents/[id]` and `/api/documents/[id]/fields` include coords.
Evidence packet: Done — citations now pass through coords when present.
Fixtures/tests: Done — 10 synthetic invoices with coords coverage test.

## Next

Phase complete. Next phase to be defined.

## Design Options (Quality / Speed / Cost)

### Option A: Store OCR layout in `documents` (JSONB)
- Quality: Good (full layout available for evidence)
- Speed: Fastest to ship; simplest query path
- Cost: Higher DB row size; heavier reads if not carefully selected
- Risks: Long-term table bloat; harder to optimize at scale

### Option B: Store OCR layout in `document_layouts` (separate table, JSONB)
- Quality: Good (same layout fidelity as A)
- Speed: Slightly slower for evidence endpoints (extra query), faster for normal reads
- Cost: Moderate storage; better isolation; easier indexing/partitioning
- Risks: Requires joins or separate fetch; more schema work

### Option C: Store OCR layout in GCS (JSON) + DB pointer
- Quality: Good (full layout), but dependent on extra fetch
- Speed: Slowest for evidence endpoints (GCS fetch + parse)
- Cost: Lowest DB size, higher object storage + egress
- Risks: More moving parts; harder to keep evidence APIs responsive

### Recommended Path
Option B (separate table) for long-term performance and maintainability, with on-demand loading for evidence endpoints.
