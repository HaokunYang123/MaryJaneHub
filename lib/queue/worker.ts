/**
 * Parallel Processing Worker
 *
 * Processes jobs from the queue with configurable concurrency.
 * Uses p-limit for concurrency control.
 */

import pLimit from "p-limit";
import { performance } from "perf_hooks";
import {
  claimJobs,
  updateJobProgress,
  completeJob,
  failJob,
  getPendingJobCount,
  createJobs,
} from "./job-manager";
import type { ProcessingJob, ProcessingStep, CreateJobInput } from "./types";
import { downloadFile } from "../google-drive/download";
import { processDocument } from "../pipeline/process-document";
import { moveAndRenameFile } from "../google-drive/move-file";
import { updateDocumentDriveInfo } from "../supabase/documents";
import { appendNeedsReviewSuffix, generateCleanFilename } from "../utils/filename";
import { listNewFiles } from "../google-drive/list-files";
import type { ProcessingTimings } from "../pipeline/types";

const LOG_PREFIX = "[Worker]";

const THROTTLE_CODES = new Set(["429", "RESOURCE_EXHAUSTED", "RATE_LIMIT", "TIMEOUT"]);

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function isThrottleSignal(code?: string, message?: string): boolean {
  if (code) {
    const normalized = String(code).toUpperCase();
    if (THROTTLE_CODES.has(normalized)) return true;
  }

  if (message) {
    const text = message.toLowerCase();
    return (
      text.includes("rate limit") ||
      text.includes("resource exhausted") ||
      text.includes("quota") ||
      text.includes("too many requests") ||
      text.includes("429") ||
      text.includes("timed out")
    );
  }

  return false;
}

function isThrottleError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    const code = (error as Error & { code?: string | number }).code;
    return isThrottleSignal(code ? String(code) : undefined, error.message);
  }

  if (typeof error === "string") {
    return isThrottleSignal(undefined, error);
  }

  if (typeof error === "object" && error) {
    const record = error as { code?: string | number; message?: string };
    return isThrottleSignal(record.code ? String(record.code) : undefined, record.message);
  }

  return false;
}

type TimingBuckets = Record<string, number[]>;
type ExtractionMetrics = Record<string, { total: number; failed: number; lowConfidence: number; needsReview: number }>;

const LOW_CONFIDENCE_THRESHOLD = 0.8;

function recordTiming(buckets: TimingBuckets, name: string, valueMs?: number): void {
  if (typeof valueMs !== "number" || !Number.isFinite(valueMs) || valueMs < 0) return;
  if (!buckets[name]) buckets[name] = [];
  buckets[name].push(valueMs);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function printTimingSummary(buckets: TimingBuckets): void {
  const entries = Object.entries(buckets);
  if (entries.length === 0) return;

  console.log("\n" + "=".repeat(72));
  console.log("Timing Summary (p50/p95/avg)");
  console.log("=".repeat(72));

  const rows = entries
    .map(([name, values]) => {
      const sum = values.reduce((acc, v) => acc + v, 0);
      const avg = values.length ? sum / values.length : 0;
      return {
        name,
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        avg,
        count: values.length,
      };
    })
    .sort((a, b) => b.p95 - a.p95);

  for (const row of rows) {
    const label = row.name.padEnd(22);
    console.log(
      `${label} p50=${formatMs(row.p50).padStart(8)} ` +
        `p95=${formatMs(row.p95).padStart(8)} ` +
        `avg=${formatMs(row.avg).padStart(8)} ` +
        `n=${row.count}`
    );
  }
}

function recordExtractionMetrics(
  metrics: ExtractionMetrics,
  result: Awaited<ReturnType<typeof processDocument>>
): void {
  if (!result || result.status === "duplicate") return;
  const docType = result.documentType || result.extraction?.type || "unknown";
  if (!metrics[docType]) {
    metrics[docType] = { total: 0, failed: 0, lowConfidence: 0, needsReview: 0 };
  }
  const bucket = metrics[docType];
  bucket.total += 1;
  if (result.status === "extraction_failed" || result.status === "ocr_failed") {
    bucket.failed += 1;
  }
  const confidence = result.extraction?.data?.confidence ?? 0;
  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    bucket.lowConfidence += 1;
  }
  const needsReview = result.syncStatus === "needs_attention" ||
    result.syncStatus === "pending_review" ||
    result.syncStatus === "ocr_failed" ||
    result.syncStatus === "extraction_failed";
  if (needsReview) {
    bucket.needsReview += 1;
  }
}

