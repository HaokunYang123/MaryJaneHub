import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";
import { requireAdminAccessForRequest, type AdminAccessResult } from "@/lib/auth/admin-access";

export interface EvidenceAuditRow {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  notes: string | null;
  after_data: Record<string, unknown> | null;
}

export interface EvidenceCitation {
  document_id: string;
  page?: number;
  start_offset?: number;
  end_offset?: number;
  verified?: boolean;
  score?: number;
}

export interface EvidenceDocumentRef {
  document_id: string;
  filename?: string;
  gcs_path?: string;
  sha256?: string;
  gcs_bucket?: string;
  gcs_object?: string;
  gcs_generation?: string;
  gcs_hash_type?: string;
  gcs_hash_value?: string;
  gcs_retention_status?: string;
}

export interface EvidencePacket {
  request_id: string;
  audit: EvidenceAuditRow;
  citations: EvidenceCitation[];
  documents: EvidenceDocumentRef[];
  generated_at: string;
}

export type EvidenceAuditFetcher = (
  requestId: string
) => Promise<EvidenceAuditRow | null>;

export type EvidenceCitationsFetcher = (
  audit: EvidenceAuditRow
) => Promise<EvidenceCitation[]>;

export type EvidenceDocumentsFetcher = (
  documentIds: string[]
) => Promise<EvidenceDocumentRef[]>;

export type AdminAccessFn = (request: NextRequest) => Promise<AdminAccessResult>;

const DENYLIST_KEY_PATTERN = /(ocr|full_text|raw|chunk|content|document_text)/i;

function scrubSensitiveValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitiveValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (DENYLIST_KEY_PATTERN.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = scrubSensitiveValue(entry);
  }

  return result;
}

function scrubEvidencePacket(packet: EvidencePacket): EvidencePacket {
  return scrubSensitiveValue(packet) as EvidencePacket;
}

function extractCitationsFromAudit(audit: EvidenceAuditRow): EvidenceCitation[] {
  const afterData = audit.after_data as Record<string, unknown> | null;
  if (!afterData || !Array.isArray(afterData.citations)) return [];

  return (afterData.citations as Array<Record<string, unknown>>)
    .map((citation) => {
      const documentId = citation.document_id ?? citation.documentId ?? citation.doc_id;
      if (!documentId) return null;
      return {
        document_id: String(documentId),
        page: typeof citation.page === "number" ? citation.page : undefined,
        start_offset: typeof citation.start_offset === "number" ? citation.start_offset : undefined,
        end_offset: typeof citation.end_offset === "number" ? citation.end_offset : undefined,
        verified: typeof citation.verified === "boolean" ? citation.verified : undefined,
        score: typeof citation.score === "number" ? citation.score : undefined,
      } as EvidenceCitation;
    })
    .filter(Boolean) as EvidenceCitation[];
}

