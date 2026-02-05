import { getSupabase } from "./client";
import type { DocumentLayout } from "../document-ai/types";
import type { DocumentLayoutRecord } from "./types";

const DEFAULT_LAYOUT_VERSION = 1;

export async function upsertDocumentLayout(params: {
  documentId: string;
  layout: DocumentLayout;
  layoutVersion?: number;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const layoutVersion = params.layoutVersion ?? DEFAULT_LAYOUT_VERSION;

  try {
    const { error } = await supabase
      .from("document_layouts")
      .upsert(
        {
          document_id: params.documentId,
          layout: params.layout,
          pages: params.layout.pages.length,
          layout_version: layoutVersion,
          updated_at: now,
        },
        {
          onConflict: "document_id",
        }
      );

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function getDocumentLayout(
  documentId: string
): Promise<DocumentLayoutRecord | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("document_layouts")
    .select("*")
    .eq("document_id", documentId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to fetch document layout: ${error.message}`);
  }

  return data as DocumentLayoutRecord;
}