function printExtractionMetrics(metrics: ExtractionMetrics): void {
  const entries = Object.entries(metrics);
  if (entries.length === 0) return;
  console.log("\n" + "=".repeat(72));
  console.log("Extraction Quality Summary");
  console.log("=".repeat(72));
  const rows = entries
    .map(([type, values]) => ({ type, ...values }))
    .sort((a, b) => b.total - a.total);
  for (const row of rows) {
    console.log(
      `${row.type.padEnd(16)} total=${String(row.total).padStart(3)} ` +
        `failed=${String(row.failed).padStart(3)} ` +
        `low_conf=${String(row.lowConfidence).padStart(3)} ` +
        `needs_review=${String(row.needsReview).padStart(3)}`
    );
  }
}

export interface WorkerConfig {
  concurrency: number; // Max parallel jobs (default: 3)
  batchSize: number; // Jobs to claim per cycle (default: 5)
  pollInterval: number; // Ms between polling when idle (default: 5000)
  maxRunTime?: number; // Max total runtime in ms (for cron jobs)
  adaptiveConcurrency?: boolean; // Enable adaptive concurrency based on throttling
  minConcurrency?: number; // Minimum concurrency when backing off
  maxConcurrency?: number; // Maximum concurrency when scaling up
  scaleUpAfter?: number; // Batches without throttling before scaling up
}

export interface WorkerStats {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  startTime: Date;
  endTime?: Date;
}

const DEFAULT_CONFIG: WorkerConfig = {
  concurrency: 6,
  batchSize: 10,
  pollInterval: 5000,
  maxRunTime: 55000, // 55 seconds (safe for Vercel 60s timeout)
  adaptiveConcurrency: true,
  minConcurrency: 2,
  maxConcurrency: 12,
  scaleUpAfter: 2,
};

/**
 * Get folder IDs from environment
 */
function getFolderIds() {
  const inboxFolderId = process.env.GOOGLE_DRIVE_INBOX_FOLDER_ID;
  const processedFolderId = process.env.GOOGLE_DRIVE_PROCESSED_FOLDER_ID;

  if (!inboxFolderId) {
    throw new Error("GOOGLE_DRIVE_INBOX_FOLDER_ID environment variable is required");
  }
  if (!processedFolderId) {
    throw new Error("GOOGLE_DRIVE_PROCESSED_FOLDER_ID environment variable is required");
  }

  return { inboxFolderId, processedFolderId };
}

/**
 * Process a single job through the full pipeline
 *
 * Uses graceful degradation: saves documents even when some steps fail.
 * Always moves file out of INBOX to prevent stuck files.
 */
