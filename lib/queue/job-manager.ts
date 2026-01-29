/**
 * Job Manager
 *
 * Functions for managing the processing job queue.
 * Uses PostgreSQL row-level locking for concurrent job claiming.
 */

import { getSupabase } from "@/lib/supabase/client";
import type {
  ProcessingJob,
  CreateJobInput,
  JobProgressUpdate,
  BatchStats,
  JobStatus,
  CreateJobsResult,
} from "./types";

const LOG_PREFIX = "[Queue]";

/**
 * Create jobs for files (bulk insert)
 * Skips files that already have pending/processing jobs
 *
 * Note: We use individual inserts because the partial unique index
 * (drive_file_id WHERE status IN ('pending', 'processing')) doesn't
 * work with Supabase's upsert/ON CONFLICT.
 */
export async function createJobs(inputs: CreateJobInput[]): Promise<CreateJobsResult> {
  if (inputs.length === 0) {
    return { success: true, jobs: [], created: 0, skipped: 0 };
  }

  // Use individual inserts to properly handle the partial unique index
  return createJobsIndividually(inputs);
}

/**
 * Create jobs one by one (fallback for handling duplicates)
 */
async function createJobsIndividually(inputs: CreateJobInput[]): Promise<CreateJobsResult> {
  const supabase = getSupabase();
  const createdJobs: ProcessingJob[] = [];
  let skipped = 0;

  for (const input of inputs) {
    try {
      const { data, error } = await supabase
        .from("processing_jobs")
        .insert({
          drive_file_id: input.drive_file_id,
          drive_file_name: input.drive_file_name,
          mime_type: input.mime_type,
          batch_id: input.batch_id || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          // Duplicate - job already exists for this file
          skipped++;
          continue;
        }
        console.warn(`${LOG_PREFIX} Error creating job for ${input.drive_file_name}:`, error.message);
        skipped++;
        continue;
      }

      createdJobs.push(data as ProcessingJob);
    } catch (err) {
      skipped++;
    }
  }

  console.log(`${LOG_PREFIX} Created ${createdJobs.length} jobs, skipped ${skipped}`);

  return {
    success: true,
    jobs: createdJobs,
    created: createdJobs.length,
    skipped,
  };
}

/**
 * Claim next N pending jobs atomically
 * Uses PostgreSQL function with FOR UPDATE SKIP LOCKED
 */
export async function claimJobs(limit: number): Promise<ProcessingJob[]> {
  const supabase = getSupabase();

  try {
    // Use the PostgreSQL function that handles locking
    const { data, error } = await supabase.rpc("claim_processing_jobs", {
      claim_limit: limit,
    });

    if (error) {
      console.error(`${LOG_PREFIX} Error claiming jobs:`, error);
      return [];
    }

    const jobs = (data || []) as ProcessingJob[];

    if (jobs.length > 0) {
      console.log(`${LOG_PREFIX} Claimed ${jobs.length} job(s): ${jobs.map((j) => j.drive_file_name).join(", ")}`);
    }

    return jobs;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error claiming jobs:`, errorMessage);
    return [];
  }
}

/**
 * Update job progress (current step and completed steps)
 */
export async function updateJobProgress(
  jobId: string,
  update: JobProgressUpdate
): Promise<void> {
  const supabase = getSupabase();

  try {
    const { error } = await supabase
      .from("processing_jobs")
      .update({
        current_step: update.current_step,
        steps_completed: update.steps_completed,
      })
      .eq("id", jobId);

    if (error) {
      console.error(`${LOG_PREFIX} Error updating job progress:`, error);
      throw error;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error updating job ${jobId}:`, errorMessage);
    throw error;
  }
}

/**
 * Mark job as completed with optional link to created document
 */
export async function completeJob(jobId: string, documentId?: string | null): Promise<void> {
  const supabase = getSupabase();

  try {
    const updateData: Record<string, unknown> = {
      status: "completed",
      completed_at: new Date().toISOString(),
      current_step: null,
    };

    // Only set document_id if provided (foreign key constraint)
    if (documentId) {
      updateData.document_id = documentId;
    }

    const { error } = await supabase
      .from("processing_jobs")
      .update(updateData)
      .eq("id", jobId);

    if (error) {
      console.error(`${LOG_PREFIX} Error completing job:`, error);
      throw error;
    }

    const docInfo = documentId ? ` -> document ${documentId}` : "";
    console.log(`${LOG_PREFIX} Job ${jobId} completed${docInfo}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error completing job ${jobId}:`, errorMessage);
    throw error;
  }
}

/**
 * Mark job as failed with error details
 */
