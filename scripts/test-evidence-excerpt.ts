import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createEvidencePacketV2Handler } from "../lib/audit/evidence-packet-v2";
import type { EvidenceAuditRow, EvidenceCitation, EvidenceDocumentRef } from "../lib/audit/evidence-packet";

async function run(): Promise<void> {
  process.env.EVIDENCE_BUCKET = "evidence-bucket";

  const handler = createEvidencePacketV2Handler({
    requireAdminAccess: async () => ({
      ok: true,
      user: { id: "admin", email: "admin@example.com", role: "admin" },
    }),
    fetchAuditRow: async (_requestId: string): Promise<EvidenceAuditRow | null> => ({
      id: "req-1",
      created_at: "2026-01-01T00:00:00.000Z",
      actor: "system",
      action: "assistant_query",
      notes: "assistant_query:success",
      after_data: {},
    }),
    fetchCitations: async (): Promise<EvidenceCitation[]> => [
      {
        document_id: "doc-1",
        page: 1,
        excerpt: "Quoted text from fixture",
        verified: true,
      },
    ],
    fetchDocuments: async (): Promise<EvidenceDocumentRef[]> => [
      {
        document_id: "doc-1",
        gcs_bucket: "source-bucket",
        gcs_object: "source.pdf",
      },
    ],
    storage: {
      async fetchPdf() {
        return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      },
      async checkArtifact() {
        return { exists: false };
      },
      async saveArtifact() {
        return { createdAt: "2026-01-01T00:00:00.000Z", generation: "1" };
      },
      async signArtifactUrl() {
        return "https://example.com/evidence.pdf";
      },
    },
    pageGenerator: async () => new Uint8Array([1, 2, 3]),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    signedUrlTtlSeconds: 60,
  });

  const request = new NextRequest(
    "http://localhost/api/admin/evidence-packet/v2?request_id=req-1"
  );

  const response = await handler(request);
  assert.equal(response.status, 200, "expected 200 response");

  const payload = (await response.json()) as {
    citations?: Array<{ excerpt?: string }>;
    evidence?: unknown[];
  };

  assert.ok(payload.citations?.length, "expected citations in response");
  assert.equal(
    payload.citations?.[0]?.excerpt,
    "Quoted text from fixture",
    "expected excerpt to be present"
  );
  assert.ok(payload.evidence?.length, "expected evidence artifacts in response");

  console.log("evidence excerpt presence: OK");
}

run().catch((error) => {
  console.error("Evidence excerpt test failed:", error);
  process.exit(1);
});
