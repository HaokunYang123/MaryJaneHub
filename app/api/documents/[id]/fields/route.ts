import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";
import { verifyAuth } from "@/lib/auth/api-middleware";
import {
  ensureFieldEvidence,
  getEditableFieldsForExtraction,
} from "@/lib/workflow/field-evidence";
import type { EvidenceLocation, FieldEvidenceMap } from "@/lib/gemini/field-evidence";
import type { DocumentExtraction } from "@/lib/gemini/extract-document";
import { getDocumentLayout } from "@/lib/supabase/document-layouts";

type EvidenceInput = Partial<EvidenceLocation> & {
  coords?: EvidenceLocation["coords"];
};

type UpdateBody = {
  updates: Record<string, unknown>;
  reason: string;
  reviewedBy?: string;
  evidence?: Record<string, EvidenceInput | null>;
};

function normalizeEvidence(input?: EvidenceInput | null): EvidenceLocation {
  return {
    page: typeof input?.page === "number" ? input.page : null,
    quote: typeof input?.quote === "string" ? input.quote : null,
    coords: input?.coords ?? null,
  };
}

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

  const supabase = getSupabase();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, extraction, raw_text")
    .eq("id", id)
    .single();

  if (error || !doc) {
    return NextResponse.json(
      { success: false, error: "Document not found" },
      { status: 404 }
    );
  }

  const extraction = doc.extraction as DocumentExtraction;
  const data = extraction.data as Record<string, unknown>;
  const existingEvidence = data.field_evidence as FieldEvidenceMap | undefined;
  const layoutRecord = await getDocumentLayout(id).catch(() => null);
  const ensured = ensureFieldEvidence(
    extraction,
    doc.raw_text || "",
    existingEvidence,
    layoutRecord?.layout
  );

  if (stableStringify(existingEvidence ?? {}) !== stableStringify(ensured ?? {})) {
    data.field_evidence = ensured;
    extraction.data = data as DocumentExtraction["data"];
    await supabase
      .from("documents")
      .update({ extraction, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  return NextResponse.json({
    success: true,
    data: {
      document_id: doc.id,
      fields: ensured,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body?.updates || Object.keys(body.updates).length === 0) {
    return NextResponse.json(
      { success: false, error: "updates are required" },
      { status: 400 }
    );
  }

  if (!body.reason || body.reason.trim().length < 3) {
    return NextResponse.json(
      { success: false, error: "reason is required (min 3 chars)" },
      { status: 400 }
    );
  }

  const reviewedBy = body.reviewedBy || authResult.user?.email || "unknown";

  const supabase = getSupabase();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, extraction, raw_text")
    .eq("id", id)
    .single();

  if (error || !doc) {
    return NextResponse.json(
      { success: false, error: "Document not found" },
      { status: 404 }
    );
  }

  const extraction = doc.extraction as DocumentExtraction;
  const editableFields = getEditableFieldsForExtraction(extraction);
  const invalidFields = Object.keys(body.updates).filter(
    (field) => !editableFields.includes(field)
  );

  if (invalidFields.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid fields: ${invalidFields.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const data = extraction.data as Record<string, unknown>;
  const beforeData: Record<string, unknown> = {};
  const afterData: Record<string, unknown> = {};

  const layoutRecord = await getDocumentLayout(id).catch(() => null);
  const baselineEvidence = ensureFieldEvidence(
    extraction,
    doc.raw_text || "",
    data.field_evidence as FieldEvidenceMap | undefined,
    layoutRecord?.layout
  );
  const fieldEvidence: FieldEvidenceMap = { ...baselineEvidence };

  for (const [field, value] of Object.entries(body.updates)) {
    beforeData[field] = data[field];
    data[field] = value;
    const evidenceInput = body.evidence?.[field] ?? null;
    fieldEvidence[field] = {
      value,
      confidence: 1,
      evidence: normalizeEvidence(evidenceInput),
    };
    afterData[field] = value;
  }

  data.field_evidence = fieldEvidence;
  extraction.data = data as DocumentExtraction["data"];

  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("documents")
    .update({
      extraction,
      reviewed_at: now,
      reviewed_by: reviewedBy,
      updated_at: now,
    })
    .eq("id", id)
    .select("id, extraction, reviewed_at, reviewed_by, updated_at")
    .single();

  if (updateError) {
    return NextResponse.json(
      { success: false, error: `Update failed: ${updateError.message}` },
      { status: 500 }
    );
  }

  await supabase.from("audit_logs").insert({
    document_id: id,
    actor: reviewedBy,
    action: "modified",
    before_data: beforeData,
    after_data: {
      updates: afterData,
      evidence: Object.fromEntries(
        Object.entries(fieldEvidence).filter(([key]) => key in afterData)
      ),
    },
    notes: `Field edit: ${body.reason}`,
  });

  return NextResponse.json({
    success: true,
    data: updated,
  });
}
