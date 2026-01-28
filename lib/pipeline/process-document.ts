import { createHash } from "crypto";
import { extractWithDocumentAI } from "../document-ai/ocr.js";
import { classifyDocument } from "../gemini/classify-document.js";
import { extractDocument, type DocumentExtraction } from "../gemini/extract-document.js";
import { uploadToGCS } from "../gcs/upload.js";
import { saveDocument, getDocumentByHash } from "../supabase/documents.js";
import { analyzeDocument, type SyncStatus, type ReviewFlag } from "../workflow/review-flags.js";
import type { ProcessedDocument } from "./types.js";
import type { DocumentType } from "../gemini/document-types.js";

/**
 * Generate SHA256 hash of a buffer
 */
function generateFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Create an empty extraction result for failed pipelines
 */
function createEmptyExtraction(documentType: DocumentType): DocumentExtraction {
  const emptyData = {
    confidence: 0,
    raw_response: "",
  };

  // Return appropriate empty extraction based on type
  switch (documentType) {
    case "invoice":
      return {
        type: "invoice",
        data: {
          vendor: null,
          invoice_number: null,
          invoice_date: null,
          due_date: null,
          subtotal: null,
          tax: null,
          total: null,
          line_items: [],
          ...emptyData,
        },
      };
    case "bank_statement":
      return {
        type: "bank_statement",
        data: {
          bank_name: null,
          account_number_last4: null,
          statement_period_start: null,
          statement_period_end: null,
          opening_balance: null,
          closing_balance: null,
          total_deposits: null,
          total_withdrawals: null,
          transactions: [],
          ...emptyData,
        },
      };
    case "receipt":
      return {
        type: "receipt",
        data: {
          merchant_name: null,
          date: null,
          total: null,
          payment_method: null,
          items: [],
          subtotal: null,
          tax: null,
          tip: null,
          ...emptyData,
        },
      };
    case "contract":
      return {
        type: "contract",
        data: {
          contract_type: null,
          parties: [],
          effective_date: null,
          expiration_date: null,
          value: null,
          key_terms: [],
          governing_law: null,
          termination_clause: null,
          ...emptyData,
        },
      };
    case "tax_form":
      return {
        type: "tax_form",
        data: {
          form_type: null,
          tax_year: null,
          entity_name: null,
          entity_type: null,
          ein_last4: null,
          ssn_last4: null,
          address: null,
          total_income: null,
          total_tax: null,
          tax_withheld: null,
          refund_or_owed: null,
          ...emptyData,
        },
      };
    case "correspondence":
      return {
        type: "correspondence",
        data: {
          sender: null,
          sender_organization: null,
          recipient: null,
          recipient_organization: null,
          date: null,
          subject: null,
          summary: null,
          correspondence_type: null,
          action_items: [],
          urgency: null,
          ...emptyData,
        },
      };
    case "other":
    default:
      return {
        type: "other",
        data: {
          vendor: null,
          invoice_number: null,
          invoice_date: null,
          due_date: null,
          subtotal: null,
          tax: null,
          total: null,
          line_items: [],
          ...emptyData,
        },
      };
  }
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
  fileName: string,
  options: { skipDuplicateCheck?: boolean } = {}
): Promise<ProcessedDocument> {
  const fileHash = generateFileHash(fileBuffer);
  const processedAt = new Date().toISOString();

  // Step 0: Check for duplicate (by file hash)
  if (!options.skipDuplicateCheck) {
    try {
      const existingDoc = await getDocumentByHash(fileHash);
      if (existingDoc) {
        console.log(`  Duplicate detected: Document already exists (ID: ${existingDoc.id})`);
        return {
          fileName,
          fileHash,
          processedAt,
          ocrConfidence: existingDoc.ocr_confidence || 0,
          rawText: existingDoc.raw_text || "",
          documentType: existingDoc.document_type || "other",
          classificationConfidence: existingDoc.classification_confidence || 0,
          extraction: existingDoc.extraction,
          documentId: existingDoc.id,
          existingDocumentId: existingDoc.id,
          syncStatus: existingDoc.sync_status,
          reviewFlags: existingDoc.review_flags || [],
          gcsPath: existingDoc.gcs_path || undefined,
          status: "duplicate",
        };
      }
    } catch (err) {
      // Non-blocking: if duplicate check fails, continue processing
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.warn(`  Duplicate check warning: ${errorMessage}`);
    }
  }

  // Step 1: OCR with Document AI
  const ocrResult = await extractWithDocumentAI(fileBuffer, mimeType);

  if (!ocrResult.success) {
    return {
      fileName,
      fileHash,
      processedAt,
      ocrConfidence: 0,
      rawText: "",
      documentType: "other",
      classificationConfidence: 0,
      extraction: createEmptyExtraction("other"),
      status: "ocr_failed",
      error: `OCR failed: ${ocrResult.error.code} - ${ocrResult.error.message}`,
    };
  }

  // Step 2: Classify document type
  let documentType: DocumentType = "other";
  let classificationConfidence = 0;
  try {
    const classification = await classifyDocument(ocrResult.rawText);
    documentType = classification.documentType;
    classificationConfidence = classification.confidence;
    console.log(`  Classification: ${documentType} (${(classificationConfidence * 100).toFixed(0)}% confidence)`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.warn(`Classification warning: ${errorMessage}`);
  }

  // Step 3: Extract structured data with Gemini (type-specific)
  let extraction: DocumentExtraction;
  try {
    extraction = await extractDocument(documentType, ocrResult.rawText);
    console.log(`  Extraction: ${extraction.type} (${(extraction.data.confidence * 100).toFixed(0)}% confidence)`);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown extraction error";
    return {
      fileName,
      fileHash,
      processedAt,
      ocrConfidence: ocrResult.confidence,
      rawText: ocrResult.rawText,
      documentType,
      classificationConfidence,
      extraction: createEmptyExtraction(documentType),
      status: "extraction_failed",
      error: `Extraction failed: ${errorMessage}`,
    };
  }

  // Check if extraction actually produced meaningful results
  if (extraction.data.confidence === 0) {
    return {
      fileName,
      fileHash,
      processedAt,
      ocrConfidence: ocrResult.confidence,
      rawText: ocrResult.rawText,
      documentType,
      classificationConfidence,
      extraction,
      status: "extraction_failed",
      error: "Extraction produced no valid data",
    };
  }

  // Step 4: Analyze document for review workflow (invoices only)
  let syncStatus: SyncStatus = "not_applicable";
  let reviewFlags: ReviewFlag[] = [];
  let confidenceScore = extraction.data.confidence;

  if (documentType === "invoice" || documentType === "other") {
    const analysis = analyzeDocument(extraction);
    syncStatus = analysis.suggestedStatus;
    reviewFlags = analysis.flags;
    confidenceScore = analysis.confidenceScore;

    console.log(`  Sync Status: ${syncStatus}`);
    if (reviewFlags.length > 0) {
      console.log(`  Review Flags: ${reviewFlags.join(", ")}`);
    }
  }

  // Step 5: Upload to GCS for archival (non-blocking on failure)
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

  // Step 6: Save to Supabase (non-blocking on failure)
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
      documentType,
      classificationConfidence,
      syncStatus,
      confidenceScore,
      reviewFlags,
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
    documentType,
    classificationConfidence,
    extraction,
    gcsPath,
    documentId,
    syncStatus,
    reviewFlags,
    status: "success",
  };
}
