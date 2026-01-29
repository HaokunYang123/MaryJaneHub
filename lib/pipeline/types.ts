import type { InvoiceExtraction } from "../gemini/types";
import type { DocumentType } from "../gemini/document-types";
import type { DocumentExtraction } from "../gemini/extract-document";
import type { SyncStatus, ReviewFlag } from "../workflow/review-flags";

/**
 * Status of document processing
 */
export type ProcessingStatus =
  | "success" // All steps completed successfully
  | "partial_success" // Document saved but with some issues
  | "duplicate" // Document already exists (by hash)
  | "ocr_failed" // OCR could not extract text (still saved for review)
  | "extraction_failed"; // Extraction failed (still saved with raw text)

/**
 * Result of the complete document processing pipeline
 */
export interface ProcessedDocument {
  // Metadata
  fileName: string;
  fileHash: string; // SHA256 hash for deduplication
  processedAt: string; // ISO timestamp

  // OCR layer
  ocrConfidence: number;
  rawText: string;

  // Classification layer
  documentType: DocumentType;
  classificationConfidence: number;

  // Extraction layer
  extraction: DocumentExtraction;

  // Storage layer
  gcsPath?: string; // GCS path if uploaded successfully

  // Database layer
  documentId?: string; // Supabase document ID if saved successfully
  existingDocumentId?: string; // If duplicate, the ID of the existing document

  // Sync workflow
  syncStatus?: SyncStatus;
  reviewFlags?: ReviewFlag[];

  // Status
  status: ProcessingStatus;
  error?: string;
}

// Re-export for convenience
export type { InvoiceExtraction, DocumentType, DocumentExtraction, SyncStatus, ReviewFlag };
