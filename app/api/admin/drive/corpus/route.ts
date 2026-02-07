import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/api-middleware";
import { listCorpusFiles } from "@/lib/google-drive/list-corpus";

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === "true";
}

function parseIntBounded(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/**
 * GET /api/admin/drive/corpus
 *
 * Preview indexable files across user drive + shared drives.
 * Admin only.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return authResult.response!;
  }

  const params = request.nextUrl.searchParams;
  const maxFiles = parseIntBounded(params.get("limit"), 500, 1, 5000);
  const onlySupportedTypes = parseBoolean(params.get("onlySupportedTypes"), false);
  const includeFolders = parseBoolean(params.get("includeFolders"), false);

  try {
    const result = await listCorpusFiles({
      maxFiles,
      onlySupportedTypes,
      includeFolders,
    });

    return NextResponse.json({
      success: true,
      data: result,
      options: {
        maxFiles,
        onlySupportedTypes,
        includeFolders,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
