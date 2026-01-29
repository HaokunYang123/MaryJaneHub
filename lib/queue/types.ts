/**
 * Processing Queue Types
 *
 * Type definitions for the database-backed job queue
 */

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export type ProcessingStep =
  | "download"
  | "ocr"
  | "classify"
  | "extract"
  | "upload"
  | "save"
  | "embed"
  | "move";

/**
 * Processing job record as stored in database
 */
export interface ProcessingJob {
  id: string;
  drive_file_id: string;
  drive_file_name: string;
  mime_type: string;
  status: JobStatus;
  current_step: ProcessingStep | null;
  steps_completed: ProcessingStep[];
  document_id: string | null;
  error_message: string | null;
  error_stack: string | null;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  batch_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Input for creating a new job
 */
export interface CreateJobInput {
  drive_file_id: string;
  drive_file_name: string;
  mime_type: string;
  batch_id?: string;
}

/**
 * Progress update for a job
 */
export interface JobProgressUpdate {
  current_step: ProcessingStep;
  steps_completed: ProcessingStep[];
}

/**
 * Statistics for a batch of jobs
 */
export interface BatchStats {
  batch_id: string;
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

/**
 * Result of job operations
 */
export interface JobOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Result of creating jobs
 */
export interface CreateJobsResult {
  success: boolean;
  jobs?: ProcessingJob[];
  created: number;
  skipped: number;
  error?: string;
}
