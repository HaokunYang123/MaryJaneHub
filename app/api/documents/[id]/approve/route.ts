import { NextRequest, NextResponse } from "next/server";
import { approveDocument } from "@/lib/workflow/approve-document";
import { getDocumentById } from "@/lib/supabase/documents";
import { verifyAuth } from "@/lib/auth/api-middleware";
import { getSupabase } from "@/lib/supabase/client";

/**
 * POST /api/documents/[id]/approve
 *
 * Approve a document for QuickBooks sync.
 *
 * Body: { qbVendorId?: string, reviewedBy?: string, force?: boolean }
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
    let body: { qbVendorId?: string; reviewedBy?: string; force?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK
    }

    const { qbVendorId, reviewedBy, force } = body;

    // Approve the document
    const result = await approveDocument(id, {
      qbVendorId,
      reviewedBy: reviewedBy || "api",
      force,
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
