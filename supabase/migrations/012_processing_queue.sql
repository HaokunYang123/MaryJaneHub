-- Processing Jobs Queue Table
-- Database-backed job queue for parallel document processing
--
-- Jobs flow through: pending -> processing -> completed/failed
-- Failed jobs can be retried up to max_attempts times

CREATE TABLE processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job identification
  drive_file_id TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

  -- Progress tracking (for multi-step pipeline)
  current_step TEXT,  -- 'download', 'ocr', 'classify', 'extract', 'upload', 'save', 'embed', 'move'
  steps_completed JSONB DEFAULT '[]'::jsonb,

  -- Results
  document_id UUID REFERENCES documents(id),  -- Link to created document
  error_message TEXT,
  error_stack TEXT,

  -- Retry logic
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,

  -- Batch grouping (for tracking related jobs)
  batch_id UUID,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Partial unique index to prevent duplicate pending/processing jobs for same file
CREATE UNIQUE INDEX idx_processing_jobs_active_file
  ON processing_jobs(drive_file_id)
  WHERE status IN ('pending', 'processing');

-- Indexes for common queries
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_batch ON processing_jobs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_processing_jobs_created ON processing_jobs(created_at DESC);
CREATE INDEX idx_processing_jobs_pending ON processing_jobs(created_at) WHERE status = 'pending';

-- Function to claim jobs atomically (uses advisory lock to prevent race conditions)
-- Returns claimed jobs and sets their status to 'processing'
CREATE OR REPLACE FUNCTION claim_processing_jobs(claim_limit INTEGER)
RETURNS SETOF processing_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_ids UUID[];
BEGIN
  -- Select and lock pending jobs, skip any already locked
  WITH claimed AS (
    SELECT id
    FROM processing_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT claim_limit
    FOR UPDATE SKIP LOCKED
  )
  SELECT array_agg(id) INTO claimed_ids FROM claimed;

  -- If no jobs found, return empty
  IF claimed_ids IS NULL OR array_length(claimed_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Update claimed jobs to processing status
  UPDATE processing_jobs
  SET
    status = 'processing',
    started_at = NOW(),
    attempts = attempts + 1,
    last_attempt_at = NOW()
  WHERE id = ANY(claimed_ids);

  -- Return the claimed jobs
  RETURN QUERY
  SELECT * FROM processing_jobs WHERE id = ANY(claimed_ids);
END;
$$;

-- Function to get batch statistics
CREATE OR REPLACE FUNCTION get_batch_stats(p_batch_id UUID)
RETURNS TABLE (
  batch_id UUID,
  total BIGINT,
  pending BIGINT,
  processing BIGINT,
  completed BIGINT,
  failed BIGINT,
  cancelled BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_batch_id as batch_id,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) FILTER (WHERE status = 'processing') as processing,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
  FROM processing_jobs
  WHERE processing_jobs.batch_id = p_batch_id;
$$;

-- Comments
COMMENT ON TABLE processing_jobs IS 'Job queue for parallel document processing';
COMMENT ON COLUMN processing_jobs.status IS 'Job status: pending, processing, completed, failed, cancelled';
COMMENT ON COLUMN processing_jobs.current_step IS 'Current processing step: download, ocr, classify, extract, upload, save, embed, move';
COMMENT ON COLUMN processing_jobs.steps_completed IS 'Array of completed processing steps';
COMMENT ON COLUMN processing_jobs.attempts IS 'Number of processing attempts';
COMMENT ON COLUMN processing_jobs.max_attempts IS 'Maximum retry attempts before permanent failure';
COMMENT ON COLUMN processing_jobs.batch_id IS 'Optional batch grouping for related jobs';
COMMENT ON FUNCTION claim_processing_jobs IS 'Atomically claim pending jobs for processing using SKIP LOCKED';
COMMENT ON FUNCTION get_batch_stats IS 'Get job statistics for a batch';
