import { getSupabase } from "../supabase/client";
import type { SyncStatus } from "./review-flags";

/**
 * Result of an approval operation
 */
export interface ApprovalResult {
  success: boolean;
  documentId: string;
  newStatus?: SyncStatus;
  error?: string;
}

/**
 * Options for approving a document
 */
export interface ApproveOptions {
  /** QuickBooks vendor ID to use for sync */
  qbVendorId?: string;
  /** User performing the review */
  reviewedBy?: string;
  /** Override to force approval even with flags */
  force?: boolean;
}

/**
 * Options for rejecting a document
 */
export interface RejectOptions {
  /** Reason for rejection */
  reason: string;
  /** User performing the rejection */
  reviewedBy?: string;
}

/**
 * Approve a document for QuickBooks sync
 *
 * @param documentId - The document ID to approve
 * @param options - Approval options
 * @returns Result of the approval operation
 */
export async function approveDocument(
  documentId: string,
  options: ApproveOptions = {}
): Promise<ApprovalResult> {
  const supabase = getSupabase();
  const { qbVendorId, reviewedBy = "system", force = false } = options;

  try {
    // First, get the current document status
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("sync_status, review_flags, document_type")
      .eq("id", documentId)
      .single();

    if (fetchError) {
      return {
        success: false,
        documentId,
        error: `Document not found: ${fetchError.message}`,
      };
    }

    // Check if document is an invoice
    if (doc.document_type !== "invoice" && doc.document_type !== "other") {
      return {
        success: false,
        documentId,
        error: `Cannot approve non-invoice document (type: ${doc.document_type})`,
      };
    }

    // Check if already synced
    if (doc.sync_status === "synced") {
      return {
        success: false,
        documentId,
        error: "Document is already synced to QuickBooks",
      };
    }

    // Check for review flags (unless force is true)
    const flags = doc.review_flags || [];
    if (flags.length > 0 && !force) {
      return {
        success: false,
        documentId,
        error: `Document has review flags: ${flags.join(", ")}. Use force=true to override.`,
      };
    }

    // Update document status
    const updateData: Record<string, unknown> = {
      sync_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
      updated_at: new Date().toISOString(),
    };

    if (qbVendorId) {
      updateData.qb_vendor_id = qbVendorId;
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update(updateData)
      .eq("id", documentId);

    if (updateError) {
      return {
        success: false,
        documentId,
        error: `Failed to update document: ${updateError.message}`,
      };
    }

    // Create audit log entry
    await supabase.from("audit_logs").insert({
      document_id: documentId,
      actor: reviewedBy,
      action: "approved",
      after_data: { sync_status: "approved", qb_vendor_id: qbVendorId },
      notes: force ? "Approved with force override" : "Approved for sync",
    });

    return {
      success: true,
      documentId,
      newStatus: "approved",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      documentId,
      error: errorMessage,
    };
  }
}

/**
 * Reject a document (won't be synced to QuickBooks)
 *
 * @param documentId - The document ID to reject
 * @param options - Rejection options
 * @returns Result of the rejection operation
 */
export async function rejectDocument(
  documentId: string,
  options: RejectOptions
): Promise<ApprovalResult> {
  const supabase = getSupabase();
  const { reason, reviewedBy = "system" } = options;

  try {
    // Get current document
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("sync_status")
      .eq("id", documentId)
      .single();

    if (fetchError) {
      return {
        success: false,
        documentId,
        error: `Document not found: ${fetchError.message}`,
      };
    }

    // Check if already synced
    if (doc.sync_status === "synced") {
      return {
        success: false,
        documentId,
        error: "Cannot reject a document that is already synced",
      };
    }

    // Update document status
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        sync_status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
        sync_error: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateError) {
      return {
        success: false,
        documentId,
        error: `Failed to update document: ${updateError.message}`,
      };
    }

    // Create audit log entry
    await supabase.from("audit_logs").insert({
      document_id: documentId,
      actor: reviewedBy,
      action: "modified",
      after_data: { sync_status: "rejected", reason },
      notes: `Rejected: ${reason}`,
    });

    return {
      success: true,
      documentId,
      newStatus: "rejected",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      documentId,
      error: errorMessage,
    };
  }
}

/**
 * Bulk approve multiple documents (typically auto_approved ones)
 *
 * @param documentIds - Array of document IDs to approve
 * @param reviewedBy - User performing the approval
 * @returns Array of results for each document
 */
export async function bulkApprove(
  documentIds: string[],
  reviewedBy: string = "system"
): Promise<ApprovalResult[]> {
  const results: ApprovalResult[] = [];

  for (const documentId of documentIds) {
    const result = await approveDocument(documentId, { reviewedBy });
    results.push(result);
  }

  return results;
}

/**
 * Confirm auto-approved documents for sync
 * Only approves documents that are currently in 'auto_approved' status
 *
 * @param documentIds - Array of document IDs to confirm
 * @param reviewedBy - User performing the confirmation
 * @returns Array of results for each document
 */
export async function confirmAutoApproved(
  documentIds: string[],
  reviewedBy: string = "system"
): Promise<ApprovalResult[]> {
  const supabase = getSupabase();
  const results: ApprovalResult[] = [];

  for (const documentId of documentIds) {
    try {
      // Check current status
      const { data: doc, error: fetchError } = await supabase
        .from("documents")
        .select("sync_status")
        .eq("id", documentId)
        .single();

      if (fetchError) {
        results.push({
          success: false,
          documentId,
          error: `Document not found: ${fetchError.message}`,
        });
        continue;
      }

      if (doc.sync_status !== "auto_approved") {
        results.push({
          success: false,
          documentId,
          error: `Document is not auto_approved (status: ${doc.sync_status})`,
        });
        continue;
      }

      // Approve the document
      const result = await approveDocument(documentId, { reviewedBy });
      results.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      results.push({
        success: false,
        documentId,
        error: errorMessage,
      });
    }
  }

  return results;
}
