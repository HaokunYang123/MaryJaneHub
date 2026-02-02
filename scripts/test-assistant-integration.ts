#!/usr/bin/env npx tsx
/**
 * Assistant Integration Test Suite
 *
 * Validates trustworthiness red-lines with real services:
 * - citations verifiable
 * - sums via SQL
 * - no hallucinations
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { handleAssistantQuery, createConversationContext } from "../lib/assistant/clarify";
import type { AssistantResponse, Citation } from "../lib/assistant/types";

type Intent = "search" | "single_qa" | "sum" | "rag" | "unknown";

interface CaseResult {
  id: string;
  name: string;
  runnable: boolean;
  passed: boolean;
  notes: string;
}

interface VendorDocs {
  vendor: string;
  docs: Array<{
    id: string;
    document_type: string;
    extraction: Record<string, unknown>;
  }>;
}

const REQUIRED_ENV_VARS = ["SUPABASE_URL", "GEMINI_API_KEY"];

const FORCE = process.env.ASSISTANT_INTEGRATION === "1";

function exitWithMissingEnv(missing: string[]): never {
  if (FORCE) {
    console.error("Missing required environment variables:");
    missing.forEach((name) => console.error(`  - ${name}`));
    process.exit(1);
  }
  console.log("SKIP (integration env not set)");
  missing.forEach((name) => console.log(`  - missing ${name}`));
  process.exit(0);
}

function resolveSupabaseKey(): { name: string; value: string } | null {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { name: "SUPABASE_SERVICE_ROLE_KEY", value: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  if (process.env.SUPABASE_SERVICE_KEY) {
    return { name: "SUPABASE_SERVICE_KEY", value: process.env.SUPABASE_SERVICE_KEY };
  }
  return null;
}

function getExtractionData(extraction: Record<string, unknown>): Record<string, unknown> {
  const data = extraction?.["data"];
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return extraction;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[,$]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function inferIntent(response: AssistantResponse): Intent {
  if (response.type === "clarification") {
    return response.context.pendingClarification?.originalIntent || "unknown";
  }
  if (response.sumResult) return "sum";
  if (response.ragResult) return "rag";
  if (response.qaResult) return "single_qa";
  return "unknown";
}

function citationVerifiedRatio(citations: Citation[]): number {
  if (!citations.length) return 0;
  const verified = citations.filter((c) => c.verified).length;
  return verified / citations.length;
}

function isUncertainMessage(message: string): boolean {
  return /(don't have|do not have|not enough information|insufficient|couldn't find|could not find|cannot find|no documents found|i don't know|not sure)/i.test(
    message
  );
}

async function loadVendorDocs(
  supabase: ReturnType<typeof createClient>,
  vendor: string
): Promise<VendorDocs | null> {
  const filter = [
    `extraction->data->>vendor.ilike.%${vendor}%`,
    `extraction->data->>merchant_name.ilike.%${vendor}%`,
  ].join(",");

  const { data, error } = await supabase
    .from("documents")
    .select("id, document_type, extraction")
    .or(filter)
    .limit(200);

  if (error) {
    console.warn(`Vendor lookup failed for "${vendor}": ${error.message}`);
    return null;
  }

  return {
    vendor,
    docs: (data || []) as VendorDocs["docs"],
  };
}

async function fetchAuditRow(
  supabase: ReturnType<typeof createClient>,
  requestId: string
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, after_data")
      .eq("id", requestId)
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return { ok: false, error: "audit row not found" };
    }

    return {
      ok: true,
      data: (data.after_data || {}) as Record<string, unknown>,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function pickUniqueInvoiceDoc(vendorDocs: VendorDocs) {
  const invoiceDocs = vendorDocs.docs.filter((d) => d.document_type === "invoice");
  if (invoiceDocs.length === 0) return null;

  const totals = new Map<number, number>();
  for (const doc of invoiceDocs) {
    const data = getExtractionData(doc.extraction);
    const amount = parseAmount(data.total);
    if (amount !== null) {
      totals.set(amount, (totals.get(amount) || 0) + 1);
    }
  }

  for (const doc of invoiceDocs) {
    const data = getExtractionData(doc.extraction);
    const amount = parseAmount(data.total);
    if (amount === null) continue;
    if (totals.get(amount) !== 1) continue;
    const hasDate = Boolean(data.invoice_date || data.date);
    const hasNumber = Boolean(data.invoice_number);
    if (!hasDate && !hasNumber) continue;
    return { doc, amount, hasDate, hasNumber };
  }

  return null;
}

async function countReceipts2024(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, extraction")
    .eq("document_type", "receipt")
    .limit(500);

  if (error || !data) return 0;

  const filtered = data.filter((doc) => {
    const extraction = (doc as { extraction: Record<string, unknown> }).extraction;
    const dataObj = getExtractionData(extraction);
    const date = dataObj.date;
    return typeof date === "string" && date.startsWith("2024-");
  });

  return filtered.length;
}

async function countInvoices2024(
  supabase: ReturnType<typeof createClient>
): Promise<number> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, extraction")
    .eq("document_type", "invoice")
    .limit(500);

  if (error || !data) return 0;

  const filtered = data.filter((doc) => {
    const extraction = (doc as { extraction: Record<string, unknown> }).extraction;
    const dataObj = getExtractionData(extraction);
    const date = dataObj.invoice_date || dataObj.date;
    return typeof date === "string" && date.startsWith("2024-");
  });

  return filtered.length;
}

async function run() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    exitWithMissingEnv(missing);
  }

  const key = resolveSupabaseKey();
  if (!key) {
    exitWithMissingEnv(["SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY"]);
  }
  console.log(`Using Supabase key: ${key.name}`);

  // Ensure internal clients that expect SUPABASE_SERVICE_KEY can run.
  if (!process.env.SUPABASE_SERVICE_KEY) {
    process.env.SUPABASE_SERVICE_KEY = key.value;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = key.value;
  }

  const supabase = createClient(process.env.SUPABASE_URL!, key.value);

  const vendorNames = ["Bega", "FedEx", "Centerpointe"];
  const vendorDocs: VendorDocs[] = [];
  for (const name of vendorNames) {
    const docs = await loadVendorDocs(supabase, name);
    if (docs) vendorDocs.push(docs);
  }

  const primaryVendor =
    vendorDocs.find((v) => v.docs.some((d) => d.document_type === "invoice"))?.vendor || null;

  const vendorInvoiceDocs = primaryVendor
    ? vendorDocs.find((v) => v.vendor === primaryVendor)?.docs.filter((d) => d.document_type === "invoice") || []
    : [];

  const cases: CaseResult[] = [];

  // Case 1: single_qa with citations and verification
  {
    const id = "1";
    const name = "single_qa with citations (verified)";
    const vendorData = vendorDocs.find((v) => v.vendor === "Bega");
    if (!vendorData || vendorData.docs.length === 0) {
      cases.push({ id, name, runnable: false, passed: true, notes: "SKIP (Bega invoices not found)" });
    } else {
      const fieldQuery = "what is the date on the $1250 Bega invoice?";
      const response = await handleAssistantQuery(fieldQuery, createConversationContext());
      const intent = inferIntent(response);
      const citations = response.qaResult?.citations || [];
      const ratio = citationVerifiedRatio(citations);
      const intentOk = intent === "single_qa";
      const citationsOk = citations.length > 0 && ratio >= 0.9;

      let auditOk = true;
      let auditNote = "audit=skip";
      if (!response.auditRequestId) {
        auditOk = false;
        auditNote = "audit_request_id missing";
      } else {
        const audit = await fetchAuditRow(supabase, response.auditRequestId);
        if (!audit.ok) {
          if (FORCE) {
            auditOk = false;
            auditNote = `audit_error=${audit.error}`;
          } else {
            auditNote = `audit_skip=${audit.error}`;
          }
        } else {
          const auditIntent = audit.data?.intent;
          const retrieval = audit.data?.retrieval as { document_ids?: string[] } | undefined;
          const docCount = retrieval?.document_ids?.length || 0;
          auditOk = auditIntent === "single_qa" && docCount > 0;
          auditNote = `audit_intent=${auditIntent ?? "n/a"}, docs=${docCount}`;
        }
      }

      const passed = intentOk && citationsOk && auditOk;
      const notes = [
        intentOk ? "intent=single_qa" : `intent=${intent}`,
        `citations=${citations.length}`,
        `verified=${ratio.toFixed(2)}`,
        auditNote,
      ].join(", ");
      cases.push({ id, name, runnable: true, passed, notes });
    }
  }

  // Case 2: single_qa ambiguous -> clarification
  {
    const id = "2";
    const name = "single_qa ambiguous -> clarification";
    if (!primaryVendor || vendorInvoiceDocs.length < 2) {
      cases.push({ id, name, runnable: false, passed: true, notes: "SKIP (need >=2 vendor invoices)" });
    } else {
      const query = `what's the total on the ${primaryVendor} invoice?`;
      const response = await handleAssistantQuery(query, createConversationContext());
      const clarification = response.type === "clarification" || (response.candidates?.length || 0) > 1;
      const passed = clarification;
      const notes = clarification ? "clarification triggered" : `response type=${response.type}`;
      cases.push({ id, name, runnable: true, passed, notes });
    }
  }

  // Case 3: sum uses SQL (signal)
  {
    const id = "3";
    const name = "sum uses SQL (2024 receipts)";
    const receiptCount = await countReceipts2024(supabase);
    if (receiptCount === 0) {
      cases.push({ id, name, runnable: false, passed: true, notes: "SKIP (no 2024 receipts)" });
    } else {
      const query = "what is the total for 2024 receipts";
      const response = await handleAssistantQuery(query, createConversationContext());
      const intent = inferIntent(response);
      const sumTotal = response.sumResult?.total;
      const sqlQuery = response.sumResult?.sqlQuery;

      let auditOk = true;
      let auditNote = "audit=skip";
      if (!response.auditRequestId) {
        auditOk = false;
        auditNote = "audit_request_id missing";
      } else {
        const audit = await fetchAuditRow(supabase, response.auditRequestId);
        if (!audit.ok) {
          if (FORCE) {
            auditOk = false;
            auditNote = `audit_error=${audit.error}`;
          } else {
            auditNote = `audit_skip=${audit.error}`;
          }
        } else {
          const sqlPath = audit.data?.sql_path_used;
          auditOk = sqlPath === true;
          auditNote = `audit_sql_path=${sqlPath ?? "n/a"}`;
        }
      }

      const passed =
        intent === "sum" &&
        typeof sumTotal === "number" &&
        typeof sqlQuery === "string" &&
        sqlQuery.length > 0 &&
        auditOk;

      const notes = [
        `intent=${intent}`,
        `sum=${sumTotal ?? "n/a"}`,
        sqlQuery ? "sqlQuery=present" : "sqlQuery=missing",
        auditNote,
      ].join(", ");
      cases.push({ id, name, runnable: true, passed, notes });
    }
  }

  // Case 4: rag overview with citations
  {
    const id = "4";
    const name = "rag overview with citations";
    const invoiceCount = await countInvoices2024(supabase);
    if (invoiceCount === 0) {
      cases.push({ id, name, runnable: false, passed: true, notes: "SKIP (no 2024 invoices)" });
    } else {
      const query = "give me an overview of 2024 invoices";
      const response = await handleAssistantQuery(query, createConversationContext());
      const intent = inferIntent(response);
      const citations = response.ragResult?.citations || [];
      const ratio = citationVerifiedRatio(citations);
      const confidence = response.ragResult?.confidence;
      const intentOk = intent === "rag";
      const citationsOk = citations.length > 0 && ratio >= 0.9;
      const confidenceOk = confidence ? confidence !== "low" : true;
      const passed = intentOk && citationsOk && confidenceOk;
      const notes = [
        intentOk ? "intent=rag" : `intent=${intent}`,
        `citations=${citations.length}`,
        `verified=${ratio.toFixed(2)}`,
        confidence ? `confidence=${confidence}` : "confidence=n/a",
      ].join(", ");
      cases.push({ id, name, runnable: true, passed, notes });
    }
  }

  // Case 5: anti-hallucination single_qa
  {
    const id = "5";
    const name = "anti-hallucination single_qa";
    const xyzDocs = await loadVendorDocs(supabase, "XYZ Corp");
    if (xyzDocs && xyzDocs.docs.length > 0) {
      cases.push({ id, name, runnable: false, passed: true, notes: "SKIP (XYZ Corp exists in DB)" });
    } else {
      const query = "what's the total on the XYZ Corp invoice?";
      const response = await handleAssistantQuery(query, createConversationContext());
      const message = response.message || "";
      const notFound =
        response.qaResult?.error === "document_not_found" ||
        response.type === "clarification" ||
        isUncertainMessage(message);
      const answerText = response.qaResult?.answer || "";
      const fabricatedNumber = /\$?\d{2,}(?:\.\d{2})?/.test(answerText);
      const passed = notFound && !fabricatedNumber;
      const notes = [
        `type=${response.type}`,
        response.qaResult?.error ? `error=${response.qaResult.error}` : "error=none",
        `uncertain=${isUncertainMessage(message)}`,
      ].join(", ");
      cases.push({ id, name, runnable: true, passed, notes });
    }
  }

  // Case 6: anti-hallucination rag
  {
    const id = "6";
    const name = "anti-hallucination rag";
    const query = "What is our employee headcount?";
    const response = await handleAssistantQuery(query, createConversationContext());
    const message = response.message || "";
    const uncertain =
      response.type === "clarification" ||
      response.ragResult?.confidence === "low" ||
      isUncertainMessage(message);
    const containsNumbers = /\b\d{2,}\b/.test(message);
    const passed = uncertain && !containsNumbers;
    const notes = [
      `type=${response.type}`,
      response.ragResult?.confidence ? `confidence=${response.ragResult.confidence}` : "confidence=n/a",
      `uncertain=${uncertain}`,
    ].join(", ");
    cases.push({ id, name, runnable: true, passed, notes });
  }

  const runnable = cases.filter((c) => c.runnable);
  const failed = runnable.filter((c) => !c.passed);

  console.log("Assistant Integration Test Summary");
  console.log("ID | Status | Notes");
  console.log("---|--------|------");
  for (const c of cases) {
    const status = !c.runnable ? "SKIP" : c.passed ? "PASS" : "FAIL";
    console.log(`${c.id}  | ${status.padEnd(6)} | ${c.notes}`);
  }

  if (runnable.length === 0) {
    const note = "No runnable cases (data missing for all cases).";
    console.log(note);
    if (FORCE) {
      process.exit(1);
    }
    process.exit(0);
  }

  if (failed.length > 0) {
    console.error(`Failures: ${failed.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("Integration test failed:", error);
  process.exit(1);
});
