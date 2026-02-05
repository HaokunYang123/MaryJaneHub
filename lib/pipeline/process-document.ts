import { createHash } from "crypto";
import { extractWithDocumentAI } from "../document-ai/ocr";
import { classifyDocument } from "../gemini/classify-document";
import { validateClassification } from "../gemini/validate-classification";
import { extractDocument, type DocumentExtraction } from "../gemini/extract-document";
import { uploadToGCS } from "../gcs/upload";
import { saveDocument, getDocumentByHash } from "../supabase/documents";
import { analyzeDocument, type SyncStatus, type ReviewFlag } from "../workflow/review-flags";
import { ensureFieldEvidence } from "../workflow/field-evidence";
import type { FieldEvidenceMap } from "../gemini/field-evidence";
import { generateAndStoreEmbedding } from "../search/semantic-search";
import type { ProcessedDocument } from "./types";
import type { DocumentType } from "../gemini/document-types";
import { upsertDocumentLayout } from "../supabase/document-layouts";
import type { DocumentLayout } from "../document-ai/types";

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
 * Uses graceful degradation: saves as much as possible even when steps fail.
 * Failed documents are saved with appropriate sync_status for review.
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
  options: { skipDuplicateCheck?: boolean; skipEmbedding?: boolean } = {}
): Promise<ProcessedDocument> {
  const fileHash = generateFileHash(fileBuffer);
  const processedAt = new Date().toISOString();

  // Track errors for recording
  const processingErrors: string[] = [];
  let partialFailure = false;

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
          gcsBucket: existingDoc.gcs_bucket || undefined,
          gcsObject: existingDoc.gcs_object || undefined,
          gcsGeneration: existingDoc.gcs_generation || undefined,
          gcsHashType: existingDoc.gcs_hash_type || undefined,
          gcsHashValue: existingDoc.gcs_hash_value || undefined,
          gcsRetentionStatus: existingDoc.gcs_retention_status || undefined,
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
  let rawText = "";
  let ocrConfidence = 0;
  let layout: DocumentLayout | undefined;

  if (!ocrResult.success) {
    const ocrError = `OCR failed: ${ocrResult.error.code} - ${ocrResult.error.message}`;
    processingErrors.push(ocrError);
    console.warn(`  ${ocrError}`);
    partialFailure = true;
    // Continue - we'll save what we can
  } else {
    rawText = ocrResult.rawText;
    ocrConfidence = ocrResult.confidence;
    layout = ocrResult.layout;
  }

  // Step 2: Classify document type (only if OCR succeeded)
  let documentType: DocumentType = "other";
  let classificationConfidence = 0;

  if (rawText) {
    try {
      const classification = await classifyDocument(rawText);
      documentType = classification.documentType;
      classificationConfidence = classification.confidence;
      console.log(`  Classification: ${documentType} (${(classificationConfidence * 100).toFixed(0)}% confidence)`);

      // Validate and potentially correct classification
      const validation = validateClassification(documentType, classificationConfidence, rawText);
      if (validation.wasCorrected) {
        console.log(`  Validation: corrected ${validation.originalType} → ${validation.validatedType}`);
        console.log(`    Reason: ${validation.correctionReason}`);
        documentType = validation.validatedType;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      processingErrors.push(`Classification failed: ${errorMessage}`);
      console.warn(`  Classification warning: ${errorMessage}`);
      // Continue with 'other' type
    }
  }

  // Step 3: Extract structured data with Gemini (only if we have text)
  let extraction: DocumentExtraction = createEmptyExtraction(documentType);
  let extractionFailed = false;

  if (rawText) {
    try {
      extraction = await extractDocument(documentType, rawText);
      console.log(`  Extraction: ${extraction.type} (${(extraction.data.confidence * 100).toFixed(0)}% confidence)`);

      // If extraction produced no meaningful results, retry once with a shorter context
      if (extraction.data.confidence === 0) {
        const retryText = rawText.length > 8000 ? rawText.slice(0, 8000) : rawText;
        try {
          const retryExtraction = await extractDocument(documentType, retryText);
          console.log(
            `  Extraction retry: ${retryExtraction.type} (${(retryExtraction.data.confidence * 100).toFixed(0)}% confidence)`
          );
          if (retryExtraction.data.confidence > 0) {
            extraction = retryExtraction;
          } else {
            processingErrors.push("Extraction produced no valid data");
            extractionFailed = true;
            partialFailure = true;
          }
        } catch (retryErr) {
          const retryMessage = retryErr instanceof Error ? retryErr.message : "Unknown extraction error";
          processingErrors.push(`Extraction retry failed: ${retryMessage}`);
          console.warn(`  Extraction retry failed: ${retryMessage}`);
          extractionFailed = true;
          partialFailure = true;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown extraction error";
      processingErrors.push(`Extraction failed: ${errorMessage}`);
      console.warn(`  Extraction failed: ${errorMessage}`);
      extractionFailed = true;
      partialFailure = true;
      // Keep empty extraction - we'll still save
    }
  } else {
    extractionFailed = true;
    partialFailure = true;
  }

  // Attach per-field evidence to extraction (value + confidence + evidence)
  try {
    const existingEvidence = (extraction.data as Record<string, unknown>)
      ?.field_evidence as FieldEvidenceMap | undefined;
    extraction.data.field_evidence = ensureFieldEvidence(
      extraction,
      rawText || "",
      existingEvidence,
      layout
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown evidence error";
    console.warn(`  Field evidence warning: ${errorMessage}`);
  }

  // Step 4: Analyze document for review workflow
  // Determine sync status based on what succeeded/failed
  let syncStatus: SyncStatus = "not_applicable";
  let reviewFlags: ReviewFlag[] = [];
  let confidenceScore = extraction.data.confidence;

  if (!rawText) {
    // OCR failed completely
    syncStatus = "ocr_failed";
    reviewFlags.push("low_confidence");
  } else if (extractionFailed) {
    // OCR worked but extraction failed
    syncStatus = "extraction_failed";
    reviewFlags.push("low_confidence");
  } else if (documentType === "invoice" || documentType === "other") {
    // Normal workflow for invoices
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
  let gcsBucket: string | undefined;
  let gcsObject: string | undefined;
  let gcsGeneration: string | undefined;
  let gcsHashType: "md5" | "crc32c" | undefined;
  let gcsHashValue: string | undefined;
  let gcsRetentionStatus: "confirmed" | "unconfirmed" | undefined;
  try {
    const gcsResult = await uploadToGCS(fileBuffer, fileName, fileHash, mimeType);
    if (gcsResult.success) {
      gcsPath = gcsResult.gcsPath;
      gcsBucket = gcsResult.gcsBucket;
      gcsObject = gcsResult.gcsObject;
      gcsGeneration = gcsResult.gcsGeneration;
      gcsHashType = gcsResult.gcsHashType;
      gcsHashValue = gcsResult.gcsHashValue;
      gcsRetentionStatus = gcsResult.retentionStatus;
      if (gcsResult.retentionStatus === "unconfirmed") {
        processingErrors.push("GCS retention policy not confirmed for archive object");
        partialFailure = true;
      }
    } else {
      console.warn(`GCS upload warning: ${gcsResult.error}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown GCS error";
    console.warn(`GCS upload warning: ${errorMessage}`);
  }

  // Step 6: Save to Supabase - ALWAYS save, even on partial failure
  let documentId: string | undefined;
  try {
    const saveResult = await saveDocument({
      fileName,
      fileHash,
      mimeType,
      gcsPath,
      gcsBucket,
      gcsObject,
      gcsGeneration,
      gcsHashType,
      gcsHashValue,
      gcsRetentionStatus,
      ocrConfidence,
      rawText,
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

  // Step 6b: Persist OCR layout (non-blocking on failure)
  if (documentId && layout) {
    try {
      const layoutResult = await upsertDocumentLayout({
        documentId,
        layout,
      });
      if (!layoutResult.success) {
        processingErrors.push(`Layout save failed: ${layoutResult.error}`);
        partialFailure = true;
        console.warn(`Layout save warning: ${layoutResult.error}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown layout error";
      processingErrors.push(`Layout save failed: ${errorMessage}`);
      partialFailure = true;
      console.warn(`Layout save warning: ${errorMessage}`);
    }
  }

  // Step 7: Generate embedding for semantic search (only if we have text)
  if (!options.skipEmbedding && documentId && rawText) {
    try {
      const embeddingResult = await generateAndStoreEmbedding(documentId, {
        document_type: documentType,
        raw_text: rawText,
        extraction,
      });
      if (embeddingResult.success) {
        console.log(`  Embedding generated (${embeddingResult.processingTimeMs}ms)`);
      } else {
        console.warn(`Embedding warning: ${embeddingResult.error}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown embedding error";
      console.warn(`Embedding warning: ${errorMessage}`);
    }
  }

  // Determine final status
  let finalStatus: "success" | "partial_success" | "ocr_failed" | "extraction_failed" | "duplicate";
  if (!rawText) {
    finalStatus = "ocr_failed";
  } else if (extractionFailed) {
    finalStatus = "extraction_failed";
  } else if (partialFailure) {
    finalStatus = "partial_success";
  } else {
    finalStatus = "success";
  }

  return {
    fileName,
    fileHash,
    processedAt,
    ocrConfidence,
    rawText,
    documentType,
    classificationConfidence,
    extraction,
    gcsPath,
    gcsBucket,
    gcsObject,
    gcsGeneration,
    gcsHashType,
    gcsHashValue,
    gcsRetentionStatus,
    documentId,
    syncStatus,
    reviewFlags,
    status: finalStatus,
    error: processingErrors.length > 0 ? processingErrors.join("; ") : undefined,
  };
}
