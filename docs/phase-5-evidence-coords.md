# Phase 5: Evidence Coordinates (Document AI)

## Goal

Provide field-level evidence with page numbers and bounding boxes by carrying Document AI layout data through the pipeline.

## Tasks

- [ ] Decide storage strategy for OCR layout (JSON in `documents`, separate table, or GCS JSON) — documented tradeoffs and size limits
- [ ] Extend Document AI OCR output to include layout tokens/lines with page + bounding boxes — no regression in raw text output
- [ ] Persist layout data alongside each document — schema/migration + backfill plan for new docs
- [ ] Upgrade field evidence builder to resolve coordinates using layout data — fallback to text-only when no match
- [ ] Expose coordinates in API responses (`/api/documents/[id]/fields`) — includes `page`, `quote`, `coords`
- [ ] Update evidence packet export to include coordinates — verified in output JSON
- [ ] Add tests + sample fixtures — minimum 10 labeled docs, ≥90% coords coverage on key invoice fields

## Progress

(planned)

## Next

Confirm storage strategy for OCR layout (table vs JSON vs GCS) and define the minimal schema.
