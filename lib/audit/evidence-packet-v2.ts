import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { PDFDocument } from "pdf-lib";
import { requireAdminAccessForRequest, type AdminAccessResult } from "@/lib/auth/admin-access";
import {
  fetchEvidenceAuditRow,
  fetchEvidenceDocuments,
  type EvidenceAuditRow,
  type EvidenceCitation,
  type EvidenceDocumentRef,
} from "@/lib/audit/evidence-packet";

export interface EvidenceArtifact {
  document_id: string;
  page: number;
  artifact_type: "pdf";
  artifact_url: string;
  generated_at: string;
  expires_at: string;
}

export interface EvidencePacketV2 {
  request_id: string;
  audit: EvidenceAuditRow;
  citations: EvidenceCitation[];
  documents: EvidenceDocumentRef[];
  evidence: EvidenceArtifact[];
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

export type EvidenceStorage = {
  fetchPdf: (params: {
    bucket: string;
    object: string;
    generation?: string;
  }) => Promise<Uint8Array>;
  checkArtifact: (params: {
    bucket: string;
    object: string;
  }) => Promise<{ exists: boolean; createdAt?: string; generation?: string }>;
  saveArtifact: (params: {
    bucket: string;
    object: string;
    contentType: string;
    data: Uint8Array;
  }) => Promise<{ createdAt?: string; generation?: string }>;
  signArtifactUrl: (params: {
    bucket: string;
    object: string;
    generation?: string;
    expiresAt: Date;
  }) => Promise<string>;
};

export type PageArtifactGenerator = (params: {
  pdfBytes: Uint8Array;
  pageIndex: number;
}) => Promise<Uint8Array>;

const DENYLIST_KEY_PATTERN = /(ocr|full_text|raw|chunk|content|document_text)/i;
const DEFAULT_SIGNED_URL_TTL_MINUTES = 30;
const ARTIFACT_CONTENT_TYPE = "application/pdf";

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

function scrubEvidencePacket(packet: EvidencePacketV2): EvidencePacketV2 {
  return scrubSensitiveValue(packet) as EvidencePacketV2;
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

function resolveArchiveLocation(document: EvidenceDocumentRef): {
  bucket?: string;
  object?: string;
  generation?: string;
} {
  const bucket = document.gcs_bucket;
  const object = document.gcs_object;
  if (bucket && object) {
    return { bucket, object, generation: document.gcs_generation };
  }
  const parsed = parseGcsPath(document.gcs_path);
  return {
    bucket: parsed.bucket,
    object: parsed.object,
    generation: document.gcs_generation,
  };
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildEvidenceObjectName(params: {
  documentId: string;
  page: number;
  generation?: string | null;
  extension?: string;
}): string {
  const safeDoc = sanitizePathPart(params.documentId);
  const safeGen = sanitizePathPart(params.generation ?? "unknown");
  const safePage = Math.trunc(params.page);
  const extension = params.extension ?? "pdf";
  return `evidence/${safeDoc}/gen_${safeGen}/page_${safePage}.${extension}`;
}

function getEvidenceBucketName(): string | null {
  const bucketName = process.env.EVIDENCE_BUCKET?.trim();
  if (!bucketName) return null;
  return bucketName;
}

function resolveEvidenceUrlTtlSeconds(): number {
  const raw = process.env.EVIDENCE_URL_TTL_SECONDS;
  if (!raw) return DEFAULT_SIGNED_URL_TTL_MINUTES * 60;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SIGNED_URL_TTL_MINUTES * 60;
  }
  return parsed;
}

function fileWithGeneration(
  storage: Storage,
  bucketName: string,
  objectName: string,
  generation?: string
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

function createDefaultEvidenceStorage(): EvidenceStorage {
  const storage = new Storage();

  return {
    async fetchPdf({ bucket, object, generation }) {
      const file = fileWithGeneration(storage, bucket, object, generation);
      const [buffer] = await file.download();
      return buffer;
    },
    async checkArtifact({ bucket, object }) {
      const file = storage.bucket(bucket).file(object);
      const [exists] = await file.exists();
      if (!exists) return { exists: false };
      const [metadata] = await file.getMetadata();
      return {
        exists: true,
        createdAt: metadata.timeCreated,
        generation: metadata.generation ? String(metadata.generation) : undefined,
      };
    },
    async saveArtifact({ bucket, object, contentType, data }) {
      const file = storage.bucket(bucket).file(object);
      try {
        await file.save(data, {
          contentType,
          resumable: false,
          preconditionOpts: { ifGenerationMatch: 0 },
        });
      } catch (error) {
        const errorCode = (error as { code?: number })?.code;
        const errorReason = (error as { errors?: Array<{ reason?: string }> })?.errors?.[0]?.reason;
        if (errorCode !== 412 && errorReason !== "conditionNotMet") {
          throw error;
        }
      }
      const [metadata] = await file.getMetadata();
      return {
        createdAt: metadata.timeCreated,
        generation: metadata.generation ? String(metadata.generation) : undefined,
      };
    },
    async signArtifactUrl({ bucket, object, generation, expiresAt }) {
      const file = fileWithGeneration(storage, bucket, object, generation);
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: expiresAt,
      });
      return url;
    },
  };
}

async function generatePagePdfArtifact(params: {
  pdfBytes: Uint8Array;
  pageIndex: number;
}): Promise<Uint8Array> {
  const source = await PDFDocument.load(params.pdfBytes);
  const pageCount = source.getPageCount();
  if (params.pageIndex < 0 || params.pageIndex >= pageCount) {
    throw new Error(`Page index ${params.pageIndex} out of range`);
  }
  const output = await PDFDocument.create();
  const [page] = await output.copyPages(source, [params.pageIndex]);
  output.addPage(page);
  return output.save();
}

function normalizePageNumber(page: number): number | null {
  if (!Number.isFinite(page)) return null;
  const asInt = Math.trunc(page);
  if (asInt < 1) return null;
  return asInt;
}

async function buildEvidenceArtifacts(params: {
  citations: EvidenceCitation[];
  documents: EvidenceDocumentRef[];
  evidenceBucket: string;
  storage: EvidenceStorage;
  pageGenerator: PageArtifactGenerator;
  expiresAt: Date;
  now: () => Date;
}): Promise<EvidenceArtifact[]> {
  const docsById = new Map(params.documents.map((doc) => [doc.document_id, doc]));
  const seen = new Set<string>();
  const results: EvidenceArtifact[] = [];

  for (const citation of params.citations) {
    const pageNumber = citation.page;
    if (!citation.document_id || typeof pageNumber !== "number") continue;
    const normalizedPage = normalizePageNumber(pageNumber);
    if (normalizedPage === null) continue;

    const key = `${citation.document_id}:${normalizedPage}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const doc = docsById.get(citation.document_id);
    if (!doc) continue;

    const archive = resolveArchiveLocation(doc);
    if (!archive.bucket || !archive.object) continue;

    const objectName = buildEvidenceObjectName({
      documentId: citation.document_id,
      page: normalizedPage,
      generation: archive.generation,
      extension: "pdf",
    });

    let generatedAt = params.now().toISOString();
    let evidenceGeneration: string | undefined;
    const existing = await params.storage.checkArtifact({
      bucket: params.evidenceBucket,
      object: objectName,
    });
    if (existing.exists) {
      generatedAt = existing.createdAt ?? generatedAt;
      evidenceGeneration = existing.generation;
    } else {
      const pdfBytes = await params.storage.fetchPdf({
        bucket: archive.bucket,
        object: archive.object,
        generation: archive.generation,
      });
      const artifactBytes = await params.pageGenerator({
        pdfBytes,
        pageIndex: normalizedPage - 1,
      });
      const saved = await params.storage.saveArtifact({
        bucket: params.evidenceBucket,
        object: objectName,
        contentType: ARTIFACT_CONTENT_TYPE,
        data: artifactBytes,
      });
      generatedAt = saved.createdAt ?? generatedAt;
      evidenceGeneration = saved.generation;
    }

    const artifactUrl = await params.storage.signArtifactUrl({
      bucket: params.evidenceBucket,
      object: objectName,
      generation: evidenceGeneration,
      expiresAt: params.expiresAt,
    });

    results.push({
      document_id: citation.document_id,
      page: normalizedPage,
      artifact_type: "pdf",
      artifact_url: artifactUrl,
      generated_at: generatedAt,
      expires_at: params.expiresAt.toISOString(),
    });
  }

  return results;
}

export function createEvidencePacketV2Handler(deps: {
  fetchAuditRow?: EvidenceAuditFetcher;
  fetchCitations?: EvidenceCitationsFetcher;
  fetchDocuments?: EvidenceDocumentsFetcher;
  requireAdminAccess?: AdminAccessFn;
  storage?: EvidenceStorage;
  pageGenerator?: PageArtifactGenerator;
  now?: () => Date;
  signedUrlTtlSeconds?: number;
} = {}) {
  const fetchAuditRow = deps.fetchAuditRow ?? fetchEvidenceAuditRow;
  const fetchCitations = deps.fetchCitations ?? (async (audit) => extractCitationsFromAudit(audit));
  const fetchDocuments = deps.fetchDocuments ?? fetchEvidenceDocuments;
  const requireAdminFn = deps.requireAdminAccess ?? requireAdminAccessForRequest;
  const storage = deps.storage ?? createDefaultEvidenceStorage();
  const pageGenerator = deps.pageGenerator ?? generatePagePdfArtifact;
  const now = deps.now ?? (() => new Date());
  const signedUrlTtlSeconds = deps.signedUrlTtlSeconds ?? resolveEvidenceUrlTtlSeconds();

  return async function handleEvidencePacketV2(
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

      const evidenceBucket = getEvidenceBucketName();
      if (!evidenceBucket) {
        return NextResponse.json(
          {
            error: "Evidence bucket not configured",
            error_code: "EVIDENCE_BUCKET_NOT_CONFIGURED",
          },
          { status: 500 }
        );
      }
      const expiresAt = new Date(now().getTime() + signedUrlTtlSeconds * 1000);
      const evidence = await buildEvidenceArtifacts({
        citations,
        documents,
        evidenceBucket,
        storage,
        pageGenerator,
        expiresAt,
        now,
      });

      const packet: EvidencePacketV2 = {
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
        evidence,
        generated_at: now().toISOString(),
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