async function processJob(
  job: ProcessingJob,
  recordTimingFn?: (name: string, valueMs?: number) => void,
  recordMetricsFn?: (result: Awaited<ReturnType<typeof processDocument>>) => void
): Promise<{ skipped: boolean; throttled: boolean }> {
  const { inboxFolderId, processedFolderId } = getFolderIds();
  const completedSteps: ProcessingStep[] = [...(job.steps_completed || [])];

  // Context to pass data between steps
  let fileBuffer: Buffer | undefined;
  let documentId: string | undefined;
  let extraction: unknown;
  let processingResult: Awaited<ReturnType<typeof processDocument>> | undefined;
  let throttled = false;
  const jobStart = performance.now();

  try {
    // Step 1: Download from Google Drive
    if (!completedSteps.includes("download")) {
      const downloadStart = performance.now();
      await updateJobProgress(job.id, { current_step: "download", steps_completed: completedSteps });
      console.log(`${LOG_PREFIX} Job ${job.id}: Downloading ${job.drive_file_name}...`);

      const downloadResult = await downloadFile(job.drive_file_id);

      if (!downloadResult.success || !downloadResult.buffer) {
        throw new Error(`Download failed: ${downloadResult.error}`);
      }

      fileBuffer = downloadResult.buffer;
      completedSteps.push("download");
      console.log(`${LOG_PREFIX} Job ${job.id}: Downloaded ${(fileBuffer.length / 1024).toFixed(1)}KB`);
      recordTimingFn?.("job.download", performance.now() - downloadStart);
    }

    // Steps 2-7: Process document (OCR, classify, extract, upload, save, embed)
    if (!completedSteps.includes("save")) {
      await updateJobProgress(job.id, { current_step: "ocr", steps_completed: completedSteps });
      console.log(`${LOG_PREFIX} Job ${job.id}: Processing document...`);

      if (!fileBuffer) {
        throw new Error("File buffer not available for processing");
      }

      const processStart = performance.now();
      processingResult = await processDocument(fileBuffer, job.mime_type, job.drive_file_name, {
        skipDuplicateCheck: false,
        skipEmbedding: false,
      });
      recordMetricsFn?.(processingResult);
      recordTimingFn?.("job.pipeline", performance.now() - processStart);
      if (processingResult.timings) {
        const stageMap: Array<[keyof ProcessingTimings, string]> = [
          ["duplicateCheckMs", "pipeline.duplicate_check"],
          ["ocrMs", "pipeline.ocr"],
          ["classificationMs", "pipeline.classification"],
          ["extractionMs", "pipeline.extraction"],
          ["evidenceMs", "pipeline.evidence"],
          ["analysisMs", "pipeline.analysis"],
          ["uploadMs", "pipeline.upload"],
          ["saveMs", "pipeline.save"],
          ["layoutMs", "pipeline.layout"],
          ["embeddingMs", "pipeline.embedding"],
          ["totalMs", "pipeline.total"],
        ];
        for (const [key, label] of stageMap) {
          recordTimingFn?.(label, processingResult.timings[key]);
        }
      }

      // Handle duplicate detection
      if (processingResult.status === "duplicate") {
        console.log(`${LOG_PREFIX} Job ${job.id}: Duplicate of ${processingResult.existingDocumentId}`);

        // Move the duplicate file to processed folder to clean up inbox
        const cleanName = generateCleanFilename(processingResult.extraction, job.drive_file_name);
        try {
          await moveAndRenameFile(job.drive_file_id, cleanName, processedFolderId, inboxFolderId);
        } catch (moveErr) {
          console.warn(`${LOG_PREFIX} Job ${job.id}: Could not move duplicate file`);
        }

        await completeJob(job.id, processingResult.existingDocumentId);
        recordTimingFn?.("job.total", performance.now() - jobStart);
        return { skipped: true, throttled: false };
      }

      throttled = isThrottleSignal(processingResult.ocrErrorCode, processingResult.ocrErrorMessage) ||
        isThrottleSignal(undefined, processingResult.error);

      // Store results even if partial failure
      documentId = processingResult.documentId;
      extraction = processingResult.extraction;
      completedSteps.push("ocr", "classify", "extract", "upload", "save", "embed");

      // Log status
      if (processingResult.status === "success") {
        console.log(`${LOG_PREFIX} Job ${job.id}: Document saved as ${documentId}`);
      } else {
        console.log(`${LOG_PREFIX} Job ${job.id}: Document saved with status: ${processingResult.status}`);
        if (processingResult.error) {
          console.log(`${LOG_PREFIX} Job ${job.id}: Error details: ${processingResult.error}`);
        }
      }
    }

    // Step 8: Move file in Google Drive - ALWAYS attempt this
    if (!completedSteps.includes("move")) {
      await updateJobProgress(job.id, { current_step: "move", steps_completed: completedSteps });
      console.log(`${LOG_PREFIX} Job ${job.id}: Moving file to Processed folder...`);
      const moveStart = performance.now();

      // Generate filename based on classification/extraction, not original filename
      let newFileName: string;
      if (extraction) {
        const baseName = generateCleanFilename(
          extraction as Parameters<typeof generateCleanFilename>[0],
          job.drive_file_name,
          processingResult?.documentType
        );
        const needsReview = Boolean(
          processingResult?.status === "ocr_failed" ||
            processingResult?.status === "extraction_failed" ||
            processingResult?.syncStatus === "needs_attention" ||
            processingResult?.syncStatus === "pending_review" ||
            processingResult?.syncStatus === "ocr_failed" ||
            processingResult?.syncStatus === "extraction_failed"
        );
        newFileName = needsReview ? appendNeedsReviewSuffix(baseName) : baseName;
      } else {
        newFileName = appendNeedsReviewSuffix(job.drive_file_name);
      }

      const moveResult = await moveAndRenameFile(
        job.drive_file_id,
        newFileName,
        processedFolderId,
        inboxFolderId
      );

      if (!moveResult.success) {
        console.warn(`${LOG_PREFIX} Job ${job.id}: Move failed (non-fatal): ${moveResult.error}`);
      } else {
        // Update document with new Drive info
        if (documentId) {
          await updateDocumentDriveInfo(documentId, job.drive_file_id, newFileName);
        }
        console.log(`${LOG_PREFIX} Job ${job.id}: Moved to ${newFileName}`);
      }

      completedSteps.push("move");
      recordTimingFn?.("job.move", performance.now() - moveStart);
    }

    // Complete the job - even partial success is a completion
    await completeJob(job.id, documentId);

    const statusMsg = processingResult?.status === "success"
      ? "Completed successfully"
      : `Completed with status: ${processingResult?.status}`;
    console.log(`${LOG_PREFIX} Job ${job.id}: ${statusMsg}`);

    recordTimingFn?.("job.total", performance.now() - jobStart);
    return { skipped: false, throttled };
  } catch (error) {
    console.error(`${LOG_PREFIX} Job ${job.id} failed:`, error);

    // Even on failure, try to move the file out of inbox to prevent stuck files
    try {
      const ext = job.drive_file_name.includes(".")
        ? job.drive_file_name.slice(job.drive_file_name.lastIndexOf("."))
        : "";
      const baseName = job.drive_file_name.replace(ext, "");
      const failedName = `${baseName}_FAILED${ext}`;

      await moveAndRenameFile(job.drive_file_id, failedName, processedFolderId, inboxFolderId);
      console.log(`${LOG_PREFIX} Job ${job.id}: Moved failed file to ${failedName}`);
    } catch (moveErr) {
      console.warn(`${LOG_PREFIX} Job ${job.id}: Could not move failed file`);
    }

    await failJob(job.id, error instanceof Error ? error : new Error(String(error)));
    throw error; // Re-throw for stats tracking
  }
}

