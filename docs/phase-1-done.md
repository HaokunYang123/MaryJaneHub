# Phase 1: Security + Review Loop + Lawyer Evidence (M1)

## Goal

Make the document pipeline safe to deploy and easy to trust: lock down endpoints, add review/correction loop with evidence, support lawyer-mode evidence retrieval.

## Tasks

- [x] /api/export and /api/export/summary require auth — returns 401/403 if unauthorized
- [x] /api/cron/process-inbox requires CRON_SECRET — fails closed if missing
- [x] All endpoints returning raw OCR or bulk data are protected
- [x] For extracted fields, store value + confidence + evidence (page/quote/coords)
- [x] UI/API supports approve/reject and edit-field with audit trail
- [x] High-confidence fields auto-check, all auto-checks auditable
- [x] Assistant/search produces evidence packet (v2) with source snippets
- [x] Lawyer mode prefers quoting over speculative reasoning
- [x] Bank statement field keys aligned (statement_period_end/closing_balance)
- [x] Dashboard links do not 404 (minimal /documents and /admin/whitelist pages)

## Progress

Security hardening: Done — all endpoints protected with session/whitelist/cron-secret
Field evidence: Done — stored in extraction.data.field_evidence at ingestion
Review workflow: Done — approve/reject/edit APIs with audit logging
Lawyer mode: Done — evidence-first assistant prompts
Bank statement fix: Done — field mapping test added

## Completed

2026-02-01
