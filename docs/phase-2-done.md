# Phase 2: Backend Ops & Trust (M2)

## Goal

Make the backend production-solid: all documents support field-level evidence, assistant outputs are evidence-first, repeatable verification tools in place.

## Tasks

- [x] Backfill script for field_evidence on existing documents (batch, idempotent, dry-run, sample mode)
- [x] Backfill logs audit event per batch, not per field
- [x] API returns extracted fields with (value, confidence, evidence) in stable JSON shape
- [x] Field-edit API validates inputs, writes back structured fields + evidence, logs audit trail
- [x] Approve/reject endpoints return updated document state and last audit entry ID
- [x] Assistant modes: owner (concise) vs lawyer (citations+excerpts, conservative)
- [x] Evidence packets include excerpt snippets (v2)
- [x] Automated test: backfill idempotency
- [x] Automated test: evidence citation excerpt presence
- [x] Toy dataset seed script (fixture-based, no external credentials)
- [x] Smoke checklist documented

## Progress

Evidence backfill: Done — `npm run evidence:backfill`, checkpoint in exports/field-evidence-backfill-state.json
API contracts: Done — GET /api/documents/[id]/fields returns stable fields shape
Assistant modes: Done — ASSISTANT_MODE=lawyer env var
Verification: Done — idempotency and excerpt tests passing
Toy dataset: Done — test-files/toy-fixtures/toy-dataset.json

## Completed

2026-02-02
