import { NextRequest, NextResponse } from "next/server";
import { rejectDocument } from "@/lib/workflow/approve-document";
import { getDocumentById } from "@/lib/supabase/documents";
import { verifyAuth } from "@/lib/auth/api-middleware";
import { getSupabase } from "@/lib/supabase/client";

/**
 * POST /api/documents/[id]/reject
 *
 * Reject a document (won't be synced to QuickBooks).
 *
 * Body: { reason?: string, reviewedBy?: string }
 *
 * Returns: { success: true, data: updatedDocument }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated) {
      return authResult.response!;
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Document ID is required" },
        { status: 400 }
      );
    }

    // Parse request body
    let body: { reason?: string; reviewedBy?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK
    }

    const { reason, reviewedBy } = body;

    // Reject the document
    const result = await rejectDocument(id, {
      reason: reason || "Rejected via API",
      reviewedBy: reviewedBy || "api",
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Fetch updated document
    const updatedDocument = await getDocumentById(id);

    // Fetch latest audit log entry id
    const supabase = getSupabase();
    const { data: auditRow } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("document_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: updatedDocument,
      last_audit_id: auditRow?.id ?? null,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