/**
 * Run the worker - processes jobs in parallel with concurrency limit
 */
export async function runWorker(config: Partial<WorkerConfig> = {}): Promise<WorkerStats> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const minConcurrency = Math.max(1, cfg.minConcurrency ?? cfg.concurrency);
  const maxConcurrency = Math.max(minConcurrency, cfg.maxConcurrency ?? cfg.concurrency);
  const adaptiveConcurrency = cfg.adaptiveConcurrency ?? false;
  const scaleUpAfter = Math.max(1, cfg.scaleUpAfter ?? 2);
  let currentConcurrency = clampNumber(cfg.concurrency, minConcurrency, maxConcurrency);
  let stableBatches = 0;
  const timingBuckets: TimingBuckets = {};
  const recordTimingFn = (name: string, valueMs?: number) => recordTiming(timingBuckets, name, valueMs);
  const extractionMetrics: ExtractionMetrics = {};
  const recordMetricsFn = (result: Awaited<ReturnType<typeof processDocument>>) =>
    recordExtractionMetrics(extractionMetrics, result);

  const stats: WorkerStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    startTime: new Date(),
  };

  const adaptiveNote = adaptiveConcurrency
    ? ` (adaptive ${currentConcurrency}/${minConcurrency}-${maxConcurrency})`
    : "";
  console.log(
    `${LOG_PREFIX} Starting with concurrency=${currentConcurrency}, batchSize=${cfg.batchSize}${adaptiveNote}`
  );

  const startTime = Date.now();

  while (true) {
    // Check max runtime
    if (cfg.maxRunTime && Date.now() - startTime >= cfg.maxRunTime) {
      console.log(`${LOG_PREFIX} Max runtime reached (${cfg.maxRunTime}ms), stopping`);
      break;
    }

    // Claim a batch of jobs
    const claimSize = Math.max(cfg.batchSize, currentConcurrency);
    const jobs = await claimJobs(claimSize);

    if (jobs.length === 0) {
      const pending = await getPendingJobCount();
      if (pending === 0) {
        console.log(`${LOG_PREFIX} No more jobs to process, stopping`);
        break;
      }
      // Jobs exist but couldn't claim (maybe all processing), wait and retry
      console.log(`${LOG_PREFIX} ${pending} pending but none claimed, waiting...`);
      await new Promise((r) => setTimeout(r, cfg.pollInterval));
      continue;
    }

    console.log(`${LOG_PREFIX} Claimed ${jobs.length} job(s), processing in parallel...`);

    // Process jobs in parallel with concurrency limit
    const limit = pLimit(currentConcurrency);
    const results = await Promise.allSettled(
      jobs.map((job) =>
        limit(async () => {
          const result = await processJob(job, recordTimingFn, recordMetricsFn);
          return result;
        })
      )
    );

    // Update stats
    let batchFailed = 0;
    let batchThrottled = 0;
    for (const result of results) {
      stats.processed++;
      if (result.status === "fulfilled") {
        if (result.value.skipped) {
          stats.skipped++;
        } else {
          stats.succeeded++;
        }
        if (result.value.throttled) {
          batchThrottled++;
        }
      } else {
        stats.failed++;
        batchFailed++;
        if (isThrottleError(result.reason)) {
          batchThrottled++;
        }
      }
    }

    if (adaptiveConcurrency) {
      if (batchThrottled > 0) {
        stableBatches = 0;
        const nextConcurrency = Math.max(minConcurrency, Math.floor(currentConcurrency * 0.7));
        if (nextConcurrency < currentConcurrency) {
          console.log(
            `${LOG_PREFIX} Throttle detected (${batchThrottled}). Scaling down concurrency: ` +
              `${currentConcurrency} -> ${nextConcurrency}`
          );
          currentConcurrency = nextConcurrency;
        }
      } else if (batchFailed === 0) {
        stableBatches++;
        if (stableBatches >= scaleUpAfter && currentConcurrency < maxConcurrency) {
          const nextConcurrency = currentConcurrency + 1;
          console.log(
            `${LOG_PREFIX} Stable batches=${stableBatches}. Scaling up concurrency: ` +
              `${currentConcurrency} -> ${nextConcurrency}`
          );
          currentConcurrency = nextConcurrency;
          stableBatches = 0;
        }
      } else {
        stableBatches = 0;
      }
    }

    console.log(
      `${LOG_PREFIX} Batch complete: ${stats.succeeded} succeeded, ${stats.failed} failed, ${stats.skipped} skipped`
    );
  }

  stats.endTime = new Date();
  const duration = stats.endTime.getTime() - stats.startTime.getTime();
  console.log(
    `${LOG_PREFIX} Finished in ${duration}ms: ${stats.processed} processed, ${stats.succeeded} succeeded, ${stats.failed} failed, ${stats.skipped} skipped`
  );
  printTimingSummary(timingBuckets);
  printExtractionMetrics(extractionMetrics);

  return stats;
}

