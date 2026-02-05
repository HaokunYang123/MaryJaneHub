import { NextRequest, NextResponse } from "next/server";
import { getDocumentById } from "@/lib/supabase/documents";
import { getSupabase } from "@/lib/supabase/client";
import { ensureFieldEvidence } from "@/lib/workflow/field-evidence";
import type { FieldEvidenceMap } from "@/lib/gemini/field-evidence";
import type { DocumentExtraction } from "@/lib/gemini/extract-document";
import { verifyAuth } from "@/lib/auth/api-middleware";
import { getDocumentLayout } from "@/lib/supabase/document-layouts";

function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object") {
      if (seen.has(val)) return val;
      seen.add(val);
      if (!Array.isArray(val)) {
        return Object.keys(val)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (val as Record<string, unknown>)[key];
            return acc;
          }, {});
      }
    }
    return val;
  });
}

/**
 * GET /api/documents/[id]
 *
 * Get a single document by ID with full extraction data.
 *
 * Returns: { success: true, data: document }
 * 404 if not found
 */
export async function GET(
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

    const document = await getDocumentById(id);

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      );
    }

    const extraction = document.extraction as DocumentExtraction;
    const data = extraction?.data as Record<string, unknown> | undefined;
    if (document.raw_text && data) {
      try {
        const existingEvidence = data.field_evidence as FieldEvidenceMap | undefined;
        const layoutRecord = await getDocumentLayout(document.id).catch(() => null);
        const ensured = ensureFieldEvidence(
          extraction,
          document.raw_text,
          existingEvidence,
          layoutRecord?.layout
        );
        const existingStable = stableStringify(existingEvidence ?? {});
        const nextStable = stableStringify(ensured ?? {});
        if (existingStable !== nextStable) {
          data.field_evidence = ensured;
          extraction.data = data as DocumentExtraction["data"];
          document.extraction = extraction;
          const supabase = getSupabase();
          await supabase
            .from("documents")
            .update({ extraction, updated_at: new Date().toISOString() })
            .eq("id", document.id);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown evidence update error";
        console.warn(`Failed to backfill field evidence: ${errorMessage}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: document,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
