import { NextRequest, NextResponse } from "next/server";
import { searchDocuments, hybridSearchDocuments } from "@/lib/search/semantic-search";
import type { DocumentType } from "@/lib/gemini/document-types";
import { verifyAuth } from "@/lib/auth/api-middleware";
import { buildSearchHighlight, type SearchHighlight } from "@/lib/search/highlight";
import { getDocumentLayout } from "@/lib/supabase/document-layouts";

/**
 * GET /api/documents/search
 *
 * Search documents using vector similarity or hybrid (vector + keyword) search.
 *
 * Query params:
 * - q: Search query (required)
 * - mode: Search mode - "hybrid" or "vector" (default: "hybrid")
 * - limit: Max results (default: 10, max: 50)
 * - type: Filter by document type (optional)
 * - includeHighlight: Include highlight snippet (default: false)
 * - includeLocation: Include page/coords for highlight (default: false, implies includeHighlight)
 *
 * Vector mode only:
 * - threshold: Similarity threshold 0-1 (default: 0.7)
 *
 * Hybrid mode only:
 * - vectorWeight: Weight for vector similarity 0-1 (default: 0.7)
 * - keywordWeight: Weight for keyword matching 0-1 (default: 0.3)
 * - minScore: Minimum combined score 0-1 (default: 0.3)
 *
 * Returns: {
 *   success: true,
 *   data: {
 *     mode: "hybrid" | "vector",
 *     results: Array<{ id, fileName, documentType, score/similarity, ... }>,
 *     query: string,
 *     options: { ... },
 *     processingTimeMs: number
 *   }
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await verifyAuth(request);
  if (!authResult.authenticated) {
    return authResult.response!;
  }

  const searchParams = request.nextUrl.searchParams;

  // Get query parameter
  const query = searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }
  const searchQuery = query;

  // Parse mode (default: hybrid)
  const mode = searchParams.get("mode") || "hybrid";
  if (mode !== "hybrid" && mode !== "vector") {
    return NextResponse.json(
      { success: false, error: "Invalid 'mode' parameter. Must be 'hybrid' or 'vector'" },
      { status: 400 }
    );
  }

  // Parse limit
  const limitParam = searchParams.get("limit");
  let limit = 10;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (isNaN(parsed) || parsed < 1) {
      return NextResponse.json(
        { success: false, error: "Invalid 'limit' parameter" },
        { status: 400 }
      );
    }
    limit = Math.min(parsed, 50); // Cap at 50
  }

  // Parse document type filter
  const typeParam = searchParams.get("type") as DocumentType | null;
  const validTypes = ["invoice", "receipt", "bank_statement", "contract", "tax_form", "correspondence", "other"];
  if (typeParam && !validTypes.includes(typeParam)) {
    return NextResponse.json(
      { success: false, error: `Invalid 'type' parameter. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  const includeHighlightParam = searchParams.get("includeHighlight");
  const includeLocationParam = searchParams.get("includeLocation");
  const includeLocation = includeLocationParam === "true";
  const includeHighlight = includeLocation || includeHighlightParam === "true";

  async function enrichResults<T extends { id: string; rawText: string | null }>(
    results: T[]
  ): Promise<Array<T & { highlight: SearchHighlight }>> {
    if (!includeHighlight) return results as Array<T & { highlight: SearchHighlight }>;

    return Promise.all(
      results.map(async (result) => {
        let layout;
        if (includeLocation && result.rawText) {
          try {
            layout = (await getDocumentLayout(result.id))?.layout;
          } catch {
            layout = undefined;
          }
        }
        const highlight = buildSearchHighlight(searchQuery, result.rawText, layout);
        return { ...result, highlight };
      })
    );
  }

  try {
    if (mode === "hybrid") {
      // Parse hybrid-specific params
      const vectorWeightParam = searchParams.get("vectorWeight");
      let vectorWeight = 0.7;
      if (vectorWeightParam) {
        const parsed = parseFloat(vectorWeightParam);
        if (isNaN(parsed) || parsed < 0 || parsed > 1) {
          return NextResponse.json(
            { success: false, error: "Invalid 'vectorWeight' parameter (must be 0-1)" },
            { status: 400 }
          );
        }
        vectorWeight = parsed;
      }

      const keywordWeightParam = searchParams.get("keywordWeight");
      let keywordWeight = 0.3;
      if (keywordWeightParam) {
        const parsed = parseFloat(keywordWeightParam);
        if (isNaN(parsed) || parsed < 0 || parsed > 1) {
          return NextResponse.json(
            { success: false, error: "Invalid 'keywordWeight' parameter (must be 0-1)" },
            { status: 400 }
          );
        }
        keywordWeight = parsed;
      }

      const minScoreParam = searchParams.get("minScore");
      let minScore = 0.3;
      if (minScoreParam) {
        const parsed = parseFloat(minScoreParam);
        if (isNaN(parsed) || parsed < 0 || parsed > 1) {
          return NextResponse.json(
            { success: false, error: "Invalid 'minScore' parameter (must be 0-1)" },
            { status: 400 }
          );
        }
        minScore = parsed;
      }

      const result = await hybridSearchDocuments(searchQuery, {
        limit,
        vectorWeight,
        keywordWeight,
        minScore,
        documentType: typeParam || undefined,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 500 }
        );
      }

      const results = await enrichResults(result.results);

      return NextResponse.json({
        success: true,
        data: {
          mode: "hybrid",
          results,
          query: result.query,
          options: result.options,
          processingTimeMs: result.processingTimeMs,
        },
      });
    } else {
      // Vector-only mode
      const thresholdParam = searchParams.get("threshold");
      let threshold = 0.7;
      if (thresholdParam) {
        const parsed = parseFloat(thresholdParam);
        if (isNaN(parsed) || parsed < 0 || parsed > 1) {
          return NextResponse.json(
            { success: false, error: "Invalid 'threshold' parameter (must be 0-1)" },
            { status: 400 }
          );
        }
        threshold = parsed;
      }

      const result = await searchDocuments(searchQuery, {
        limit,
        threshold,
        documentType: typeParam || undefined,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 500 }
        );
      }

      const results = await enrichResults(result.results);

      return NextResponse.json({
        success: true,
        data: {
          mode: "vector",
          results,
          query: result.query,
          options: result.options,
          processingTimeMs: result.processingTimeMs,
        },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
