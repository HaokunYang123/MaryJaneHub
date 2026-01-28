/**
 * Result of processing a single file from inbox
 */
export interface WorkflowResult {
  success: boolean;
  documentId?: string;
  originalName: string;
  newName?: string;
  gcsPath?: string;
  error?: string;
  skipped?: boolean; // true if file was already processed (hash exists)
}

/**
 * Result of processing all files in inbox
 */
export interface BatchResult {
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  results: WorkflowResult[];
}
