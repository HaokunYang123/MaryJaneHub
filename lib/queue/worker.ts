/**
 * Parallel Processing Worker
 *
 * Processes jobs from the queue with configurable concurrency.
 * Uses p-limit for concurrency control.
 */

import pLimit from "p-limit";
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
import { generateCleanFilename } from "../utils/filename";
import { listNewFiles } from "../google-drive/list-files";

const LOG_PREFIX = "[Worker]";

export interface WorkerConfig {
  concurrency: number; // Max parallel jobs (default: 3)
  batchSize: number; // Jobs to claim per cycle (default: 5)
  pollInterval: number; // Ms between polling when idle (default: 5000)
  maxRunTime?: number; // Max total runtime in ms (for cron jobs)
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
  concurrency: 12,
  batchSize: 15,
  pollInterval: 5000,
  maxRunTime: 55000, // 55 seconds (safe for Vercel 60s timeout)
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
async function processJob(job: ProcessingJob): Promise<{ skipped: boolean }> {
  const { inboxFolderId, processedFolderId } = getFolderIds();
  const completedSteps: ProcessingStep[] = [...(job.steps_completed || [])];

  // Context to pass data between steps
  let fileBuffer: Buffer | undefined;
  let documentId: string | undefined;
  let extraction: unknown;
  let processingResult: Awaited<ReturnType<typeof processDocument>> | undefined;

  try {
    // Step 1: Download from Google Drive
    if (!completedSteps.includes("download")) {
      await updateJobProgress(job.id, { current_step: "download", steps_completed: completedSteps });
      console.log(`${LOG_PREFIX} Job ${job.id}: Downloading ${job.drive_file_name}...`);

      const downloadResult = await downloadFile(job.drive_file_id);

      if (!downloadResult.success || !downloadResult.buffer) {
        throw new Error(`Download failed: ${downloadResult.error}`);
      }

      fileBuffer = downloadResult.buffer;
      completedSteps.push("download");
      console.log(`${LOG_PREFIX} Job ${job.id}: Downloaded ${(fileBuffer.length / 1024).toFixed(1)}KB`);
    }

    // Steps 2-7: Process document (OCR, classify, extract, upload, save, embed)
    if (!completedSteps.includes("save")) {
      await updateJobProgress(job.id, { current_step: "ocr", steps_completed: completedSteps });
      console.log(`${LOG_PREFIX} Job ${job.id}: Processing document...`);

      if (!fileBuffer) {
        throw new Error("File buffer not available for processing");
      }

      processingResult = await processDocument(fileBuffer, job.mime_type, job.drive_file_name, {
        skipDuplicateCheck: false,
        skipEmbedding: false,
      });

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
        return { skipped: true };
      }

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

      // Generate filename based on what we have
      let newFileName: string;

      if (extraction && processingResult?.status === "success") {
        // Full success - use semantic filename
        newFileName = generateCleanFilename(
          extraction as Parameters<typeof generateCleanFilename>[0],
          job.drive_file_name
        );
      } else {
        // Partial failure - add _NEEDS_REVIEW suffix
        const ext = job.drive_file_name.includes(".")
          ? job.drive_file_name.slice(job.drive_file_name.lastIndexOf("."))
          : "";
        const baseName = job.drive_file_name.replace(ext, "");
        newFileName = `${baseName}_NEEDS_REVIEW${ext}`;
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
    }

    // Complete the job - even partial success is a completion
    await completeJob(job.id, documentId);

    const statusMsg = processingResult?.status === "success"
      ? "Completed successfully"
      : `Completed with status: ${processingResult?.status}`;
    console.log(`${LOG_PREFIX} Job ${job.id}: ${statusMsg}`);

    return { skipped: false };
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
  const limit = pLimit(cfg.concurrency);

  const stats: WorkerStats = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    startTime: new Date(),
  };

  console.log(`${LOG_PREFIX} Starting with concurrency=${cfg.concurrency}, batchSize=${cfg.batchSize}`);

  const startTime = Date.now();

  while (true) {
    // Check max runtime
    if (cfg.maxRunTime && Date.now() - startTime >= cfg.maxRunTime) {
      console.log(`${LOG_PREFIX} Max runtime reached (${cfg.maxRunTime}ms), stopping`);
      break;
    }

    // Claim a batch of jobs
    const jobs = await claimJobs(cfg.batchSize);

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
    const results = await Promise.allSettled(
      jobs.map((job) =>
        limit(async () => {
          const result = await processJob(job);
          return result;
        })
      )
    );

    // Update stats
    for (const result of results) {
      stats.processed++;
      if (result.status === "fulfilled") {
        if (result.value.skipped) {
          stats.skipped++;
        } else {
          stats.succeeded++;
        }
      } else {
        stats.failed++;
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
