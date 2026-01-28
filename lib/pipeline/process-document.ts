import { createHash } from "crypto";
import { extractWithDocumentAI } from "../document-ai/ocr.js";
import { extractInvoiceWithGemini } from "../gemini/extract-invoice.js";
import { uploadToGCS } from "../gcs/upload.js";
import { saveDocument } from "../supabase/documents.js";
import type { ProcessedDocument } from "./types.js";
import type { InvoiceExtraction } from "../gemini/types.js";

/**
 * Generate SHA256 hash of a buffer
 */
function generateFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Create an empty extraction result for failed pipelines
 */
function createEmptyExtraction(): InvoiceExtraction {
  return {
    vendor: null,
    invoice_number: null,
    invoice_date: null,
    due_date: null,
    subtotal: null,
    tax: null,
    total: null,
    line_items: [],
    confidence: 0,
    raw_response: "",
  };
}

/**
 * Process a document through the complete OCR and extraction pipeline
 *
 * @param fileBuffer - The document file as a Buffer
 * @param mimeType - The MIME type of the document (e.g., 'application/pdf')
 * @param fileName - Original file name for reference
 * @returns Promise resolving to ProcessedDocument with all extracted data
 */
export async function processDocument(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ProcessedDocument> {
  const fileHash = generateFileHash(fileBuffer);
  const processedAt = new Date().toISOString();

  // Step 1: OCR with Document AI
  const ocrResult = await extractWithDocumentAI(fileBuffer, mimeType);

  if (!ocrResult.success) {
    return {
      fileName,
      fileHash,
      processedAt,
      ocrConfidence: 0,
      rawText: "",
      extraction: createEmptyExtraction(),
      status: "ocr_failed",
      error: `OCR failed: ${ocrResult.error.code} - ${ocrResult.error.message}`,
    };
  }

  // Step 2: Extract structured data with Gemini
  let extraction: InvoiceExtraction;
  try {
    extraction = await extractInvoiceWithGemini(ocrResult.rawText);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown extraction error";
    return {
      fileName,
      fileHash,
      processedAt,
      ocrConfidence: ocrResult.confidence,
      rawText: ocrResult.rawText,
      extraction: createEmptyExtraction(),
      status: "extraction_failed",
      error: `Extraction failed: ${errorMessage}`,
    };
  }

  // Check if extraction actually produced meaningful results
  if (extraction.confidence === 0) {
    return {
      fileName,
      fileHash,
      processedAt,
      ocrConfidence: ocrResult.confidence,
      rawText: ocrResult.rawText,
      extraction,
      status: "extraction_failed",
      error: "Extraction produced no valid data",
    };
  }

  // Step 3: Upload to GCS for archival (non-blocking on failure)
  let gcsPath: string | undefined;
  try {
    const gcsResult = await uploadToGCS(fileBuffer, fileName, fileHash, mimeType);
    if (gcsResult.success) {
      gcsPath = gcsResult.gcsPath;
    } else {
      console.warn(`GCS upload warning: ${gcsResult.error}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown GCS error";
    console.warn(`GCS upload warning: ${errorMessage}`);
  }

  // Step 4: Save to Supabase (non-blocking on failure)
  let documentId: string | undefined;
  try {
    const saveResult = await saveDocument({
      fileName,
      fileHash,
      mimeType,
      gcsPath,
      ocrConfidence: ocrResult.confidence,
      rawText: ocrResult.rawText,
      extraction,
    });
    if (saveResult.success) {
      documentId = saveResult.documentId;
      if (saveResult.alreadyExists) {
        console.log(`Document already exists in database: ${documentId}`);
      }
    } else {
      console.warn(`Supabase save warning: ${saveResult.error}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown Supabase error";
    console.warn(`Supabase save warning: ${errorMessage}`);
  }

  return {
    fileName,
    fileHash,
    processedAt,
    ocrConfidence: ocrResult.confidence,
    rawText: ocrResult.rawText,
    extraction,
    gcsPath,
    documentId,
    status: "success",
  };
}
