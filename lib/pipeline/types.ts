import type { InvoiceExtraction } from "../gemini/types.js";
import type { DocumentType } from "../gemini/document-types.js";

/**
 * Status of document processing
 */
export type ProcessingStatus = "success" | "ocr_failed" | "extraction_failed";

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
  extraction: InvoiceExtraction;

  // Storage layer
  gcsPath?: string; // GCS path if uploaded successfully

  // Database layer
  documentId?: string; // Supabase document ID if saved successfully

  // Status
  status: ProcessingStatus;
  error?: string;
}

// Re-export for convenience
export type { InvoiceExtraction, DocumentType };
