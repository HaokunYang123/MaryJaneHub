# Phase 3: Backend Validation — Accuracy, Safety, Speed (M3)

## Goal

Make the backend trustworthy for real users: measure extraction accuracy with evidence, close security gaps, ensure latency is usable.

## Tasks

- [x] Accuracy harness: loads truth JSON, computes per-field exact/tolerance match, outputs JSON+Markdown summary
- [x] Numeric tolerance rules: amounts within $0.01, dates exact ISO
- [x] Confidence calibration: accuracy for High vs Med vs Low confidence fields
- [x] Evidence quality checks: verify excerpt exists, non-empty, references correct page
- [x] Regression test for extracted field value AND excerpt presence
- [x] Security audit: enumerate all 19 API routes, verify auth coverage
- [x] Verify no public endpoints leak raw OCR, bulk exports, or long-lived evidence links
- [x] Speed benchmark script: p50/p95 latency for search and assistant
- [x] Usability floors defined: search p95 < 2s, assistant p95 < 8s (toy mode)
- [x] High-leverage fix analysis (none needed)

## Progress

Accuracy harness: Done — `npm run eval:accuracy`, 100% on toy dataset (2 docs, 13 fields)
Evidence quality: Done — `npm run test:evidence:quality`, 14 fields checked, 0 issues
Security audit: Done — `npm run audit:security`, 19 routes, 0 unprotected
Speed benchmark: Done — `npm run benchmark:speed-floors`, framework in place
Fixes: Done — no critical issues found

## Results

- Overall accuracy: 100.00%
- High confidence accuracy: 100.00%
- Security coverage: 100% (19/19 routes protected)
- Evidence quality: 100% (14/14 fields have valid evidence)

## Completed

2026-02-03
