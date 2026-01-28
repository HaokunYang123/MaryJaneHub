import { getSupabase } from "./client.js";
import type {
  DocumentRecord,
  SaveDocumentResult,
  SaveDocumentInput,
  DocumentStatus,
} from "./types.js";

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
    const { data: inserted, error: insertError } = await supabase
      .from("documents")
      .insert({
        file_name: doc.fileName,
        file_hash: doc.fileHash,
        mime_type: doc.mimeType,
        gcs_path: doc.gcsPath || null,
        ocr_confidence: doc.ocrConfidence,
        raw_text: doc.rawText,
        extraction: doc.extraction as unknown as Record<string, unknown>,
        extraction_confidence: doc.extraction.confidence,
        status: "draft",
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
        extraction: doc.extraction,
      } as unknown as Record<string, unknown>,
      notes: "Document processed via pipeline",
    });

    if (auditError) {
      console.warn(`Failed to create audit log: ${auditError.message}`);
      // Don't fail the whole operation for audit log failure
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