export async function failJob(jobId: string, error: Error): Promise<void> {
  const supabase = getSupabase();

  try {
    const { error: updateError } = await supabase
      .from("processing_jobs")
      .update({
        status: "failed",
        error_message: error.message,
        error_stack: error.stack || null,
        completed_at: new Date().toISOString(),
        current_step: null,
      })
      .eq("id", jobId);

    if (updateError) {
      console.error(`${LOG_PREFIX} Error failing job:`, updateError);
      throw updateError;
    }

    console.log(`${LOG_PREFIX} Job ${jobId} failed: ${error.message}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error marking job ${jobId} as failed:`, errorMessage);
    throw err;
  }
}

/**
 * Check if job should be retried based on attempts
 */
export function shouldRetry(job: ProcessingJob): boolean {
  return job.attempts < job.max_attempts;
}

/**
 * Reset failed jobs for retry (set status back to pending)
 * Optionally filter by batch
 * Only resets jobs where attempts < max_attempts
 */
export async function resetFailedJobs(batchId?: string): Promise<number> {
  const supabase = getSupabase();

  try {
    // First, get IDs of failed jobs that can be retried (attempts < max_attempts)
    // We need to fetch first because Supabase doesn't support column-to-column comparison
    let selectQuery = supabase
      .from("processing_jobs")
      .select("id, attempts, max_attempts")
      .eq("status", "failed");

    if (batchId) {
      selectQuery = selectQuery.eq("batch_id", batchId);
    }

    const { data: failedJobs, error: selectError } = await selectQuery;

    if (selectError) {
      console.error(`${LOG_PREFIX} Error fetching failed jobs:`, selectError);
      return 0;
    }

    // Filter jobs where attempts < max_attempts
    const retryableJobIds = (failedJobs || [])
      .filter((job) => job.attempts < job.max_attempts)
      .map((job) => job.id);

    if (retryableJobIds.length === 0) {
      console.log(`${LOG_PREFIX} No failed jobs eligible for retry`);
      return 0;
    }

    // Update only the retryable jobs
    const { error: updateError } = await supabase
      .from("processing_jobs")
      .update({
        status: "pending",
        error_message: null,
        error_stack: null,
        current_step: null,
        started_at: null,
        completed_at: null,
      })
      .in("id", retryableJobIds);

    if (updateError) {
      console.error(`${LOG_PREFIX} Error resetting failed jobs:`, updateError);
      return 0;
    }

    console.log(`${LOG_PREFIX} Reset ${retryableJobIds.length} failed job(s) for retry`);
    return retryableJobIds.length;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error resetting failed jobs:`, errorMessage);
    return 0;
  }
}

/**
 * Get statistics for a batch of jobs
 */
export async function getBatchStats(batchId: string): Promise<BatchStats | null> {
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase.rpc("get_batch_stats", {
      p_batch_id: batchId,
    });

    if (error) {
      console.error(`${LOG_PREFIX} Error getting batch stats:`, error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const stats = data[0];
    return {
      batch_id: stats.batch_id,
      total: Number(stats.total),
      pending: Number(stats.pending),
      processing: Number(stats.processing),
      completed: Number(stats.completed),
      failed: Number(stats.failed),
      cancelled: Number(stats.cancelled),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error getting batch stats:`, errorMessage);
    return null;
  }
}

/**
 * Get count of pending jobs
 */
export async function getPendingJobCount(): Promise<number> {
  const supabase = getSupabase();

  try {
    const { count, error } = await supabase
      .from("processing_jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    if (error) {
      console.error(`${LOG_PREFIX} Error getting pending count:`, error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error getting pending count:`, errorMessage);
    return 0;
  }
}

/**
 * Cancel pending jobs (optionally filter by batch)
 */
export async function cancelPendingJobs(batchId?: string): Promise<number> {
  const supabase = getSupabase();

  try {
    let query = supabase
      .from("processing_jobs")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
      })
      .eq("status", "pending");

    if (batchId) {
      query = query.eq("batch_id", batchId);
    }

    const { data, error } = await query.select("id");

    if (error) {
      console.error(`${LOG_PREFIX} Error cancelling jobs:`, error);
      return 0;
    }

    const count = data?.length || 0;
    console.log(`${LOG_PREFIX} Cancelled ${count} pending job(s)`);
    return count;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error cancelling jobs:`, errorMessage);
    return 0;
  }
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string): Promise<ProcessingJob | null> {
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase
      .from("processing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      console.error(`${LOG_PREFIX} Error getting job:`, error);
      return null;
    }

    return data as ProcessingJob;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error getting job:`, errorMessage);
    return null;
  }
}

/**
 * Get recent jobs (for monitoring)
 */
export async function getRecentJobs(
  limit: number = 50,
  statusFilter?: JobStatus
): Promise<ProcessingJob[]> {
  const supabase = getSupabase();

  try {
    let query = supabase
      .from("processing_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`${LOG_PREFIX} Error getting recent jobs:`, error);
      return [];
    }

    return (data || []) as ProcessingJob[];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${LOG_PREFIX} Error getting recent jobs:`, errorMessage);
    return [];
  }
}
