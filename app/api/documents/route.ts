import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";
import type { SyncStatus } from "@/lib/workflow/review-flags";
import type { DocumentType } from "@/lib/gemini/document-types";

/**
 * GET /api/documents
 *
 * Query documents with optional filters.
 *
 * Query params:
 * - status: SyncStatus filter (e.g., 'pending_review', 'auto_approved')
 * - type: DocumentType filter (e.g., 'invoice', 'receipt')
 * - limit: Max results (default 50, max 100)
 * - offset: Pagination offset (default 0)
 *
 * Returns: { success: true, data: { documents: [], total: number } }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") as SyncStatus | null;
    const type = searchParams.get("type") as DocumentType | null;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const supabase = getSupabase();

    // Build query
    let query = supabase
      .from("documents")
      .select("*", { count: "exact" });

    // Apply filters
    if (status) {
      query = query.eq("sync_status", status);
    }
    if (type) {
      query = query.eq("document_type", type);
    }

    // Apply pagination and ordering
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: documents, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch documents: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        documents: documents || [],
        total: count || 0,
        limit,
        offset,
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