function extractRetrievalDocIds(audit: EvidenceAuditRow): string[] {
  const afterData = audit.after_data as Record<string, unknown> | null;
  const retrieval = afterData?.retrieval as Record<string, unknown> | undefined;
  if (!retrieval || !Array.isArray(retrieval.document_ids)) return [];
  return (retrieval.document_ids as unknown[]).map((id) => String(id));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseGcsPath(gcsPath: string | null | undefined): {
  bucket?: string;
  object?: string;
} {
  if (!gcsPath || !gcsPath.startsWith("gs://")) return {};
  const withoutScheme = gcsPath.slice(5);
  const [bucket, ...rest] = withoutScheme.split("/");
  if (!bucket) return {};
  return {
    bucket,
    object: rest.join("/") || undefined,
  };
}

export async function fetchEvidenceAuditRow(
  requestId: string
): Promise<EvidenceAuditRow | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, created_at, actor, action, notes, after_data")
    .eq("id", requestId)
    .eq("action", "assistant_query")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch audit log: ${error.message}`);
  }

  if (!data) return null;
  return data as EvidenceAuditRow;
}

export async function fetchEvidenceDocuments(
  documentIds: string[]
): Promise<EvidenceDocumentRef[]> {
  if (documentIds.length === 0) return [];
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, file_name, gcs_path, file_hash, gcs_bucket, gcs_object, gcs_generation, gcs_hash_type, gcs_hash_value, gcs_retention_status"
    )
    .in("id", documentIds);

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  const rows = (data || []) as Array<{
    id: string;
    file_name: string | null;
    gcs_path: string | null;
    file_hash: string | null;
    gcs_bucket: string | null;
    gcs_object: string | null;
    gcs_generation: string | null;
    gcs_hash_type: string | null;
    gcs_hash_value: string | null;
    gcs_retention_status: string | null;
  }>;

  const docsById = new Map(
    rows.map((row) => {
      const gcsParsed = parseGcsPath(row.gcs_path);
      const doc: EvidenceDocumentRef = {
        document_id: row.id,
        filename: row.file_name || undefined,
        gcs_path: row.gcs_path || undefined,
        sha256: row.file_hash || undefined,
        gcs_bucket: row.gcs_bucket || gcsParsed.bucket,
        gcs_object: row.gcs_object || gcsParsed.object,
        gcs_generation: row.gcs_generation || undefined,
        gcs_hash_type: row.gcs_hash_type || undefined,
        gcs_hash_value: row.gcs_hash_value || undefined,
        gcs_retention_status: row.gcs_retention_status || undefined,
      };
      return [row.id, doc];
    })
  );

  return documentIds.map((id) => docsById.get(id) || { document_id: id });
}

export function createEvidencePacketHandler(deps: {
  fetchAuditRow?: EvidenceAuditFetcher;
  fetchCitations?: EvidenceCitationsFetcher;
  fetchDocuments?: EvidenceDocumentsFetcher;
  requireAdminAccess?: AdminAccessFn;
} = {}) {
  const fetchAuditRow = deps.fetchAuditRow ?? fetchEvidenceAuditRow;
  const fetchCitations = deps.fetchCitations ?? (async (audit) => extractCitationsFromAudit(audit));
  const fetchDocuments = deps.fetchDocuments ?? fetchEvidenceDocuments;
  const requireAdminFn = deps.requireAdminAccess ?? requireAdminAccessForRequest;

  return async function handleEvidencePacket(
    request: NextRequest
  ): Promise<NextResponse> {
    const authResult = await requireAdminFn(request);
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.status === 401 ? "Unauthorized" : "Forbidden", message: authResult.message },
        { status: authResult.status }
      );
    }

    const requestId = request.nextUrl.searchParams.get("request_id")?.trim();
    if (!requestId) {
      return NextResponse.json(
        { error: "Validation error", message: "request_id is required" },
        { status: 400 }
      );
    }

    try {
      const audit = await fetchAuditRow(requestId);
      if (!audit || audit.action !== "assistant_query") {
        return NextResponse.json(
          { error: "Not found", message: "assistant_query audit not found" },
          { status: 404 }
        );
      }

      const citations = await fetchCitations(audit);
      const retrievalDocIds = extractRetrievalDocIds(audit);
      const citationDocIds = citations.map((c) => c.document_id);
      const documentIds = uniqueStrings([...citationDocIds, ...retrievalDocIds]);
      const documents = await fetchDocuments(documentIds);

      const packet: EvidencePacket = {
        request_id: requestId,
        audit: {
          id: audit.id,
          created_at: audit.created_at,
          actor: audit.actor,
          action: audit.action,
          notes: audit.notes,
          after_data: audit.after_data,
        },
        citations,
        documents,
        generated_at: new Date().toISOString(),
      };

      const sanitized = scrubEvidencePacket(packet);
      return NextResponse.json(sanitized);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json(
        { error: "Failed to build evidence packet", message },
        { status: 500 }
      );
    }
  };
}