/**
 * Queue files from inbox and start processing
 */
export async function queueAndProcessInbox(
  config: Partial<WorkerConfig> = {}
): Promise<WorkerStats & { queued: number }> {
  const { inboxFolderId } = getFolderIds();

  // List files in inbox
  console.log(`${LOG_PREFIX} Listing files in inbox...`);
  const files = await listNewFiles(inboxFolderId);
  console.log(`${LOG_PREFIX} Found ${files.length} file(s) in inbox`);

  if (files.length === 0) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      queued: 0,
      startTime: new Date(),
      endTime: new Date(),
    };
  }

  // Create batch ID for this run
  const batchId = crypto.randomUUID();

  // Create jobs for all files
  const jobInputs: CreateJobInput[] = files.map((file) => ({
    drive_file_id: file.id,
    drive_file_name: file.name,
    mime_type: file.mimeType,
    batch_id: batchId,
  }));

  const { created, skipped } = await createJobs(jobInputs);
  console.log(
    `${LOG_PREFIX} Created ${created} job(s), skipped ${skipped} duplicate(s) for batch ${batchId}`
  );

  // Run worker
  const workerStats = await runWorker(config);

  return {
    ...workerStats,
    queued: created,
  };
}

/**
 * Process only existing queued jobs (don't queue new ones)
 */
export async function processQueuedJobs(config: Partial<WorkerConfig> = {}): Promise<WorkerStats> {
  return runWorker(config);
}
