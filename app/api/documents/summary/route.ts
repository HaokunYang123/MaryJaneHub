import { NextResponse } from "next/server";
import { getSyncStatusSummary } from "../../../../lib/supabase/documents.js";
import { getSupabase } from "../../../../lib/supabase/client.js";

/**
 * GET /api/documents/summary
 *
 * Get document statistics summary.
 *
 * Returns: {
 *   success: true,
 *   data: {
 *     statusCounts: { pending_review: 5, auto_approved: 10, ... },
 *     typeCounts: { invoice: 20, receipt: 5, ... },
 *     total: number
 *   }
 * }
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Get sync status counts
    const statusCounts = await getSyncStatusSummary();

    // Get document type counts
    const supabase = getSupabase();
    const { data: typeDocs, error: typeError } = await supabase
      .from("documents")
      .select("document_type");

    if (typeError) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch type counts: ${typeError.message}` },
        { status: 500 }
      );
    }

    const typeCounts: Record<string, number> = {};
    let total = 0;

    for (const doc of typeDocs || []) {
      const docType = doc.document_type || "other";
      typeCounts[docType] = (typeCounts[docType] || 0) + 1;
      total++;
    }

    // Calculate total from status counts
    const statusTotal = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    return NextResponse.json({
      success: true,
      data: {
        statusCounts,
        typeCounts,
        total: Math.max(total, statusTotal),
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
