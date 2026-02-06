# Phase 6: Storage Hardening (Archive + Working)

## Goal

Harden storage for WORM-grade archival with a clean working bucket and stable naming.

## Tasks

- [x] Split archive vs working buckets — archive retention policy set, working lifecycle set
- [x] Archive retention enforcement via bucket policy only — no per-object retention writes
- [x] Prevent duplicate `_NEEDS_REVIEW` suffix on reprocess
- [x] Verify newest documents show `gcs_retention_status=confirmed` in DB
- [x] Enforce JSON schema on Gemini classification/extraction
- [x] Retry extraction once on empty output (truncated context)
- [x] Increase default worker concurrency for higher throughput

## Progress

- Split archive vs working buckets: Done — `maryjane-archive` + `maryjane-working` configured
- Bucket-level retention only: Done — per-object retention removed from code
- Filename suffix dedupe: Done — no more `_NEEDS_REVIEW_NEEDS_REVIEW`
- DB retention status check: Done — latest docs show `confirmed` (2026-02-05)
- JSON schema + retry + concurrency: Done — improves parse stability and throughput
- Repo hygiene cleanup: Done — removed local artifacts (`.DS_Store`, `.next`, `*.tgz`), `node_modules`

## Next

Decide if/when to lock archive retention; consider batch OCR for large backfills.
