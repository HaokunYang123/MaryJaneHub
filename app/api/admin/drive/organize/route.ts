import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/api-middleware";
import { moveAndRenameFileWithinManagedRoots } from "@/lib/google-drive/move-file";

/**
 * POST /api/admin/drive/organize
 *
 * Body:
 * {
 *   "fileId": "...",
 *   "newName": "...",
 *   "targetFolderId": "...",
 *   "sourceFolderId": "...",
 *   "dryRun": false
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
    const newName = typeof body.newName === "string" ? body.newName.trim() : "";
    const targetFolderId =
      typeof body.targetFolderId === "string" ? body.targetFolderId.trim() : "";
    const sourceFolderId =
      typeof body.sourceFolderId === "string" ? body.sourceFolderId.trim() : "";
    const dryRun = body.dryRun === true;

    if (!fileId || !newName || !targetFolderId || !sourceFolderId) {
      return NextResponse.json(
        {
          success: false,
          error: "fileId, newName, targetFolderId, and sourceFolderId are required",
        },
        { status: 400 }
      );
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        data: {
          fileId,
          newName,
          targetFolderId,
          sourceFolderId,
        },
      });
    }

    const result = await moveAndRenameFileWithinManagedRoots(
      fileId,
      newName,
      targetFolderId,
      sourceFolderId
    );

    if (!result.success) {
      const status = result.error?.startsWith("Write denied") ? 403 : 500;
      return NextResponse.json(
        { success: false, error: result.error },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
