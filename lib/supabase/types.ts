import type { DocumentType } from "../gemini/document-types.js";
import type { DocumentExtraction } from "../gemini/extract-document.js";

/**
 * Document status in the workflow
 */
export type DocumentStatus = "draft" | "approved" | "synced" | "error";

/**
 * Document record as stored in Supabase
 */
export interface DocumentRecord {
  id: string;
  file_name: string;
  file_hash: string;
  mime_type: string | null;
  gcs_path: string | null;
  drive_file_id: string | null;
  ocr_confidence: number | null;
  raw_text: string | null;
  document_type: DocumentType | null;
  classification_confidence: number | null;
  extraction: DocumentExtraction;
  extraction_confidence: number | null;
  human_overrides: Record<string, unknown> | null;
  status: DocumentStatus;
  qb_bill_id: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

/**
 * Audit log action types
 */
export type AuditAction = "created" | "approved" | "modified" | "synced" | "error";

/**
 * Audit log record as stored in Supabase
 */
export interface AuditLogRecord {
  id: string;
  document_id: string | null;
  actor: string;
  action: AuditAction;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
}

/**
 * Result of saving a document
 */
export interface SaveDocumentResult {
  success: boolean;
  documentId?: string;
  alreadyExists?: boolean;
  error?: string;
}

/**
 * Input for saving a document (from pipeline)
 */
export interface SaveDocumentInput {
  fileName: string;
  fileHash: string;
  mimeType: string;
  gcsPath?: string;
  ocrConfidence: number;
  rawText: string;
  extraction: DocumentExtraction;
  documentType?: DocumentType;
  classificationConfidence?: number;
}
