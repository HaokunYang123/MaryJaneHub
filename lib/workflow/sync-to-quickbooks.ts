import { getSupabase } from "../supabase/client";
import {
  findOrCreateVendor,
  createBill,
  getExpenseAccounts,
  findPotentialDuplicateBill,
  getBill,
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
import { evaluatePreSyncChecklist } from "./pre-sync-checklist";
import {
  applySyncSnapshotToInvoice,
  buildSyncSnapshotFromInvoice,
  readSyncSnapshotFromOverrides,
  withSyncSnapshotInOverrides,
} from "./sync-snapshot";

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
  findPotentialDuplicateBill: typeof findPotentialDuplicateBill;
  getBill: typeof getBill;
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

async function ensureSyncSnapshot(params: {
  supabase: ReturnType<typeof getSupabase>;
  documentId: string;
  syncStatus: string | null | undefined;
  humanOverrides: Record<string, unknown> | null | undefined;
  extraction: InvoiceExtraction;
}): Promise<InvoiceExtraction> {
  const existing = readSyncSnapshotFromOverrides(params.humanOverrides);
  if (existing) {
    return applySyncSnapshotToInvoice(params.extraction, existing);
  }

  const status = params.syncStatus || "";
  if (status !== "approved" && status !== "auto_approved") {
    return params.extraction;
  }

  const snapshot = buildSyncSnapshotFromInvoice(params.extraction, status);
  const merged = withSyncSnapshotInOverrides(params.humanOverrides, snapshot);

  try {
    await params.supabase
      .from("documents")
      .update({
        human_overrides: merged,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.documentId);
  } catch (error) {
    console.warn(`[QB] Failed to persist sync snapshot for ${params.documentId}: ${String(error)}`);
  }

  return applySyncSnapshotToInvoice(params.extraction, snapshot);
}

function normalizeToken(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
}

function amountsMatch(left: number | undefined, right: number | null | undefined): boolean {
  if (typeof left !== "number" || typeof right !== "number") return false;
  const tolerance = Math.max(1, Math.abs(right) * 0.01);
  return Math.abs(left - right) <= tolerance;
}

function reconcileBillAgainstSnapshot(params: {
  bill: { Id?: string; VendorRef: { value: string }; DocNumber?: string; TxnDate?: string; DueDate?: string; TotalAmt?: number };
  expectedVendorId: string;
  snapshot: InvoiceExtraction;
}): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const { bill, expectedVendorId, snapshot } = params;

  if (!bill.Id) {
    mismatches.push("Bill ID is missing");
  }

  if (bill.VendorRef?.value !== expectedVendorId) {
    mismatches.push(`Vendor mismatch (expected ${expectedVendorId}, got ${bill.VendorRef?.value || "missing"})`);
  }

  if (snapshot.invoice_number) {
    const expectedDoc = normalizeToken(snapshot.invoice_number);
    const actualDoc = normalizeToken(bill.DocNumber);
    if (!actualDoc || actualDoc !== expectedDoc) {
      mismatches.push(
        `Doc number mismatch (expected ${snapshot.invoice_number}, got ${bill.DocNumber || "missing"})`
      );
    }
  }

  if (snapshot.invoice_date) {
    const expectedDate = normalizeDate(snapshot.invoice_date);
    const actualDate = normalizeDate(bill.TxnDate);
    if (!expectedDate || !actualDate || expectedDate !== actualDate) {
      mismatches.push(
        `TxnDate mismatch (expected ${snapshot.invoice_date}, got ${bill.TxnDate || "missing"})`
      );
    }
  }

  if (snapshot.due_date) {
    const expectedDueDate = normalizeDate(snapshot.due_date);
    const actualDueDate = normalizeDate(bill.DueDate);
    if (!expectedDueDate || !actualDueDate || expectedDueDate !== actualDueDate) {
      mismatches.push(
        `DueDate mismatch (expected ${snapshot.due_date}, got ${bill.DueDate || "missing"})`
      );
    }
  }

  if (typeof snapshot.total === "number") {
    if (!amountsMatch(bill.TotalAmt, snapshot.total)) {
      mismatches.push(
        `Total mismatch (expected ${snapshot.total.toFixed(2)}, got ${typeof bill.TotalAmt === "number" ? bill.TotalAmt.toFixed(2) : "missing"})`
      );
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
  };
}

async function recordReconciliationFailure(params: {
  supabase: ReturnType<typeof getSupabase>;
  documentId: string;
  billId: string | null;
  vendorId: string | null;
  error: string;
  mismatches: string[];
}): Promise<void> {
  try {
    await params.supabase
      .from("documents")
      .update({
        sync_status: "error",
        sync_error: params.error,
        qb_bill_id: params.billId,
        qb_vendor_id: params.vendorId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.documentId);

    await params.supabase.from("audit_logs").insert({
      document_id: params.documentId,
      actor: "system",
      action: "error",
      after_data: {
        qb_bill_id: params.billId,
        qb_vendor_id: params.vendorId,
        reconciliation_mismatches: params.mismatches,
      },
      notes: params.error,
    });
  } catch (error) {
    console.warn(`[QB] Failed to record reconciliation failure: ${String(error)}`);
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

    const currentInvoiceData = extraction.data as InvoiceExtraction;
    const invoiceData = await ensureSyncSnapshot({
      supabase,
      documentId,
      syncStatus: doc.sync_status,
      humanOverrides: doc.human_overrides as Record<string, unknown> | null | undefined,
      extraction: currentInvoiceData,
    });
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
      const existingBill = await deps.getBill(existingRecord.qb_object_id).catch((error) => {
        throw new Error(`Unable to fetch existing QuickBooks bill for reconciliation: ${String(error)}`);
      });
      const existingRecon = reconcileBillAgainstSnapshot({
        bill: existingBill,
        expectedVendorId: doc.qb_vendor_id || existingBill.VendorRef?.value || "",
        snapshot: invoiceData,
      });
      if (!existingRecon.ok) {
        const errorMessage = `Post-sync reconciliation failed for existing bill ${existingRecord.qb_object_id}: ${existingRecon.mismatches.join("; ")}`;
        await recordReconciliationFailure({
          supabase,
          documentId,
          billId: existingRecord.qb_object_id,
          vendorId: existingBill.VendorRef?.value || null,
          error: errorMessage,
          mismatches: existingRecon.mismatches,
        });
        return {
          success: false,
          documentId,
          newStatus: "error",
          error: errorMessage,
        };
      }

      await updateDocumentSyncInfo({
        supabase,
        documentId,
        billId: existingRecord.qb_object_id,
        vendorId: existingBill.VendorRef?.value || doc.qb_vendor_id || null,
        syncStatus: "synced",
      });

      await recordSyncAudit({
        supabase,
        documentId,
        billId: existingRecord.qb_object_id,
        vendorId: existingBill.VendorRef?.value || doc.qb_vendor_id || null,
        total: invoiceData.total ?? null,
        idempotencyKey,
        syncAction: "deduped",
      });

      return {
        success: true,
        documentId,
        qbBillId: existingRecord.qb_object_id,
        qbVendorId: existingBill.VendorRef?.value || doc.qb_vendor_id || undefined,
        newStatus: "synced",
        deduped: true,
        syncAction: "deduped",
      };
    }

    const checklist = evaluatePreSyncChecklist({
      syncStatus: doc.sync_status,
      reviewFlags: doc.review_flags,
      confidenceScore: doc.confidence_score,
      extraction: invoiceData,
      strictEvidence: true,
    });
    if (!checklist.passed) {
      const failure = `Pre-sync checklist failed: ${checklist.errors.join("; ")}`;
      await updateSyncError(supabase, documentId, failure);
      return {
        success: false,
        documentId,
        newStatus: "error",
        error: failure,
      };
    }
    if (checklist.warnings.length > 0) {
      console.warn(
        `[QB] Pre-sync checklist warnings for ${documentId}: ${checklist.warnings.join("; ")}`
      );
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

    // QuickBooks-side dedupe preflight for cross-system duplicate protection
    const duplicateBill = await deps.findPotentialDuplicateBill({
      vendorId,
      docNumber: invoiceData.invoice_number,
      txnDate: invoiceDate,
      total: invoiceData.total,
    });
    if (duplicateBill?.Id) {
      const duplicateFullBill = await deps.getBill(duplicateBill.Id).catch((error) => {
        throw new Error(`Unable to fetch duplicate candidate bill ${duplicateBill.Id}: ${String(error)}`);
      });
      const duplicateRecon = reconcileBillAgainstSnapshot({
        bill: duplicateFullBill,
        expectedVendorId: vendorId,
        snapshot: invoiceData,
      });
      if (!duplicateRecon.ok) {
        const errorMessage =
          `Duplicate candidate failed reconciliation for bill ${duplicateBill.Id}: ${duplicateRecon.mismatches.join("; ")}`;
        await recordReconciliationFailure({
          supabase,
          documentId,
          billId: duplicateBill.Id,
          vendorId,
          error: errorMessage,
          mismatches: duplicateRecon.mismatches,
        });
        return {
          success: false,
          documentId,
          newStatus: "error",
          error: errorMessage,
        };
      }

      try {
        await insertQbIdempotencyRecord(supabase, {
          document_id: documentId,
          qb_object_type: "bill",
          qb_object_id: duplicateBill.Id,
          idempotency_key: idempotencyKey,
        });
      } catch (error) {
        console.warn(`[QB] Failed to store preflight dedupe idempotency record: ${String(error)}`);
      }

      await updateDocumentSyncInfo({
        supabase,
        documentId,
        billId: duplicateBill.Id,
        vendorId: vendorId || null,
        syncStatus: "synced",
      });

      await recordSyncAudit({
        supabase,
        documentId,
        billId: duplicateBill.Id,
        vendorId: vendorId || null,
        total: duplicateBill.TotalAmt ?? invoiceData.total ?? null,
        idempotencyKey,
        syncAction: "deduped",
      });

      return {
        success: true,
        documentId,
        qbBillId: duplicateBill.Id,
        qbVendorId: vendorId,
        newStatus: "synced",
        deduped: true,
        syncAction: "deduped",
      };
    }

    // Convert to bill and create
    console.log(`[QB] Creating bill for document ${documentId}`);
    const billInput = convertInvoiceToBill(invoiceData, vendorId, resolvedVendorName, accountId);
    const bill = await deps.createBill(billInput);
    if (!bill.Id) {
      await updateSyncError(supabase, documentId, "QuickBooks createBill response missing bill ID");
      return {
        success: false,
        documentId,
        newStatus: "error",
        error: "QuickBooks createBill response missing bill ID",
      };
    }

    let createdBill: Awaited<ReturnType<typeof getBill>>;
    try {
      createdBill = await deps.getBill(bill.Id);
    } catch (error) {
      try {
        await insertQbIdempotencyRecord(supabase, {
          document_id: documentId,
          qb_object_type: "bill",
          qb_object_id: bill.Id,
          idempotency_key: idempotencyKey,
        });
      } catch (recordError) {
        console.warn(`[QB] Failed to record idempotency after reconciliation fetch failure: ${String(recordError)}`);
      }

      const errorMessage = `Failed to fetch created bill ${bill.Id} for reconciliation: ${String(error)}`;
      await recordReconciliationFailure({
        supabase,
        documentId,
        billId: bill.Id,
        vendorId: vendorId || null,
        error: errorMessage,
        mismatches: [errorMessage],
      });
      return {
        success: false,
        documentId,
        newStatus: "error",
        error: errorMessage,
      };
    }

    const createdRecon = reconcileBillAgainstSnapshot({
      bill: createdBill,
      expectedVendorId: vendorId,
      snapshot: invoiceData,
    });
    if (!createdRecon.ok) {
      try {
        await insertQbIdempotencyRecord(supabase, {
          document_id: documentId,
          qb_object_type: "bill",
          qb_object_id: bill.Id,
          idempotency_key: idempotencyKey,
        });
      } catch (recordError) {
        console.warn(`[QB] Failed to record idempotency after reconciliation mismatch: ${String(recordError)}`);
      }

      const errorMessage = `Post-sync reconciliation failed for created bill ${bill.Id}: ${createdRecon.mismatches.join("; ")}`;
      await recordReconciliationFailure({
        supabase,
        documentId,
        billId: bill.Id,
        vendorId: vendorId || null,
        error: errorMessage,
        mismatches: createdRecon.mismatches,
      });
      return {
        success: false,
        documentId,
        newStatus: "error",
        error: errorMessage,
      };
    }

    let record: QbIdempotencyRecord = {
      document_id: documentId,
      qb_object_type: "bill",
      qb_object_id: createdBill.Id || bill.Id,
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
      total: createdBill.TotalAmt ?? bill.TotalAmt ?? invoiceData.total ?? null,
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
    findPotentialDuplicateBill,
    getBill,
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
