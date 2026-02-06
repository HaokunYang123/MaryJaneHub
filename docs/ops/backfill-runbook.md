# Backfill Runbook

## Goal
Backfill documents with high quality while controlling OCR cost via adaptive concurrency and throttling.

## Priority Order
- Default: FIFO by job `created_at` (the queue claims pending jobs in ascending `created_at`).
- No special prioritization requested; this uses the natural queue order.
- If a different order is needed later, re-queue those files so their jobs are created in the desired order.

## Cost Guardrails
- Keep adaptive concurrency enabled; start with conservative defaults and allow scale-up only after stable batches.
- Suggested guardrails for backfill:
  - `WORKER_ADAPTIVE_CONCURRENCY=true`
  - `WORKER_CONCURRENCY=6`
  - `WORKER_BATCH_SIZE=10`
  - `WORKER_MIN_CONCURRENCY=2`
  - `WORKER_MAX_CONCURRENCY=12`
  - `WORKER_SCALE_UP_AFTER=2`
- Pause or reduce concurrency if throttle signals or OCR errors spike in the timing summary.

## Throttle Windows
- Default: 24/7 operation with adaptive backoff (no time window restrictions requested).
- If a time window is needed, adjust `vercel.json` cron schedule or run the worker manually during the desired window.

## Pre-Run Checklist
- Confirm Google Drive inbox/processed folder IDs are set in `.env.local`.
- Confirm OCR credentials and Google Drive access are valid.
- Confirm the residual invoice `MAX_TOKENS` tail risk is acceptable for this run.

## Run Steps
1. Trigger cron or run manually:
   - Cron: `/api/cron/process-inbox` (Vercel cron schedule).
   - Manual: `npm run worker` or `npm run worker -- full <concurrency> <batchSize>`.
2. Watch for the worker timing summary and extraction quality summary.
3. If throttling persists, lower concurrency and batch size.
4. If you need to re-run failed jobs, reset to `pending` and clear `steps_completed` and step fields before retry.

## Monitoring
- Track:
  - Job success/failure counts.
  - `MAX_TOKENS` occurrences (especially invoices).
  - Extraction quality summary (low confidence and needs_review rates).

## Post-Run
- Record completion stats (processed, failed, p95, wall-clock) in `/docs/phase-current.md` or `/docs/decisions.md` if a new baseline is established.
- Review any `extraction_failed` invoices for prompt or schema tuning.
