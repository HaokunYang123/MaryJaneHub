#!/usr/bin/env npx tsx
/**
 * Deterministic audit logging test (no network).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { handleAssistantQuery, createConversationContext } from "../lib/assistant/clarify";
import { setAuditLoggerOverride, sanitizeAuditPayloadForTest } from "../lib/audit/logger";
import { createAssistantAuditHandler } from "../lib/audit/assistant-export";
import { createEvidencePacketHandler } from "../lib/audit/evidence-packet";
import { createEvidencePacketV2Handler, buildEvidenceObjectName } from "../lib/audit/evidence-packet-v2";
import { getArchiveFingerprint, setGcsMetadataProvider } from "../lib/gcs/upload";
import type { AssistantHandlers } from "../lib/assistant/clarify";
import type { AuditPayload } from "../lib/audit/logger";
import type { Slots } from "../lib/assistant/types";
import type { AssistantAuditExportRow } from "../lib/audit/assistant-export";
import type { AssistantAuditListFilters } from "../lib/audit/assistant-export";
import type { EvidenceAuditRow, EvidenceDocumentRef, EvidenceCitation, EvidencePacket } from "../lib/audit/evidence-packet";
import type { EvidencePacketV2 } from "../lib/audit/evidence-packet-v2";
import { NextRequest } from "next/server";

async function run() {
  let startCount = 0;
  let appendCount = 0;
  let finalizeCount = 0;
  let lastAppend: Partial<AuditPayload> | null = null;
  let lastFinalize: Partial<AuditPayload> | null = null;

  setAuditLoggerOverride({
    async startAudit() {
      startCount += 1;
      return "test-request-id";
    },
    async appendAudit(_requestId, patch) {
      appendCount += 1;
      lastAppend = patch;
    },
    async finalizeAudit(_requestId, patch) {
      finalizeCount += 1;
      lastFinalize = patch;
    },
  });

  const handlers: AssistantHandlers = {
    executeSearch: async () => ({
      success: true,
      message: "Mock search results.",
      results: [],
      count: 0,
    }),
    executeSum: async () => ({
      total: 0,
      count: 0,
      filters: {},
      confidence: "high",
      sqlQuery: "mock",
    }),
    executeRAG: async () => ({
      answer: "Mock rag answer",
      citations: [],
      documentsUsed: [],
      confidence: "high",
    }),
    answerSingleDocumentQuestion: async () => ({
      answer: "Mock answer",
      citations: [],
      confidence: "high",
      allCitationsVerified: true,
      documentUsed: { id: "doc-1", fileName: "doc.pdf", documentType: "invoice" },
    }),
  };

  const response = await handleAssistantQuery(
    "find all FedEx invoices",
    createConversationContext(),
    handlers
  );

  setAuditLoggerOverride(null);

  const failures: string[] = [];
  if (startCount !== 1) failures.push(`startAudit called ${startCount} times`);
  if (appendCount < 1) failures.push("appendAudit not called");
  if (finalizeCount < 1) failures.push("finalizeAudit not called");
  if (lastAppend?.intent !== "search") failures.push(`append intent=${String(lastAppend?.intent)}`);
  if (lastFinalize?.status !== "success") failures.push(`final status=${String(lastFinalize?.status)}`);
  if (!response.auditRequestId) failures.push("response missing auditRequestId");

  const sanitized = sanitizeAuditPayloadForTest({
    request_id: "req-1",
    actor: "system",
    input_hash: "hash",
    redacted_input: "x".repeat(500),
    slots: {
      documentType: "invoice",
      vendor: "Bega",
      raw_text: "SHOULD_NOT_APPEAR",
      content: "SECRET",
    },
    citations: [
      {
        document_id: "doc-1",
        start_offset: 10,
        end_offset: 20,
        verified: true,
        score: 1,
        quote_hash: "should-be-dropped",
      } as unknown as AuditPayload["citations"][number],
    ],
    error: "E".repeat(500),
    notes: "N".repeat(400),
  });

  const slotKeys = Object.keys(sanitized.slots || {});
  if (slotKeys.includes("raw_text") || slotKeys.includes("content")) {
    failures.push("denylist keys were not removed from slots");
  }
  if ((sanitized.redacted_input || "").length > 200) {
    failures.push("redacted_input not truncated");
  }
  if ((sanitized.error || "").length > 280) {
    failures.push("error not truncated");
  }
  if ((sanitized.notes || "").length > 280) {
    failures.push("notes not truncated");
  }
  const citationKeys = Object.keys((sanitized.citations || [])[0] || {});
  if (citationKeys.includes("quote_hash")) {
    failures.push("citation contains disallowed key");
  }

  const exportFailures = await testAuditExportHandler();
  failures.push(...exportFailures);

  const listFailures = await testAuditListHandler();
  failures.push(...listFailures);

  const evidenceFailures = await testEvidencePacketHandler();
  failures.push(...evidenceFailures);

  const evidenceV2Failures = await testEvidencePacketV2Handler();
  failures.push(...evidenceV2Failures);

  const assistantErrorFailures = await testAssistantGracefulErrors();
  failures.push(...assistantErrorFailures);

  const adminSecretFailures = await testAdminSecretAuth();
  failures.push(...adminSecretFailures);

  const gcsFailures = await testGcsArchiveFingerprint();
  failures.push(...gcsFailures);

  if (failures.length > 0) {
    console.error("Audit test FAILED:");
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }

  console.log("Audit test PASSED");
}

async function testAuditExportHandler(): Promise<string[]> {
  const failures: string[] = [];
  const capturedFilters: Array<{ requestId?: string }> = [];

  const handler = createAssistantAuditHandler({
    requireAdminAccess: async (_request) => ({
      ok: true,
      user: { id: "admin-id", email: "admin@example.com", role: "admin" },
    }),
    fetchAuditLogs: async (filters) => {
      capturedFilters.push({ requestId: filters.requestId });
      const row: AssistantAuditExportRow = {
        id: "req-123",
        created_at: "2026-01-01T00:00:00.000Z",
        actor: "system",
        action: "assistant_query",
        document_id: null,
        notes: "assistant_query:success",
        after_data: {
          raw_text: "TOP SECRET OCR",
          nested: {
            full_text: "RAW OCR",
            safe: "ok",
          },
          safe: "ok",
        },
      };
      return [row];
    },
  });

  const request = new NextRequest(
    "http://localhost/api/admin/audit/assistant?request_id=req-123"
  );
  const response = await handler(request);
  if (response.status !== 200) {
    failures.push(`export handler returned status ${response.status}`);
  }

  const payload = (await response.json()) as AssistantAuditExportRow[];
  if (!Array.isArray(payload) || payload.length !== 1) {
    failures.push("export handler did not return expected array");
  } else {
    const [row] = payload;
    if (row.after_data?.raw_text !== "[redacted]") {
      failures.push("export handler did not scrub raw_text");
    }
    const nested = row.after_data?.nested as Record<string, unknown> | undefined;
    if (nested?.full_text !== "[redacted]") {
      failures.push("export handler did not scrub nested full_text");
    }
  }

  if (capturedFilters[0]?.requestId !== "req-123") {
    failures.push("export handler did not pass request_id filter");
  }

  const invalidRequest = new NextRequest(
    "http://localhost/api/admin/audit/assistant"
  );
  const invalidResponse = await handler(invalidRequest);
  if (invalidResponse.status !== 400) {
    failures.push("export handler did not reject missing filters");
  }

  const unauthorizedHandler = createAssistantAuditHandler({
    requireAdminAccess: async (_request) => ({
      ok: false,
      status: 401,
      message: "Authentication required",
    }),
    fetchAuditLogs: async () => [],
  });
  const unauthorizedResponse = await unauthorizedHandler(request);
  if (unauthorizedResponse.status !== 401) {
    failures.push("export handler did not return 401 for missing auth");
  }

  return failures;
}

async function testAuditListHandler(): Promise<string[]> {
  const failures: string[] = [];
  let capturedFilters: AssistantAuditListFilters | null = null;

  const listHandler = createAssistantAuditHandler({
    requireAdminAccess: async (_request) => ({
      ok: true,
      user: { id: "admin-id", email: "admin@example.com", role: "admin" },
    }),
    fetchAuditList: async (filters) => {
      capturedFilters = filters;
      return {
        rows: [
          {
            id: "row-1",
            created_at: "2026-01-03T00:00:00.000Z",
            actor: "system",
            action: "assistant_query",
            document_id: null,
            notes: "assistant_query:success",
            after_data: {
              intent: "rag",
              status: "success",
              retrieval: { document_ids: ["doc-1"] },
              citations: [{ document_id: "doc-1", raw_text: "secret" }],
              raw_text: "TOP SECRET",
            },
          },
        ],
        next_cursor: "next-token",
      };
    },
  });

  const cursorToken = Buffer.from(
    JSON.stringify({ created_at: "2026-01-03T00:00:00.000Z", id: "row-1" })
  ).toString("base64url");

  const listRequest = new NextRequest(
    `http://localhost/api/admin/audit/assistant?list=true&limit=2&from=2026-01-01&intent=rag&status=success&cursor=${cursorToken}`
  );
  const listResponse = await listHandler(listRequest);
  if (listResponse.status !== 200) {
    failures.push(`list handler returned status ${listResponse.status}`);
  }

  const listPayload = (await listResponse.json()) as {
    rows: AssistantAuditExportRow[];
    next_cursor: string | null;
  };
  if (!Array.isArray(listPayload.rows) || listPayload.rows.length !== 1) {
    failures.push("list handler did not return rows");
  }
  if (listPayload.next_cursor !== "next-token") {
    failures.push("list handler did not return next_cursor");
  }

  const scrubbed = listPayload.rows[0]?.after_data as Record<string, unknown> | null;
  if (scrubbed?.raw_text !== "[redacted]") {
    failures.push("list handler did not scrub denylisted keys");
  }

  if (!capturedFilters || capturedFilters.intent !== "rag" || capturedFilters.status !== "success") {
    failures.push("list handler did not pass intent/status filters");
  }

  const csvHandler = createAssistantAuditHandler({
    requireAdminAccess: async (_request) => ({
      ok: true,
      user: { id: "admin-id", email: "admin@example.com", role: "admin" },
    }),
    fetchAuditList: async () => ({
      rows: [
        {
          id: "row-2",
          created_at: "2026-01-04T00:00:00.000Z",
          actor: "system",
          action: "assistant_query",
          document_id: null,
          notes: "assistant_query:success",
          after_data: {
            intent: "search",
            status: "success",
            retrieval: { document_ids: ["doc-1", "doc-2"] },
            citations: [{ document_id: "doc-1" }],
            raw_text: "NEVER INCLUDE",
          },
        },
      ],
      next_cursor: null,
    }),
  });

  const csvRequest = new NextRequest(
    "http://localhost/api/admin/audit/assistant?format=csv&limit=10"
  );
  const csvResponse = await csvHandler(csvRequest);
  if (csvResponse.status !== 200) {
    failures.push(`csv handler returned status ${csvResponse.status}`);
  }
  const csvText = await csvResponse.text();
  if (!csvText.startsWith("id,created_at,actor,intent,status")) {
    failures.push("csv handler did not include expected header");
  }
  if (csvText.includes("raw_text") || csvText.includes("NEVER INCLUDE")) {
    failures.push("csv handler leaked denylisted fields");
  }

  return failures;
}

async function testEvidencePacketHandler(): Promise<string[]> {
  const failures: string[] = [];

  const auditRow: EvidenceAuditRow = {
    id: "req-999",
    created_at: "2026-01-02T00:00:00.000Z",
    actor: "system",
    action: "assistant_query",
    notes: "assistant_query:success",
    after_data: {
      intent: "rag",
      status: "success",
      retrieval: { document_ids: ["doc-1", "doc-2"] },
      citations: [
        {
          document_id: "doc-1",
          page: 2,
          start_offset: 10,
          end_offset: 20,
          verified: true,
          score: 0.9,
          raw_text: "secret",
        },
      ],
      raw_text: "TOP SECRET",
      nested: { full_text: "RAW OCR" },
    },
  };

  const handler = createEvidencePacketHandler({
    requireAdminAccess: async (_request) => ({
      ok: true,
      user: { id: "admin-id", email: "admin@example.com", role: "admin" },
    }),
    fetchAuditRow: async (requestId) => (requestId === "req-999" ? auditRow : null),
    fetchCitations: async () =>
      (auditRow.after_data?.citations as EvidenceCitation[]) || [],
    fetchDocuments: async (documentIds) =>
      documentIds.map((id) => ({
        document_id: id,
        filename: `file-${id}.pdf`,
        gcs_path: `gs://bucket/${id}.pdf`,
        sha256: `hash-${id}`,
        gcs_bucket: "archive-bucket",
        gcs_object: `originals/2026/01/${id}.pdf`,
        gcs_generation: "12345",
        gcs_hash_type: "md5",
        gcs_hash_value: `md5-${id}`,
        gcs_retention_status: "confirmed",
      })) as EvidenceDocumentRef[],
  });

  const request = new NextRequest(
    "http://localhost/api/admin/evidence-packet?request_id=req-999"
  );
  const response = await handler(request);
  if (response.status !== 200) {
    failures.push(`evidence handler returned status ${response.status}`);
  }

  const payload = (await response.json()) as EvidencePacket;
  if (payload.request_id !== "req-999") {
    failures.push("evidence packet missing request_id");
  }
  if (!payload.audit || payload.audit.id !== "req-999") {
    failures.push("evidence packet missing audit");
  }
  if (!Array.isArray(payload.citations) || payload.citations.length !== 1) {
    failures.push("evidence packet citations malformed");
  }
  if (!Array.isArray(payload.documents) || payload.documents.length !== 2) {
    failures.push("evidence packet documents malformed");
  }
  const firstDoc = payload.documents[0] as EvidenceDocumentRef | undefined;
  if (!firstDoc?.gcs_bucket || !firstDoc?.gcs_object || !firstDoc?.gcs_generation) {
    failures.push("evidence packet missing archive fingerprint fields");
  }
  if (firstDoc?.gcs_retention_status !== "confirmed") {
    failures.push("evidence packet missing retention status");
  }

  const auditAfter = payload.audit.after_data as Record<string, unknown> | null;
  if (auditAfter?.raw_text !== "[redacted]") {
    failures.push("evidence packet did not scrub raw_text in audit");
  }
  const nested = auditAfter?.nested as Record<string, unknown> | undefined;
  if (nested?.full_text !== "[redacted]") {
    failures.push("evidence packet did not scrub nested full_text");
  }
  const citation = payload.citations[0] as Record<string, unknown>;
  if (citation.raw_text !== "[redacted]") {
    failures.push("evidence packet did not scrub citation raw_text");
  }

  const notFoundRequest = new NextRequest(
    "http://localhost/api/admin/evidence-packet?request_id=missing"
  );
  const notFoundResponse = await handler(notFoundRequest);
  if (notFoundResponse.status !== 404) {
    failures.push("evidence packet did not return 404 for missing request_id");
  }

  const forbiddenHandler = createEvidencePacketHandler({
    requireAdminAccess: async (_request) => ({
      ok: false,
      status: 403,
      message: "Admin role required",
    }),
    fetchAuditRow: async () => auditRow,
    fetchCitations: async () => [],
    fetchDocuments: async () => [],
  });
  const forbiddenResponse = await forbiddenHandler(request);
  if (forbiddenResponse.status !== 403) {
    failures.push("evidence packet did not return 403 for non-admin");
  }

  return failures;
}

async function testEvidencePacketV2Handler(): Promise<string[]> {
  const failures: string[] = [];

  const auditRow: EvidenceAuditRow = {
    id: "req-v2",
    created_at: "2026-01-03T00:00:00.000Z",
    actor: "system",
    action: "assistant_query",
    notes: "assistant_query:success",
    after_data: {
      intent: "rag",
      status: "success",
      retrieval: { document_ids: ["doc-1", "doc-2"] },
      citations: [
        { document_id: "doc-1", page: 2, raw_text: "secret" },
        { document_id: "doc-1", page: 2 },
        { document_id: "doc-2", page: 1 },
      ],
      raw_text: "TOP SECRET",
    },
  };

  const objectDoc1Page2 = buildEvidenceObjectName({
    documentId: "doc-1",
    page: 2,
    generation: "111",
    extension: "pdf",
  });
  const objectDoc2Page1 = buildEvidenceObjectName({
    documentId: "doc-2",
    page: 1,
    generation: "222",
    extension: "pdf",
  });

  const existingObjects = new Set([objectDoc1Page2]);
  const savedObjects: string[] = [];
  const checkedObjects: string[] = [];
  const generatedPages: number[] = [];
  let signedExpiry: Date | null = null;
  const nowIso = "2026-01-03T00:00:00.000Z";

  const previousBucket = process.env.EVIDENCE_BUCKET;
  const previousTtl = process.env.EVIDENCE_URL_TTL_SECONDS;

  try {
    delete process.env.EVIDENCE_BUCKET;
    const missingBucketHandler = createEvidencePacketV2Handler({
      requireAdminAccess: async (_request) => ({
        ok: true,
        user: { id: "admin-id", email: "admin@example.com", role: "admin" },
      }),
      fetchAuditRow: async (requestId) => (requestId === "req-v2" ? auditRow : null),
      fetchCitations: async () =>
        (auditRow.after_data?.citations as EvidenceCitation[]) || [],
      fetchDocuments: async () => [
        {
          document_id: "doc-1",
          gcs_bucket: "archive-bucket",
          gcs_object: "originals/2026/01/doc-1.pdf",
          gcs_generation: "111",
        },
      ],
    });
    const missingBucketRequest = new NextRequest(
      "http://localhost/api/admin/evidence-packet/v2?request_id=req-v2"
    );
    const missingBucketResponse = await missingBucketHandler(missingBucketRequest);
    if (missingBucketResponse.status !== 500) {
      failures.push("evidence v2 missing bucket did not return 500");
    } else {
      const payload = (await missingBucketResponse.json()) as { error_code?: string };
      if (payload.error_code !== "EVIDENCE_BUCKET_NOT_CONFIGURED") {
        failures.push("evidence v2 missing bucket did not return error_code");
      }
    }

    process.env.EVIDENCE_BUCKET = "evidence-bucket";
    process.env.EVIDENCE_URL_TTL_SECONDS = "900";

    const handler = createEvidencePacketV2Handler({
      requireAdminAccess: async (_request) => ({
        ok: true,
        user: { id: "admin-id", email: "admin@example.com", role: "admin" },
      }),
      fetchAuditRow: async (requestId) => (requestId === "req-v2" ? auditRow : null),
      fetchCitations: async () =>
        (auditRow.after_data?.citations as EvidenceCitation[]) || [],
      fetchDocuments: async () => [
        {
          document_id: "doc-1",
          filename: "doc-1.pdf",
          gcs_bucket: "archive-bucket",
          gcs_object: "originals/2026/01/doc-1.pdf",
          gcs_generation: "111",
        },
        {
          document_id: "doc-2",
          filename: "doc-2.pdf",
          gcs_bucket: "archive-bucket",
          gcs_object: "originals/2026/01/doc-2.pdf",
          gcs_generation: "222",
        },
      ],
      storage: {
        async fetchPdf() {
          return new Uint8Array([1, 2, 3]);
        },
        async checkArtifact({ object }) {
          checkedObjects.push(object);
          if (existingObjects.has(object)) {
            return { exists: true, createdAt: "2026-01-01T00:00:00.000Z", generation: "777" };
          }
          return { exists: false };
        },
        async saveArtifact({ object }) {
          savedObjects.push(object);
          return { createdAt: "2026-01-02T00:00:00.000Z", generation: "888" };
        },
        async signArtifactUrl({ bucket, object, expiresAt }) {
          signedExpiry = expiresAt;
          return `https://signed.example/${bucket}/${object}`;
        },
      },
      pageGenerator: async ({ pageIndex }) => {
        generatedPages.push(pageIndex);
        return new Uint8Array([9, 9, 9]);
      },
      now: () => new Date(nowIso),
    });

    const request = new NextRequest(
      "http://localhost/api/admin/evidence-packet/v2?request_id=req-v2"
    );
    const response = await handler(request);
    if (response.status !== 200) {
      failures.push(`evidence v2 handler returned status ${response.status}`);
    }

    const payload = (await response.json()) as EvidencePacketV2;
    const evidence = payload.evidence || [];
    if (evidence.length !== 2) {
      failures.push(`evidence v2 expected 2 artifacts, got ${evidence.length}`);
    }

    const evidenceObjects = evidence.map((item) => item.artifact_url);
    if (!evidenceObjects.some((url) => url.includes(objectDoc1Page2))) {
      failures.push("evidence v2 missing artifact for doc-1 page 2");
    }
    if (!evidenceObjects.some((url) => url.includes(objectDoc2Page1))) {
      failures.push("evidence v2 missing artifact for doc-2 page 1");
    }

    const expectedExpiry = new Date("2026-01-03T00:15:00.000Z").toISOString();
    const expiresAtSet = new Set(evidence.map((item) => item.expires_at));
    if (!expiresAtSet.has(expectedExpiry)) {
      failures.push("evidence v2 did not apply TTL override");
    }
    if (signedExpiry?.toISOString() !== expectedExpiry) {
      failures.push("evidence v2 did not use TTL override for signed URL");
    }

    if (savedObjects.length !== 1 || savedObjects[0] !== objectDoc2Page1) {
      failures.push("evidence v2 did not cache artifacts as expected");
    }
    if (generatedPages.length !== 1 || generatedPages[0] !== 0) {
      failures.push("evidence v2 did not generate expected page index");
    }

    const auditAfter = payload.audit.after_data as Record<string, unknown> | null;
    if (auditAfter?.raw_text !== "[redacted]") {
      failures.push("evidence v2 did not scrub raw_text in audit");
    }
    const citation = payload.citations[0] as Record<string, unknown>;
    if (citation.raw_text !== "[redacted]") {
      failures.push("evidence v2 did not scrub citation raw_text");
    }

    const checkedSet = new Set(checkedObjects);
    if (!checkedSet.has(objectDoc1Page2) || !checkedSet.has(objectDoc2Page1)) {
      failures.push("evidence v2 did not use stable object naming");
    }

    process.env.EVIDENCE_URL_TTL_SECONDS = "";
    const defaultTtlHandler = createEvidencePacketV2Handler({
      requireAdminAccess: async (_request) => ({
        ok: true,
        user: { id: "admin-id", email: "admin@example.com", role: "admin" },
      }),
      fetchAuditRow: async (requestId) => (requestId === "req-v2" ? auditRow : null),
      fetchCitations: async () =>
        (auditRow.after_data?.citations as EvidenceCitation[]) || [],
      fetchDocuments: async () => [
        {
          document_id: "doc-1",
          gcs_bucket: "archive-bucket",
          gcs_object: "originals/2026/01/doc-1.pdf",
          gcs_generation: "111",
        },
      ],
      storage: {
        async fetchPdf() {
          return new Uint8Array([1, 2, 3]);
        },
        async checkArtifact() {
          return { exists: true, createdAt: "2026-01-01T00:00:00.000Z", generation: "777" };
        },
        async saveArtifact() {
          return { createdAt: "2026-01-02T00:00:00.000Z", generation: "888" };
        },
        async signArtifactUrl({ expiresAt }) {
          signedExpiry = expiresAt;
          return "https://signed.example/default";
        },
      },
      now: () => new Date(nowIso),
    });
    const defaultResponse = await defaultTtlHandler(request);
    const defaultPayload = (await defaultResponse.json()) as EvidencePacketV2;
    const defaultExpiresAt = defaultPayload.evidence[0]?.expires_at;
    const expectedDefault = new Date("2026-01-03T00:30:00.000Z").toISOString();
    if (defaultExpiresAt !== expectedDefault) {
      failures.push("evidence v2 did not apply default TTL");
    }
    if (signedExpiry?.toISOString() !== expectedDefault) {
      failures.push("evidence v2 did not apply default TTL for signed URL");
    }
  } finally {
    if (previousBucket === undefined) {
      delete process.env.EVIDENCE_BUCKET;
    } else {
      process.env.EVIDENCE_BUCKET = previousBucket;
    }
    if (previousTtl === undefined) {
      delete process.env.EVIDENCE_URL_TTL_SECONDS;
    } else {
      process.env.EVIDENCE_URL_TTL_SECONDS = previousTtl;
    }
  }

  return failures;
}

async function testAssistantGracefulErrors(): Promise<string[]> {
  const failures: string[] = [];
  const auditPatches: Array<Partial<AuditPayload>> = [];
  let startCount = 0;

  setAuditLoggerOverride({
    async startAudit() {
      startCount += 1;
      return `req-grace-${startCount}`;
    },
    async appendAudit() {},
    async finalizeAudit(_requestId, patch) {
      auditPatches.push(patch);
    },
  });

  try {
    const ragContext = createConversationContext();
    const ragResponse = await handleAssistantQuery(
      "tell me about our relationship with Bega",
      ragContext,
      {
        executeRAG: async () => {
          throw new Error("LLM down");
        },
      }
    );

    if (!/enough information/i.test(ragResponse.message)) {
      failures.push("rag error did not return insufficient information message");
    }
    if (ragResponse.type !== "error") {
      failures.push(`rag error expected type=error, got ${ragResponse.type}`);
    }
    if ((ragResponse.ragResult?.citations || []).length !== 0) {
      failures.push("rag error expected no citations");
    }

    const ragAudit = auditPatches[auditPatches.length - 1];
    if (ragAudit.status !== "error") {
      failures.push("rag error audit status not set to error");
    }
    if (ragAudit.error !== "insufficient_info") {
      failures.push(`rag error audit code expected insufficient_info, got ${ragAudit.error}`);
    }

    const qaContext = createConversationContext();
    const qaResponse = await handleAssistantQuery(
      "what's the total on the Centerpointe invoice?",
      qaContext,
      {
        answerSingleDocumentQuestion: async () => {
          throw new Error("LLM down");
        },
      }
    );

    if (!/enough information/i.test(qaResponse.message)) {
      failures.push("single_qa error did not return insufficient information message");
    }
    if (qaResponse.type !== "error") {
      failures.push(`single_qa error expected type=error, got ${qaResponse.type}`);
    }
    if ((qaResponse.qaResult?.citations || []).length !== 0) {
      failures.push("single_qa error expected no citations");
    }

    const qaAudit = auditPatches[auditPatches.length - 1];
    if (qaAudit.status !== "error") {
      failures.push("single_qa error audit status not set to error");
    }
    if (qaAudit.error !== "insufficient_info") {
      failures.push(`single_qa audit code expected insufficient_info, got ${qaAudit.error}`);
    }
  } finally {
    setAuditLoggerOverride(null);
  }

  return failures;
}

async function testAdminSecretAuth(): Promise<string[]> {
  const failures: string[] = [];
  const previousSecret = process.env.ADMIN_API_SECRET;

  try {
    process.env.ADMIN_API_SECRET = "test-secret";

    const handler = createAssistantAuditHandler({
      fetchAuditLogs: async () => [],
    });

    const okRequest = new NextRequest(
      "http://localhost/api/admin/audit/assistant?request_id=req-1",
      { headers: { "x-admin-secret": "test-secret" } }
    );
    const okResponse = await handler(okRequest);
    if (okResponse.status !== 200) {
      failures.push(`admin secret auth expected 200, got ${okResponse.status}`);
    }

    const badRequest = new NextRequest(
      "http://localhost/api/admin/audit/assistant?request_id=req-1",
      { headers: { "x-admin-secret": "wrong-secret" } }
    );
    const badResponse = await handler(badRequest);
    if (badResponse.status !== 401) {
      failures.push(`admin secret auth expected 401, got ${badResponse.status}`);
    }
  } finally {
    if (previousSecret === undefined) {
      delete process.env.ADMIN_API_SECRET;
    } else {
      process.env.ADMIN_API_SECRET = previousSecret;
    }
  }

  return failures;
}

async function testGcsArchiveFingerprint(): Promise<string[]> {
  const failures: string[] = [];

  setGcsMetadataProvider(async () => ({
    bucket: "archive-bucket",
    name: "originals/2026/01/doc-1.pdf",
    generation: "98765",
    md5Hash: "md5hash",
    crc32c: "crc32c",
    retentionExpirationTime: "2030-01-01T00:00:00.000Z",
  }));

  const fingerprint = await getArchiveFingerprint(
    "archive-bucket",
    "originals/2026/01/doc-1.pdf"
  );

  setGcsMetadataProvider(null);

  if (fingerprint.gcsGeneration !== "98765") {
    failures.push("archive fingerprint did not capture generation");
  }
  if (fingerprint.gcsHashType !== "md5" || fingerprint.gcsHashValue !== "md5hash") {
    failures.push("archive fingerprint did not capture hash");
  }
  if (fingerprint.retentionStatus !== "confirmed") {
    failures.push("archive fingerprint did not confirm retention status");
  }

  return failures;
}

run().catch((error) => {
  console.error("Audit test failed:", error);
  process.exit(1);
});
