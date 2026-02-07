import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth/api-middleware";
import { handleAssistantQuery, routeQuerySync } from "@/lib/assistant";
import type { AssistantResponse, AssistantMode, ConversationContext, Intent } from "@/lib/assistant/types";
import { hybridSearchDocuments } from "@/lib/search/semantic-search";
import { buildSearchHighlight } from "@/lib/search/highlight";
import { getDocumentLayout } from "@/lib/supabase/document-layouts";
import { collapseDuplicateSearchResults } from "@/lib/search/deduplicate";

type ChatSource = {
  id: string;
  fileName: string;
  documentType: string | null;
  score?: number;
  similarity?: number;
  extraction?: Record<string, unknown>;
  duplicateCount?: number;
  highlight?: {
    query: string;
    match: string | null;
    quote: string | null;
    page: number | null;
    coords: {
      x: number;
      y: number;
      w: number;
      h: number;
    } | null;
  };
};

type AssistantChatRequest = {
  message?: string;
  context?: ConversationContext;
  mode?: AssistantMode;
};

function inferIntent(response: AssistantResponse, fallback: Intent): Intent {
  const pendingIntent = response.context.pendingClarification?.originalIntent;
  if (pendingIntent) return pendingIntent;
  if (response.sumResult) return "sum";
  if (response.ragResult) return "rag";
  if (response.qaResult || response.candidates) return "single_qa";
  return fallback;
}

function buildSourcesFromAssistant(response: AssistantResponse): ChatSource[] {
  if (response.ragResult?.documentsUsed?.length) {
    return response.ragResult.documentsUsed.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      documentType: doc.documentType,
      score: doc.relevanceScore,
    }));
  }

  if (response.qaResult?.documentUsed) {
    return [
      {
        id: response.qaResult.documentUsed.id,
        fileName: response.qaResult.documentUsed.fileName,
        documentType: response.qaResult.documentUsed.documentType,
      },
    ];
  }

  return [];
}

async function buildSearchSources(query: string): Promise<ChatSource[]> {
  const search = await hybridSearchDocuments(query, {
    limit: 8,
    vectorWeight: 0.7,
    keywordWeight: 0.3,
    minScore: 0.3,
  });

  if (!search.success) return [];

  const enriched = await Promise.all(
    search.results.map(async (result) => {
      let layout;
      if (result.rawText) {
        try {
          layout = (await getDocumentLayout(result.id))?.layout;
        } catch {
          layout = undefined;
        }
      }
      return {
        ...result,
        highlight: buildSearchHighlight(query, result.rawText, layout),
      };
    })
  );

  const canonical = collapseDuplicateSearchResults(enriched);
  return canonical.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    documentType: item.documentType,
    score: item.score,
    extraction: item.extraction,
    duplicateCount: item.duplicateCount,
    highlight: item.highlight,
  }));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await verifyAuth(request);
  if (!authResult.authenticated) {
    return authResult.response!;
  }

  let body: AssistantChatRequest;
  try {
    body = (await request.json()) as AssistantChatRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json(
      { success: false, error: "Field 'message' is required." },
      { status: 400 }
    );
  }

  const mode: AssistantMode = body.mode === "lawyer" ? "lawyer" : "owner";
  const routing = routeQuerySync(message);

  try {
    const assistant = await handleAssistantQuery(message, body.context, undefined, { mode });
    const intent = inferIntent(assistant, routing.intent);
    const sources =
      intent === "search"
        ? await buildSearchSources(message)
        : buildSourcesFromAssistant(assistant);

    return NextResponse.json({
      success: true,
      data: {
        type: assistant.type,
        intent,
        message: assistant.message,
        sources,
        context: assistant.context,
        auditRequestId: assistant.auditRequestId || null,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Assistant request failed.";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
