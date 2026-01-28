// Inbox processing
export { processInboxFile } from "./process-inbox-file.js";
export { processAllInboxFiles } from "./process-inbox.js";
export type { WorkflowResult, BatchResult } from "./types.js";

// Review flags and analysis
export {
  analyzeDocument,
  getSyncStatusDescription,
  canSync,
} from "./review-flags.js";
export type {
  ReviewFlag,
  SyncStatus,
  AnalysisResult,
  AnalysisOptions,
} from "./review-flags.js";

// Document approval
export {
  approveDocument,
  rejectDocument,
  bulkApprove,
  confirmAutoApproved,
} from "./approve-document.js";
export type {
  ApprovalResult,
  ApproveOptions,
  RejectOptions,
} from "./approve-document.js";

// QuickBooks sync
export {
  syncDocument,
  syncDocuments,
  syncAllApproved,
} from "./sync-to-quickbooks.js";
export type { SyncResult } from "./sync-to-quickbooks.js";
