import { getSupabase } from "./client";
import type {
  DocumentRecord,
  SaveDocumentResult,
  SaveDocumentInput,
  DocumentStatus,
} from "./types";
import type { SyncStatus } from "../workflow/review-flags";
import type { DocumentExtraction } from "../gemini/extract-document";
import { getEditableFieldsForExtraction } from "../workflow/field-evidence";
import type { InvoiceExtraction } from "../gemini/types";
import {
  buildSyncSnapshotFromInvoice,
  withSyncSnapshotInOverrides,
} from "../workflow/sync-snapshot";

function buildExtractionAuditSummary(extraction: DocumentExtraction): Record<string, unknown> {
  const data = extraction.data as Record<string, unknown>;
  const fields = getEditableFieldsForExtraction(extraction);
  const summaryFields: Record<string, unknown> = {};

  for (const field of fields) {
    summaryFields[field] = field in data ? data[field] : null;
  }

  return {
    type: extraction.type,
    confidence: typeof data.confidence === "number" ? data.confidence : null,
    fields: summaryFields,
  };
}

/**
 * Save a processed document to Supabase
 * - Checks if file_hash already exists (returns existing if so)
 * - Inserts into documents table
 * - Creates audit_log entry with action 'created'
 */
export async function saveDocument(
  doc: SaveDocumentInput
): Promise<SaveDocumentResult> {
  const supabase = getSupabase();

  try {
    // Check if document with this hash already exists
    const { data: existing, error: fetchError } = await supabase
      .from("documents")
      .select("id")
      .eq("file_hash", doc.fileHash)
      .single<{ id: string }>();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 = no rows found, which is expected for new documents
      return {
        success: false,
        error: `Failed to check existing document: ${fetchError.message}`,
      };
    }

    if (existing) {
      return {
        success: true,
        documentId: existing.id,
        alreadyExists: true,
      };
    }

    // Insert new document
    const autoSnapshot =
      doc.syncStatus === "auto_approved" &&
      (doc.extraction.type === "invoice" || doc.extraction.type === "other")
        ? buildSyncSnapshotFromInvoice(doc.extraction.data as InvoiceExtraction, "auto_approved")
        : null;

    const { data: inserted, error: insertError } = await supabase
      .from("documents")
      .insert({
        file_name: doc.fileName,
        file_hash: doc.fileHash,
        mime_type: doc.mimeType,
        gcs_path: doc.gcsPath || null,
        gcs_bucket: doc.gcsBucket || null,
        gcs_object: doc.gcsObject || null,
        gcs_generation: doc.gcsGeneration || null,
        gcs_hash_type: doc.gcsHashType || null,
        gcs_hash_value: doc.gcsHashValue || null,
        gcs_retention_status: doc.gcsRetentionStatus || null,
        ocr_confidence: doc.ocrConfidence,
        raw_text: doc.rawText,
        document_type: doc.documentType || "other",
        classification_confidence: doc.classificationConfidence || 0,
        extraction: doc.extraction as unknown as Record<string, unknown>,
        extraction_confidence: doc.extraction.data.confidence,
        status: "draft",
        // Sync workflow fields
        sync_status: doc.syncStatus || "not_applicable",
        confidence_score: doc.confidenceScore ?? doc.extraction.data.confidence,
        review_flags: doc.reviewFlags || [],
        human_overrides: autoSnapshot
          ? withSyncSnapshotInOverrides(null, autoSnapshot)
          : null,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError) {
      // Handle unique constraint violation (race condition)
      if (insertError.code === "23505") {
        const { data: raceExisting } = await supabase
          .from("documents")
          .select("id")
          .eq("file_hash", doc.fileHash)
          .single<{ id: string }>();

        if (raceExisting) {
          return {
            success: true,
            documentId: raceExisting.id,
            alreadyExists: true,
          };
        }
      }

      return {
        success: false,
        error: `Failed to insert document: ${insertError.message}`,
      };
    }

    // Create audit log entry
    const { error: auditError } = await supabase.from("audit_logs").insert({
      document_id: inserted.id,
      actor: "system",
      action: "created",
      after_data: {
        file_name: doc.fileName,
        file_hash: doc.fileHash,
        extraction_summary: buildExtractionAuditSummary(doc.extraction),
      } as unknown as Record<string, unknown>,
      notes: "Document processed via pipeline",
    });

    if (auditError) {
      console.warn(`Failed to create audit log: ${auditError.message}`);
      // Don't fail the whole operation for audit log failure
    }

    // Log auto-approval decision for auditability
    if (doc.syncStatus === "auto_approved") {
      const { error: autoAuditError } = await supabase.from("audit_logs").insert({
        document_id: inserted.id,
        actor: "system",
        action: "modified",
        after_data: {
          sync_status: "auto_approved",
          confidence_score: doc.confidenceScore ?? doc.extraction.data.confidence,
        } as unknown as Record<string, unknown>,
        notes: "Auto-approved based on high confidence",
      });

      if (autoAuditError) {
        console.warn(`Failed to create auto-approval audit log: ${autoAuditError.message}`);
      }
    }

    return {
      success: true,
      documentId: inserted.id,
      alreadyExists: false,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get a document by its file hash
 */
export async function getDocumentByHash(
  fileHash: string
): Promise<DocumentRecord | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("file_hash", fileHash)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    throw new Error(`Failed to fetch document: ${error.message}`);
  }

  return data as DocumentRecord;
}

/**
 * Get all documents with a specific status
 */
export async function getDocumentsByStatus(
  status: DocumentStatus
): Promise<DocumentRecord[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return (data || []) as DocumentRecord[];
}

/**
 * Get audit logs for a document
 */
export async function getAuditLogs(
  documentId: string
): Promise<Array<{ id: string; action: string; actor: string; created_at: string; notes: string | null }>> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, actor, created_at, notes")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  return data || [];
}

