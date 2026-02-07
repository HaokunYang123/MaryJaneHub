import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { getSupabase } from "@/lib/supabase/client";
import { verifyAuth } from "@/lib/auth/api-middleware";

type PreviewRecord = {
  id: string;
  file_name: string;
  mime_type: string | null;
  gcs_bucket: string | null;
  gcs_object: string | null;
  gcs_generation: string | null;
  gcs_path: string | null;
  drive_file_id: string | null;
};

function parseGcsPath(gcsPath: string | null): { bucket: string | null; object: string | null } {
  if (!gcsPath || !gcsPath.startsWith("gs://")) {
    return { bucket: null, object: null };
  }
  const withoutScheme = gcsPath.slice("gs://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0) {
    return { bucket: null, object: null };
  }
  const bucket = withoutScheme.slice(0, slashIndex);
  const object = withoutScheme.slice(slashIndex + 1);
  if (!bucket || !object) {
    return { bucket: null, object: null };
  }
  return { bucket, object };
}

function fileWithGeneration(
  storage: Storage,
  bucketName: string,
  objectName: string,
  generation?: string | null
) {
  if (!generation) {
    return storage.bucket(bucketName).file(objectName);
  }

  const parsed = Number.parseInt(generation, 10);
  if (!Number.isFinite(parsed)) {
    return storage.bucket(bucketName).file(objectName);
  }

  return storage.bucket(bucketName).file(objectName, { generation: parsed });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const authResult = await verifyAuth(request);
  if (!authResult.authenticated) {
    return authResult.response!;
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Document ID is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { data: record, error } = await supabase
      .from("documents")
      .select("id, file_name, mime_type, gcs_bucket, gcs_object, gcs_generation, gcs_path, drive_file_id")
      .eq("id", id)
      .single();

    if (error || !record) {
      return NextResponse.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      );
    }

    const doc = record as PreviewRecord;
    const parsedPath = parseGcsPath(doc.gcs_path);
    const gcsBucket = doc.gcs_bucket || parsedPath.bucket;
    const gcsObject = doc.gcs_object || parsedPath.object;

    if (gcsBucket && gcsObject) {
      const storage = new Storage();
      const file = fileWithGeneration(storage, gcsBucket, gcsObject, doc.gcs_generation);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      try {
        const [url] = await file.getSignedUrl({
          action: "read",
          expires: expiresAt,
        });

        return NextResponse.json({
          success: true,
          data: {
            source: "gcs",
            fileName: doc.file_name,
            mimeType: doc.mime_type,
            url,
            expiresAt: expiresAt.toISOString(),
          },
        });
      } catch (signError) {
        const message = signError instanceof Error ? signError.message : String(signError);
        console.warn(`Failed to sign GCS preview URL for document ${id}: ${message}`);
      }
    }

    if (doc.drive_file_id) {
      return NextResponse.json({
        success: true,
        data: {
          source: "drive",
          fileName: doc.file_name,
          mimeType: doc.mime_type,
          url: `https://drive.google.com/file/d/${doc.drive_file_id}/preview`,
          expiresAt: null,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "No previewable source found for this document" },
      { status: 404 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
