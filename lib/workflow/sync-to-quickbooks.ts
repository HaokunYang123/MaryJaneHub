import { getSupabase } from "../supabase/client.js";
import {
  findOrCreateVendor,
  createBill,
  getExpenseAccounts,
} from "../quickbooks/api.js";
import { convertInvoiceToBill, canConvertToBill } from "../quickbooks/invoice-to-bill.js";
import type { InvoiceExtraction } from "../gemini/types.js";
import type { SyncStatus } from "./review-flags.js";

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  documentId: string;
  qbBillId?: string;
  qbVendorId?: string;
  newStatus: SyncStatus;
  error?: string;
}

/**
 * Sync a document to QuickBooks
 *
 * Only syncs documents with status 'approved' or 'auto_approved'.
 * Creates vendor if not exists, then creates bill.
 *
 * @param documentId - The document ID to sync
 * @param expenseAccountId - Optional expense account ID (uses first expense account if not provided)
 * @returns Result of the sync operation
 */
export async function syncDocument(
  documentId: string,
  expenseAccountId?: string
): Promise<SyncResult> {
  const supabase = getSupabase();

  try {
    // Get document
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (fetchError) {
      return {
        success: false,
        documentId,
        newStatus: "error",
        error: `Document not found: ${fetchError.message}`,
      };
    }

    // Check sync status
    if (doc.sync_status !== "approved" && doc.sync_status !== "auto_approved") {
      return {
        success: false,
        documentId,
        newStatus: doc.sync_status as SyncStatus,
        error: `Document cannot be synced (status: ${doc.sync_status}). Must be 'approved' or 'auto_approved'.`,
      };
    }

    // Check document type
    if (doc.document_type !== "invoice" && doc.document_type !== "other") {
      return {
        success: false,
        documentId,
        newStatus: "not_applicable",
        error: `Cannot sync non-invoice document (type: ${doc.document_type})`,
      };
    }

    // Get extraction data
    const extraction = doc.extraction;
    if (!extraction || extraction.type !== "invoice") {
      return {
        success: false,
        documentId,
        newStatus: "error",
        error: "Document has no invoice extraction data",
      };
    }

    const invoiceData = extraction.data as InvoiceExtraction;

    // Validate extraction can be converted
    const validation = canConvertToBill(invoiceData);
    if (!validation.valid) {
      await updateSyncError(supabase, documentId, validation.errors.join("; "));
      return {
        success: false,
        documentId,
        newStatus: "error",
        error: `Invalid extraction: ${validation.errors.join("; ")}`,
      };
    }

    // Get expense account if not provided
    let accountId = expenseAccountId;
    if (!accountId) {
      const accounts = await getExpenseAccounts();
      if (accounts.length === 0) {
        await updateSyncError(supabase, documentId, "No expense accounts found in QuickBooks");
        return {
          success: false,
          documentId,
          newStatus: "error",
          error: "No expense accounts found in QuickBooks",
        };
      }
      accountId = accounts[0].Id;
    }

    // Find or create vendor
    let vendorId = doc.qb_vendor_id;
    let vendorName = invoiceData.vendor || "Unknown Vendor";

    if (!vendorId) {
      console.log(`Finding/creating vendor: ${vendorName}`);
      const vendor = await findOrCreateVendor({ displayName: vendorName });
      vendorId = vendor.Id;
      vendorName = vendor.DisplayName;
    }

    // Convert to bill and create
    console.log(`Creating bill for document ${documentId}`);
    const billInput = convertInvoiceToBill(invoiceData, vendorId, vendorName, accountId);
    const bill = await createBill(billInput);

    // Update document with sync info
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        sync_status: "synced",
        qb_bill_id: bill.Id,
        qb_vendor_id: vendorId,
        synced_at: new Date().toISOString(),
        sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateError) {
      console.warn(`Failed to update document after sync: ${updateError.message}`);
    }

    // Create audit log
    await supabase.from("audit_logs").insert({
      document_id: documentId,
      actor: "system",
      action: "synced",
      after_data: {
        qb_bill_id: bill.Id,
        qb_vendor_id: vendorId,
        total: bill.TotalAmt,
      },
      notes: `Synced to QuickBooks as Bill ${bill.Id}`,
    });

    return {
      success: true,
      documentId,
      qbBillId: bill.Id,
      qbVendorId: vendorId,
      newStatus: "synced",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update document with error
    await updateSyncError(getSupabase(), documentId, errorMessage);

    return {
      success: false,
      documentId,
      newStatus: "error",
      error: errorMessage,
    };
  }
}

/**
 * Sync multiple documents to QuickBooks
 *
 * @param documentIds - Array of document IDs to sync
 * @param expenseAccountId - Optional expense account ID
 * @returns Array of results for each document
 */
export async function syncDocuments(
  documentIds: string[],
  expenseAccountId?: string
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const documentId of documentIds) {
    const result = await syncDocument(documentId, expenseAccountId);
    results.push(result);

    // Small delay between API calls to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
}

/**
 * Sync all approved documents
 *
 * @param expenseAccountId - Optional expense account ID
 * @returns Array of results for each document
 */
export async function syncAllApproved(expenseAccountId?: string): Promise<SyncResult[]> {
  const supabase = getSupabase();

  // Get all approved and auto_approved documents
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id")
    .in("sync_status", ["approved", "auto_approved"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to get approved documents: ${error.message}`);
  }

  if (!docs || docs.length === 0) {
    return [];
  }

  const documentIds = docs.map((d) => d.id);
  return syncDocuments(documentIds, expenseAccountId);
}

/**
 * Helper to update document with sync error
 */
async function updateSyncError(
  supabase: ReturnType<typeof getSupabase>,
  documentId: string,
  error: string
): Promise<void> {
  try {
    await supabase
      .from("documents")
      .update({
        sync_status: "error",
        sync_error: error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  } catch (e) {
    console.warn(`Failed to update sync error: ${e}`);
  }
}