/**
 * Update a document with Google Drive file info after moving/renaming
 */
export async function updateDocumentDriveInfo(
  documentId: string,
  driveFileId: string,
  renamedFileName: string
): Promise<boolean> {
  const supabase = getSupabase();

  try {
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        drive_file_id: driveFileId,
        file_name: renamedFileName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateError) {
      console.warn(`Failed to update document drive info: ${updateError.message}`);
      return false;
    }

    // Create audit log entry for the update
    const { error: auditError } = await supabase.from("audit_logs").insert({
      document_id: documentId,
      actor: "system",
      action: "modified",
      after_data: {
        drive_file_id: driveFileId,
        file_name: renamedFileName,
      } as unknown as Record<string, unknown>,
      notes: "File moved to Processed folder and renamed",
    });

    if (auditError) {
      console.warn(`Failed to create audit log: ${auditError.message}`);
    }

    return true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.warn(`Failed to update document drive info: ${errorMessage}`);
    return false;
  }
}

/**
 * Get documents by sync status
 */
export async function getDocumentsBySyncStatus(
  syncStatus: SyncStatus
): Promise<DocumentRecord[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("sync_status", syncStatus)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return (data || []) as DocumentRecord[];
}

/**
 * Get documents needing review (pending_review + needs_attention)
 */
export async function getDocumentsNeedingReview(): Promise<DocumentRecord[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .in("sync_status", ["pending_review", "needs_attention"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return (data || []) as DocumentRecord[];
}

/**
 * Get documents ready to sync (approved + auto_approved)
 */
export async function getReadyToSync(): Promise<DocumentRecord[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .in("sync_status", ["approved", "auto_approved"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return (data || []) as DocumentRecord[];
}

/**
 * Get document by ID
 */
export async function getDocumentById(
  documentId: string
): Promise<DocumentRecord | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null; // Not found
    }
    throw new Error(`Failed to fetch document: ${error.message}`);
  }

  return data as DocumentRecord;
}

/**
 * Get sync status summary (counts by status)
 */
export async function getSyncStatusSummary(): Promise<Record<SyncStatus, number>> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("sync_status");

  if (error) {
    throw new Error(`Failed to fetch sync status summary: ${error.message}`);
  }

  const summary: Record<string, number> = {
    not_applicable: 0,
    auto_approved: 0,
    pending_review: 0,
    needs_attention: 0,
    approved: 0,
    rejected: 0,
    synced: 0,
    error: 0,
  };

  for (const doc of data || []) {
    const status = doc.sync_status as SyncStatus;
    if (status in summary) {
      summary[status]++;
    }
  }

  return summary as Record<SyncStatus, number>;
}
