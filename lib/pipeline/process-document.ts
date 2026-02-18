import { createHash } from "crypto";
import { performance } from "perf_hooks";
import { extractWithDocumentAI } from "../document-ai/ocr";
import { classifyDocument } from "../gemini/classify-document";
import { validateClassification } from "../gemini/validate-classification";
import { extractDocument, type DocumentExtraction } from "../gemini/extract-document";
import { extractKeyFields } from "../gemini/extract-key-fields";
import { uploadToGCS } from "../gcs/upload";
import { saveDocument, getDocumentByHash, updateDocumentGcsInfo } from "../supabase/documents";
import { analyzeDocument, type SyncStatus, type ReviewFlag } from "../workflow/review-flags";
import { ensureFieldEvidence } from "../workflow/field-evidence";
import type { FieldEvidenceMap } from "../gemini/field-evidence";
import { generateAndStoreEmbedding } from "../search/semantic-search";
import type { ProcessedDocument, ProcessingTimings } from "./types";
import type { DocumentType } from "../gemini/document-types";
import { upsertDocumentLayout } from "../supabase/document-layouts";
import type { DocumentLayout } from "../document-ai/types";

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function mergeFallbackData<T extends Record<string, unknown>>(
  base: T,
  fallback: Record<string, unknown>
): T {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(fallback)) {
    if (isEmptyValue(merged[key]) && !isEmptyValue(value)) {
      merged[key] = value;
    }
  }
  return merged as T;
}

function shouldFallback(documentType: DocumentType, extraction: DocumentExtraction): boolean {
  const confidence = extraction.data.confidence ?? 0;
  const data = extraction.data as Record<string, unknown>;

  const missing = (...fields: string[]) => fields.some((field) => isEmptyValue(data[field]));

  switch (documentType) {
    case "invoice":
    case "other":
      return confidence < 0.6 || missing("vendor", "invoice_date", "total");
    case "receipt":
      return confidence < 0.6 || missing("merchant_name", "date", "total");
    case "bank_statement":
      return confidence < 0.6 || missing("bank_name", "statement_period_end");
    case "contract":
      return confidence < 0.5 || missing("parties", "effective_date");
    case "tax_form":
      return confidence < 0.6 || missing("form_type", "tax_year");
    case "correspondence":
      return confidence < 0.6 || missing("sender", "subject", "date");
    default:
      return confidence < 0.6;
  }
}

function normalizeGcsHashType(value: string | null | undefined): "md5" | "crc32c" | undefined {
  if (value === "md5" || value === "crc32c") return value;
  return undefined;
}

