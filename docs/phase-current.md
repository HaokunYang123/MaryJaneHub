# Phase 6: Storage Hardening (Archive + Working)

## Goal

Harden storage for WORM-grade archival with a clean working bucket and stable naming.

## Tasks

- [x] Split archive vs working buckets — archive retention policy set, working lifecycle set
- [x] Archive retention enforcement via bucket policy only — no per-object retention writes
- [x] Prevent duplicate `_NEEDS_REVIEW` suffix on reprocess
- [x] Verify newest documents show `gcs_retention_status=confirmed` in DB

## Progress

- Split archive vs working buckets: Done — `maryjane-archive` + `maryjane-working` configured
- Bucket-level retention only: Done — per-object retention removed from code
- Filename suffix dedupe: Done — no more `_NEEDS_REVIEW_NEEDS_REVIEW`
- DB retention status check: Done — latest docs show `confirmed` (2026-02-05)

## Next

Confirm DB retention status for latest docs; then decide when to lock archive retention.
