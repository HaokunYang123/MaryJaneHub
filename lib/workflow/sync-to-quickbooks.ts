import { getSupabase } from "../supabase/client";
import {
  findOrCreateVendor,
  createBill,
  getExpenseAccounts,
} from "../quickbooks/api";
import { convertInvoiceToBill, canConvertToBill } from "../quickbooks/invoice-to-bill";
import {
  buildQbIdempotencyKey,
  getQbIdempotencyRecord,
  insertQbIdempotencyRecord,
  type QbIdempotencyRecord,
} from "../quickbooks/idempotency";
import type { InvoiceExtraction } from "../gemini/types";
import type { SyncStatus } from "./review-flags";

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
  deduped?: boolean;
  syncAction?: "created" | "deduped";
}

type SyncDeps = {
  supabase: ReturnType<typeof getSupabase>;
  findOrCreateVendor: typeof findOrCreateVendor;
  createBill: typeof createBill;
  getExpenseAccounts: typeof getExpenseAccounts;
};

async function recordSyncAudit(params: {
  supabase: ReturnType<typeof getSupabase>;
  documentId: string;
  billId: string;
  vendorId: string | null;
  total?: number | null;
  idempotencyKey: string;
  syncAction: "created" | "deduped";
}): Promise<void> {
  await params.supabase.from("audit_logs").insert({
    document_id: params.documentId,
    actor: "system",
    action: "synced",
    after_data: {
      qb_bill_id: params.billId,
      qb_vendor_id: params.vendorId,
      total: params.total ?? null,
      idempotency_key: params.idempotencyKey,
      sync_action: params.syncAction,
    },
    notes:
      params.syncAction === "deduped"
        ? `QuickBooks sync deduped; reused Bill ${params.billId}`
        : `Synced to QuickBooks as Bill ${params.billId}`,
  });
}

async function updateDocumentSyncInfo(params: {
  supabase: ReturnType<typeof getSupabase>;
  documentId: string;
  billId: string;
  vendorId: string | null;
  syncStatus: SyncStatus;
}): Promise<void> {
  const { error: updateError } = await params.supabase
    .from("documents")
    .update({
      sync_status: params.syncStatus,
      qb_bill_id: params.billId,
      qb_vendor_id: params.vendorId,
      synced_at: new Date().toISOString(),
      sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.documentId);

  if (updateError) {
    console.warn(`Failed to update document after sync: ${updateError.message}`);
  }
}

export async function syncDocumentWithDeps(
  documentId: string,
  expenseAccountId: string | undefined,
  deps: SyncDeps
): Promise<SyncResult> {
  const supabase = deps.supabase;

  try {
    // Get document
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (fetchError || !doc) {
      return {
        success: false,
        documentId,
        newStatus: "error",
        error: `Document not found: ${fetchError?.message || "missing document"}`,
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
    if (!extraction || (extraction.type !== "invoice" && extraction.type !== "other")) {
      return {
        success: false,
        documentId,
        newStatus: "error",
        error: "Document has no invoice extraction data",
      };
    }

    const invoiceData = extraction.data as InvoiceExtraction;
    const vendorName = invoiceData.vendor || "Unknown Vendor";
    const invoiceDate = invoiceData.invoice_date || invoiceData.due_date || null;

    const idempotencyKey = buildQbIdempotencyKey({
      documentId,
      qbObjectType: "bill",
      fileHash: doc.file_hash,
      gcsGeneration: doc.gcs_generation,
      gcsHashValue: doc.gcs_hash_value,
      vendor: vendorName,
      total: invoiceData.total ?? null,
      date: invoiceDate,
    });

    const existingRecord = await getQbIdempotencyRecord(supabase, idempotencyKey).catch(() => null);
    if (existingRecord?.qb_object_id) {
      await updateDocumentSyncInfo({
        supabase,
        documentId,
        billId: existingRecord.qb_object_id,
        vendorId: doc.qb_vendor_id || null,
        syncStatus: "synced",
      });

      await recordSyncAudit({
        supabase,
        documentId,
        billId: existingRecord.qb_object_id,
        vendorId: doc.qb_vendor_id || null,
        total: invoiceData.total ?? null,
        idempotencyKey,
        syncAction: "deduped",
      });

      return {
        success: true,
        documentId,
        qbBillId: existingRecord.qb_object_id,
        qbVendorId: doc.qb_vendor_id || undefined,
        newStatus: "synced",
        deduped: true,
        syncAction: "deduped",
      };
    }

    // Check sync status (after idempotency check)
    if (doc.sync_status !== "approved" && doc.sync_status !== "auto_approved") {
      return {
        success: false,
        documentId,
        newStatus: doc.sync_status as SyncStatus,
        error: `Document cannot be synced (status: ${doc.sync_status}). Must be 'approved' or 'auto_approved'.`,
      };
    }

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
      const accounts = await deps.getExpenseAccounts();
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
    let resolvedVendorName = vendorName;

    if (!vendorId) {
      console.log(`[QB] Finding/creating vendor: ${vendorName}`);
      const vendor = await deps.findOrCreateVendor({ displayName: vendorName });
      vendorId = vendor.Id;
      resolvedVendorName = vendor.DisplayName;
    }

    // Convert to bill and create
    console.log(`[QB] Creating bill for document ${documentId}`);
    const billInput = convertInvoiceToBill(invoiceData, vendorId, resolvedVendorName, accountId);
    const bill = await deps.createBill(billInput);

    let record: QbIdempotencyRecord = {
      document_id: documentId,
      qb_object_type: "bill",
      qb_object_id: bill.Id,
      idempotency_key: idempotencyKey,
    };
    let deduped = false;

    try {
      const insertResult = await insertQbIdempotencyRecord(supabase, record);
      deduped = insertResult.deduped;
      if (deduped) {
        const existing = await getQbIdempotencyRecord(supabase, idempotencyKey).catch(() => null);
        if (existing?.qb_object_id) {
          record = existing;
        }
      }
    } catch (error) {
      console.warn(`[QB] Failed to store idempotency record: ${String(error)}`);
    }

    const billIdToUse = record.qb_object_id;

      await updateDocumentSyncInfo({
        supabase,
        documentId,
        billId: billIdToUse,
        vendorId: vendorId || null,
        syncStatus: "synced",
      });

    await recordSyncAudit({
      supabase,
      documentId,
      billId: billIdToUse,
      vendorId: vendorId || null,
      total: bill.TotalAmt,
      idempotencyKey,
      syncAction: deduped ? "deduped" : "created",
    });

    return {
      success: true,
      documentId,
      qbBillId: billIdToUse,
      qbVendorId: vendorId,
      newStatus: "synced",
      deduped,
      syncAction: deduped ? "deduped" : "created",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Update document with error
    await updateSyncError(supabase, documentId, errorMessage);

    return {
      success: false,
      documentId,
      newStatus: "error",
      error: errorMessage,
    };
  }
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
  return syncDocumentWithDeps(documentId, expenseAccountId, {
    supabase: getSupabase(),
    findOrCreateVendor,
    createBill,
    getExpenseAccounts,
  });
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