function normalizeGcsRetentionStatus(
  value: string | null | undefined
): "confirmed" | "unconfirmed" | undefined {
  if (value === "confirmed" || value === "unconfirmed") return value;
  return undefined;
}

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
  const timings: ProcessingTimings = {};
  const totalStart = performance.now();
  const fileHash = generateFileHash(fileBuffer);
  const processedAt = new Date().toISOString();

  // Track errors for recording
  const processingErrors: string[] = [];
  let partialFailure = false;
  let ocrErrorCode: string | undefined;
  let ocrErrorMessage: string | undefined;

  // Step 0: Check for duplicate (by file hash)
  if (!options.skipDuplicateCheck) {
    const duplicateStart = performance.now();
    try {
      const existingDoc = await getDocumentByHash(fileHash);
      timings.duplicateCheckMs = performance.now() - duplicateStart;
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
          gcsHashType: normalizeGcsHashType(existingDoc.gcs_hash_type),
          gcsHashValue: existingDoc.gcs_hash_value || undefined,
          gcsRetentionStatus: normalizeGcsRetentionStatus(existingDoc.gcs_retention_status),
          status: "duplicate",
          timings: {
            ...timings,
            totalMs: performance.now() - totalStart,
          },
        };
      }
    } catch (err) {
      // Non-blocking: if duplicate check fails, continue processing
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.warn(`  Duplicate check warning: ${errorMessage}`);
      timings.duplicateCheckMs = performance.now() - duplicateStart;
    }
  }

  // Step 1: OCR with Document AI
  const ocrStart = performance.now();
  const ocrResult = await extractWithDocumentAI(fileBuffer, mimeType);
  timings.ocrMs = performance.now() - ocrStart;
  let rawText = "";
  let ocrConfidence = 0;
  let layout: DocumentLayout | undefined;

  if (!ocrResult.success) {
    const ocrError = `OCR failed: ${ocrResult.error.code} - ${ocrResult.error.message}`;
    processingErrors.push(ocrError);
    console.warn(`  ${ocrError}`);
    partialFailure = true;
    ocrErrorCode = ocrResult.error.code;
    ocrErrorMessage = ocrResult.error.message;
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
      const classifyStart = performance.now();
      const classification = await classifyDocument(rawText);
      timings.classificationMs = performance.now() - classifyStart;
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
      if (timings.classificationMs === undefined) {
        timings.classificationMs = 0;
      }
    }
  }

  // Step 3: Extract structured data with Gemini (only if we have text)
  let extraction: DocumentExtraction = createEmptyExtraction(documentType);
  let extractionFailed = false;

  if (rawText) {
    const extractionStart = performance.now();
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
      timings.extractionMs = performance.now() - extractionStart;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown extraction error";
      processingErrors.push(`Extraction failed: ${errorMessage}`);
      console.warn(`  Extraction failed: ${errorMessage}`);
      extractionFailed = true;
      partialFailure = true;
      // Keep empty extraction - we'll still save
      timings.extractionMs = performance.now() - extractionStart;
    }
  } else {
    extractionFailed = true;
    partialFailure = true;
  }

  // Step 3b: Key-field fallback for low-confidence or missing essentials
  if (rawText && shouldFallback(documentType, extraction)) {
    try {
      const fallbackStart = performance.now();
      const fallback = await extractKeyFields(documentType, rawText);
      const currentData = extraction.data as Record<string, unknown>;
      const mergedData = mergeFallbackData(currentData, fallback.data);
      extraction.data = mergedData as typeof extraction.data;
      const currentConfidence = typeof extraction.data.confidence === "number" ? extraction.data.confidence : 0;
      if (fallback.confidence > currentConfidence) {
        extraction.data.confidence = fallback.confidence;
      }
      timings.extractionMs = (timings.extractionMs ?? 0) + (performance.now() - fallbackStart);
      if (extractionFailed && extraction.data.confidence > 0) {
        extractionFailed = false;
      }
    } catch (fallbackError) {
      const message = fallbackError instanceof Error ? fallbackError.message : "Unknown fallback error";
      processingErrors.push(`Key-field fallback failed: ${message}`);
      console.warn(`  Key-field fallback warning: ${message}`);
    }
  }

  // Attach per-field evidence to extraction (value + confidence + evidence)
  try {
    const evidenceStart = performance.now();
    const existingEvidence = (extraction.data as Record<string, unknown>)
      ?.field_evidence as FieldEvidenceMap | undefined;
    extraction.data.field_evidence = ensureFieldEvidence(
      extraction,
      rawText || "",
      existingEvidence,
      layout
    );
    timings.evidenceMs = performance.now() - evidenceStart;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown evidence error";
    console.warn(`  Field evidence warning: ${errorMessage}`);
    if (timings.evidenceMs === undefined) {
      timings.evidenceMs = 0;
    }
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
    const analysisStart = performance.now();
    const analysis = analyzeDocument(extraction);
    timings.analysisMs = performance.now() - analysisStart;
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
  // Step 5: Save to Supabase FIRST (without GCS path) to prevent orphaned GCS objects.
  // If DB write fails, we skip the GCS upload entirely — no orphan possible.
  // If DB write succeeds but GCS upload later fails, the document record exists
  // without a GCS path (recoverable via re-upload) rather than a stranded GCS file.
  let documentId: string | undefined;
  try {
    const saveStart = performance.now();
    const saveResult = await saveDocument({
      fileName,
      fileHash,
      mimeType,
      gcsPath: undefined,
      gcsBucket: undefined,
      gcsObject: undefined,
      gcsGeneration: undefined,
      gcsHashType: undefined,
      gcsHashValue: undefined,
      gcsRetentionStatus: undefined,
      ocrConfidence,
      rawText,
      extraction,
      documentType,
      classificationConfidence,
      syncStatus,
      confidenceScore,
      reviewFlags,
    });
    timings.saveMs = performance.now() - saveStart;
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

  // Step 6: Upload to GCS — only attempted after DB record is committed.
  // On success, patch the document record with storage coordinates.
  let gcsBucket: string | undefined;
  let gcsObject: string | undefined;
  let gcsGeneration: string | undefined;
  let gcsHashType: "md5" | "crc32c" | undefined;
  let gcsHashValue: string | undefined;
  let gcsRetentionStatus: "confirmed" | "unconfirmed" | undefined;
  if (documentId) {
    try {
      const uploadStart = performance.now();
      const gcsResult = await uploadToGCS(fileBuffer, fileName, fileHash, mimeType);
      timings.uploadMs = performance.now() - uploadStart;
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
        // Patch DB record with storage coordinates
        const gcsUpdateResult = await updateDocumentGcsInfo(documentId, {
          gcsPath: gcsResult.gcsPath,
          gcsBucket: gcsResult.gcsBucket,
          gcsObject: gcsResult.gcsObject,
          gcsGeneration: gcsResult.gcsGeneration,
          gcsHashType: gcsResult.gcsHashType,
          gcsHashValue: gcsResult.gcsHashValue,
          gcsRetentionStatus: gcsResult.retentionStatus,
        });
        if (!gcsUpdateResult.success) {
          console.warn(`GCS info update warning: ${gcsUpdateResult.error}`);
        }
      } else {
        console.warn(`GCS upload warning: ${gcsResult.error}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown GCS error";
      console.warn(`GCS upload warning: ${errorMessage}`);
    }
  }

  // Step 6b: Persist OCR layout (non-blocking on failure)
  if (documentId && layout) {
    try {
      const layoutStart = performance.now();
      const layoutResult = await upsertDocumentLayout({
        documentId,
        layout,
      });
      timings.layoutMs = performance.now() - layoutStart;
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
      const embeddingStart = performance.now();
      const embeddingResult = await generateAndStoreEmbedding(documentId, {
        document_type: documentType,
        raw_text: rawText,
        extraction,
      });
      timings.embeddingMs = performance.now() - embeddingStart;
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
    ocrErrorCode,
    ocrErrorMessage,
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
    timings: {
      ...timings,
      totalMs: performance.now() - totalStart,
    },
  };
}
