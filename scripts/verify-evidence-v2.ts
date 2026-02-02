#!/usr/bin/env npx tsx
/**
 * Manual verification for Evidence Packet v2 (admin-only).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { PDFDocument } from "pdf-lib";

type EvidenceArtifact = {
  artifact_type?: string;
  artifact_url?: string;
  expires_at?: string;
};

type EvidencePacketV2 = {
  request_id?: string;
  evidence?: EvidenceArtifact[];
};

function failAndExit(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function resolveEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function fetchJson(
  url: string,
  options: { cookie?: string | null; adminSecret?: string | null }
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  if (options.adminSecret) {
    headers["x-admin-secret"] = options.adminSecret;
  }
  const response = await fetch(url, { headers });
  const status = response.status;
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }
  return { status, body };
}

function isPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

async function run(): Promise<void> {
  const requestId = resolveEnv("EVIDENCE_REQUEST_ID");
  if (!requestId) {
    failAndExit("EVIDENCE_REQUEST_ID is required");
  }

  const baseUrl = resolveEnv("EVIDENCE_BASE_URL") ?? "http://localhost:3000";
  const adminCookie = resolveEnv("EVIDENCE_ADMIN_COOKIE");
  const adminSecret = resolveEnv("EVIDENCE_ADMIN_SECRET");
  if (!adminCookie && !adminSecret) {
    failAndExit(
      "Provide EVIDENCE_ADMIN_SECRET (preferred) or EVIDENCE_ADMIN_COOKIE (paste your admin session cookie)"
    );
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/admin/evidence-packet/v2?request_id=${encodeURIComponent(
    requestId
  )}`;

  const { status, body } = await fetchJson(url, {
    cookie: adminCookie,
    adminSecret,
  });
  if (status !== 200) {
    console.error("FAIL: unexpected status");
    console.error(`  status=${status}`);
    console.error(`  body=${JSON.stringify(body, null, 2)}`);
    process.exit(1);
  }

  const payload = body as EvidencePacketV2;
  const evidence = payload?.evidence ?? [];
  if (!Array.isArray(evidence) || evidence.length === 0) {
    failAndExit("No evidence entries returned");
  }

  const failures: string[] = [];
  const now = Date.now();
  for (const entry of evidence) {
    if (entry.artifact_type !== "pdf") {
      failures.push("artifact_type is not pdf");
      break;
    }
    if (!entry.artifact_url) {
      failures.push("artifact_url missing");
      break;
    }
    if (!entry.expires_at) {
      failures.push("expires_at missing");
      break;
    }
    const expiresAt = Date.parse(entry.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      failures.push("expires_at is not in the future");
      break;
    }
  }

  if (failures.length > 0) {
    console.error("FAIL:");
    failures.forEach((issue) => console.error(`  - ${issue}`));
    process.exit(1);
  }

  const sample = evidence[0];
  const artifactUrl = sample.artifact_url!;
  const artifactResponse = await fetch(artifactUrl);
  if (!artifactResponse.ok) {
    failAndExit(`Artifact fetch failed with status ${artifactResponse.status}`);
  }

  const contentType = artifactResponse.headers.get("content-type") || "";
  const buffer = new Uint8Array(await artifactResponse.arrayBuffer());
  const headerIsPdf = isPdfHeader(buffer);
  if (!/application\/pdf/i.test(contentType) && !headerIsPdf) {
    failAndExit("Artifact is not a PDF (content-type/header check failed)");
  }

  try {
    const pdfDoc = await PDFDocument.load(buffer);
    const pageCount = pdfDoc.getPageCount();
    if (pageCount !== 1) {
      failAndExit(`Artifact PDF page count expected 1, got ${pageCount}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(`Failed to parse PDF: ${message}`);
  }

  console.log("PASS: Evidence Packet v2 verified");
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: ${message}`);
  process.exit(1);
});
