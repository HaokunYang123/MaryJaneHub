import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/api-middleware";
import { getAppProperties, mergeAppProperties, setAppProperties } from "@/lib/google-drive/metadata";

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  return value.toLowerCase() === "true";
}

/**
 * GET /api/admin/drive/metadata?fileId=<id>
 *
 * Fetch private appProperties for a Drive file.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return authResult.response!;
  }

  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json(
      { success: false, error: "fileId is required" },
      { status: 400 }
    );
  }

  const result = await getAppProperties(fileId);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: result });
}

/**
 * POST /api/admin/drive/metadata
 *
 * Body:
 * {
 *   "fileId": "...",
 *   "appProperties": { "k": "v" },
 *   "merge": true
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return authResult.response!;
  }

  try {
    const body = await request.json();
    const fileId = typeof body.fileId === "string" ? body.fileId.trim() : "";
    const appProperties =
      body.appProperties && typeof body.appProperties === "object"
        ? (body.appProperties as Record<string, unknown>)
        : null;
    const merge = parseBoolean(body.merge, true);

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: "fileId is required" },
        { status: 400 }
      );
    }
    if (!appProperties) {
      return NextResponse.json(
        { success: false, error: "appProperties object is required" },
        { status: 400 }
      );
    }

    const result = merge
      ? await mergeAppProperties(fileId, appProperties)
      : await setAppProperties(fileId, appProperties);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
