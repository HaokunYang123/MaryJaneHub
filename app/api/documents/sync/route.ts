import { NextRequest, NextResponse } from "next/server";
import { syncDocument } from "@/lib/workflow/sync-to-quickbooks";
import { getDocumentById } from "@/lib/supabase/documents";
import { convertInvoiceToBill, canConvertToBill } from "@/lib/quickbooks/invoice-to-bill";
import type { InvoiceExtraction } from "@/lib/gemini/types";
import { requireRole } from "@/lib/auth/api-middleware";
import { evaluatePreSyncChecklist, type PreSyncChecklistResult } from "@/lib/workflow/pre-sync-checklist";
import {
  applySyncSnapshotToInvoice,
  readSyncSnapshotFromOverrides,
} from "@/lib/workflow/sync-snapshot";

/**
 * POST /api/documents/sync
 *
 * Sync approved documents to QuickBooks.
 *
 * Body: {
 *   documentIds: string[],
 *   expenseAccountId?: string,
 *   dryRun?: boolean
 * }
 *
 * Returns: {
 *   success: true,
 *   data: {
 *     synced: Array<{ documentId, qbBillId, qbVendorId }>,
 *     errors: Array<{ documentId, error }>
 *   }
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireRole(request, "user");
    if (!authResult.authenticated) {
      return authResult.response!;
    }

    // Parse request body
    let body: {
      documentIds?: string[];
      expenseAccountId?: string;
      dryRun?: boolean;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { documentIds, expenseAccountId, dryRun = false } = body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "documentIds array is required" },
        { status: 400 }
      );
    }

    if (documentIds.length > 50) {
      return NextResponse.json(
        { success: false, error: "Maximum 50 documents per sync request" },
        { status: 400 }
      );
    }

    const synced: Array<{
      documentId: string;
      qbBillId?: string;
      qbVendorId?: string;
      dryRun?: boolean;
      billData?: object;
      checklist?: PreSyncChecklistResult;
    }> = [];
    const errors: Array<{ documentId: string; error: string }> = [];

    for (const documentId of documentIds) {
      try {
        if (dryRun) {
          // Dry run: validate and show what would be created
          const doc = await getDocumentById(documentId);

          if (!doc) {
            errors.push({ documentId, error: "Document not found" });
            continue;
          }

          if (doc.sync_status !== "approved" && doc.sync_status !== "auto_approved") {
            errors.push({
              documentId,
              error: `Document not approved (status: ${doc.sync_status})`,
            });
            continue;
          }

          if (doc.extraction.type !== "invoice" && doc.extraction.type !== "other") {
            errors.push({
              documentId,
              error: `Not an invoice document (type: ${doc.extraction.type})`,
            });
            continue;
          }

          const invoiceDataRaw = doc.extraction.data as InvoiceExtraction;
          const snapshot = readSyncSnapshotFromOverrides(
            doc.human_overrides as Record<string, unknown> | null | undefined
          );
          const invoiceData = snapshot
            ? applySyncSnapshotToInvoice(invoiceDataRaw, snapshot)
            : invoiceDataRaw;
          const checklist = evaluatePreSyncChecklist({
            syncStatus: doc.sync_status,
            reviewFlags: doc.review_flags,
            confidenceScore: doc.confidence_score,
            extraction: invoiceData,
            strictEvidence: true,
          });

          if (!checklist.passed) {
            errors.push({
              documentId,
              error: `Pre-sync checklist failed: ${checklist.errors.join(", ")}`,
            });
            continue;
          }

          const validation = canConvertToBill(invoiceData);

          if (!validation.valid) {
            errors.push({
              documentId,
              error: `Validation failed: ${validation.errors.join(", ")}`,
            });
            continue;
          }

          // Generate bill data for dry run
          const billData = convertInvoiceToBill(
            invoiceData,
            "dry-run-vendor-id",
            invoiceData.vendor || "Unknown Vendor",
            expenseAccountId || "dry-run-account-id"
          );

          synced.push({
            documentId,
            dryRun: true,
            billData,
            checklist,
          });
        } else {
          // Actual sync
          const result = await syncDocument(documentId, expenseAccountId);

          if (result.success) {
            synced.push({
              documentId,
              qbBillId: result.qbBillId,
              qbVendorId: result.qbVendorId,
            });
          } else {
            errors.push({
              documentId,
              error: result.error || "Sync failed",
            });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push({ documentId, error: errorMessage });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        synced,
        errors,
        dryRun,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
