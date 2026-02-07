/**
 * Chat Handler for Assistant
 *
 * Handles general conversation (greetings, casual questions) and business
 * context queries. Simple greetings skip the DB query for fast responses.
 * Business questions aggregate document metadata and feed it to Gemini.
 * Falls back to deterministic summary on LLM failure.
 */

import { getSupabase } from "../supabase/client";
import { getGeminiModel } from "../gemini/client";
import { generateContentWithTimeout } from "../gemini/call";
import type { Slots, ChatResult, BusinessContext, AssistantMode, ConversationMessage } from "./types";

// ---------------------------------------------------------------------------
// Greeting detection
// ---------------------------------------------------------------------------

const GREETING_PATTERN =
  /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|thanks|thank\s+you|sup|yo|howdy|what'?s\s+up)\b/i;

export function isSimpleGreeting(query: string): boolean {
  return GREETING_PATTERN.test(query.trim());
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeAmount(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (typeof val === "string") {
    const cleaned = val.replace(/[$,]/g, "");
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeVendor(val: unknown): { key: string; display: string } | null {
  if (typeof val !== "string" || !val.trim()) return null;
  const display = val.trim();
  const key = display.toLowerCase();
  return { key, display };
}

function normalizeDate(val: unknown): string | null {
  if (typeof val !== "string" || !val.trim()) return null;
  const trimmed = val.trim();

  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Try MM/DD/YYYY or MM-DD-YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Try Date constructor as last resort
  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    // fall through
  }

  return null;
}

// ---------------------------------------------------------------------------
// Build business context from documents table
// ---------------------------------------------------------------------------

interface DocumentRow {
  id: string;
  file_name: string;
  document_type: string | null;
  extraction: Record<string, unknown> | null;
  sync_status: string | null;
  confidence_score: number | null;
  created_at: string;
}

export async function buildBusinessContext(): Promise<BusinessContext> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("id, file_name, document_type, extraction, sync_status, confidence_score, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("[Chat] Query error:", error);
    throw new Error("Failed to query documents for business context");
  }

  const rows = (data || []) as DocumentRow[];

  const typeCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const vendorMap = new Map<string, { display: string; total: number; count: number }>();
  const dates: string[] = [];
  let totalSpend = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  const recentDocs: BusinessContext["recentDocuments"] = [];

  for (const row of rows) {
    // Type counts
    const docType = row.document_type || "other";
    typeCounts[docType] = (typeCounts[docType] || 0) + 1;

    // Status counts
    const status = row.sync_status || "unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    // Confidence average
    if (row.confidence_score != null && Number.isFinite(row.confidence_score)) {
      confidenceSum += row.confidence_score;
      confidenceCount++;
    }

    // Extract data from extraction field
    const ext = row.extraction;
    const data = (ext?.data || ext || {}) as Record<string, unknown>;

    const vendor = normalizeVendor(data.vendor || data.merchant_name);
    const amount = normalizeAmount(data.total || data.amount);
    const date = normalizeDate(data.invoice_date || data.date);

    // Vendor spend aggregation
    if (vendor) {
      const existing = vendorMap.get(vendor.key);
      if (existing) {
        existing.total += amount || 0;
        existing.count++;
      } else {
        vendorMap.set(vendor.key, {
          display: vendor.display,
          total: amount || 0,
          count: 1,
        });
      }
    }

    // Total spend
    if (amount && amount > 0) {
      totalSpend += amount;
    }

    // Date tracking
    if (date) {
      dates.push(date);
    }

    // Recent documents (first 5)
    if (recentDocs.length < 5) {
      recentDocs.push({
        fileName: row.file_name,
        type: docType,
        vendor: vendor?.display || "",
        total: amount || 0,
        date: date || "",
      });
    }
  }

  // Sort vendor spend by total descending, take top 15
  const vendorSpend = Array.from(vendorMap.values())
    .map((v) => ({ vendor: v.display, total: Math.round(v.total * 100) / 100, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // Date range
  dates.sort();
  const dateRange = dates.length > 0
    ? { earliest: dates[0], latest: dates[dates.length - 1] }
    : null;

  return {
    totalDocuments: rows.length,
    typeCounts,
    statusCounts,
    vendorSpend,
    totalSpend: Math.round(totalSpend * 100) / 100,
    dateRange,
    avgConfidence: confidenceCount > 0 ? Math.round((confidenceSum / confidenceCount) * 100) / 100 : 0,
    recentDocuments: recentDocs,
  };
}

// ---------------------------------------------------------------------------
// Build Gemini prompt
// ---------------------------------------------------------------------------

function formatConversationHistory(history: ConversationMessage[]): string {
  if (history.length === 0) return "";
  const recent = history.slice(-10);
  const lines = recent.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
  return `\nCONVERSATION HISTORY:\n${lines.join("\n")}\n`;
}

function buildChatPrompt(
  query: string,
  context: BusinessContext | null,
  mode: AssistantMode,
  history: ConversationMessage[]
): string {
  const modeInstructions = mode === "lawyer"
    ? "Be precise and formal. State facts clearly with no speculation."
    : "Be friendly and conversational. Use bullet points for clarity. Offer follow-up suggestions.";

  const systemPrompt = `You are the AI assistant for MaryJane Hub, a document management system for a business owner managing cannabis and real estate operations across 8+ entities.

You help the owner understand their business, find documents, and stay organized.
When greeted, respond warmly and briefly. When asked about business data, answer from the provided context. When you can't answer, suggest what the user can ask (e.g., "Try asking me to find invoices from a specific vendor").

Always be concise. Use markdown formatting: **bold** for emphasis, - for bullet lists (not *), and $ for amounts.

RULES:
1. ${modeInstructions}
2. If business data is provided, answer ONLY from that data. Do not invent numbers or vendors.
3. If no business data is provided, respond conversationally without making up specifics.
4. Keep your answer concise (under 300 words).
5. Use dash-style bullet lists (- item), not asterisk bullets (* item).`;

  const historyBlock = formatConversationHistory(history);

  if (!context) {
    // Simple greeting/casual — no business data
    return `${systemPrompt}${historyBlock}\nUSER: ${query}`;
  }

  const typeBreakdown = Object.entries(context.typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `  - ${type}: ${count}`)
    .join("\n");

  const statusBreakdown = Object.entries(context.statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `  - ${status}: ${count}`)
    .join("\n");

  const vendorBreakdown = context.vendorSpend
    .map((v) => `  - ${v.vendor}: $${v.total.toLocaleString("en-US", { minimumFractionDigits: 2 })} (${v.count} docs)`)
    .join("\n");

  const recentDocs = context.recentDocuments
    .map((d) => `  - ${d.fileName} | ${d.type} | ${d.vendor || "N/A"} | $${d.total} | ${d.date || "N/A"}`)
    .join("\n");

  const dateRangeStr = context.dateRange
    ? `${context.dateRange.earliest} to ${context.dateRange.latest}`
    : "N/A";

  return `${systemPrompt}

BUSINESS SNAPSHOT:
- Total documents: ${context.totalDocuments}
- Total spend tracked: $${context.totalSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}
- Date range: ${dateRangeStr}
- Average extraction confidence: ${(context.avgConfidence * 100).toFixed(1)}%

DOCUMENT TYPES:
${typeBreakdown}

REVIEW STATUS:
${statusBreakdown}

TOP VENDORS BY SPEND:
${vendorBreakdown}

RECENT DOCUMENTS:
${recentDocs}
${historyBlock}
USER: ${query}`;
}

// ---------------------------------------------------------------------------
// Deterministic fallback summary (no LLM needed)
// ---------------------------------------------------------------------------

export function formatDeterministicSummary(context: BusinessContext): string {
  const lines: string[] = [];

  lines.push(`You have ${context.totalDocuments} documents on file.`);

  if (context.totalSpend > 0) {
    lines.push(`Total tracked spend: $${context.totalSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`);
  }

  if (context.dateRange) {
    lines.push(`Date range: ${context.dateRange.earliest} to ${context.dateRange.latest}.`);
  }

  // Type breakdown
  const types = Object.entries(context.typeCounts)
    .sort((a, b) => b[1] - a[1]);
  if (types.length > 0) {
    lines.push(`\nDocument types: ${types.map(([t, c]) => `${t} (${c})`).join(", ")}.`);
  }

  // Top vendors
  if (context.vendorSpend.length > 0) {
    const top5 = context.vendorSpend.slice(0, 5);
    lines.push(`\nTop vendors by spend:`);
    for (const v of top5) {
      lines.push(`  - ${v.vendor}: $${v.total.toLocaleString("en-US", { minimumFractionDigits: 2 })} (${v.count} docs)`);
    }
  }

  // Pending review
  const pendingReview = context.statusCounts["pending_review"] || 0;
  const needsAttention = context.statusCounts["needs_attention"] || 0;
  const actionable = pendingReview + needsAttention;
  if (actionable > 0) {
    lines.push(`\n${actionable} document${actionable > 1 ? "s" : ""} need${actionable === 1 ? "s" : ""} attention (${pendingReview} pending review, ${needsAttention} needs attention).`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function executeChat(
  query: string,
  _slots: Slots,
  options?: { mode?: AssistantMode; history?: ConversationMessage[] }
): Promise<ChatResult> {
  console.log(`[Chat] Processing query: "${query}"`);
  const mode: AssistantMode = options?.mode ?? "owner";
  const history = options?.history ?? [];
  const greeting = isSimpleGreeting(query);

  // Step 1: Build business context (skip for simple greetings)
  let context: BusinessContext | null = null;
  if (!greeting) {
    context = await buildBusinessContext();
    console.log(`[Chat] Context: ${context.totalDocuments} docs, $${context.totalSpend} total spend, ${context.vendorSpend.length} vendors`);
  } else {
    console.log("[Chat] Simple greeting detected — skipping DB query");
  }

  // Step 2: Generate answer via Gemini (with deterministic fallback)
  let answer: string;
  try {
    const model = getGeminiModel();
    const prompt = buildChatPrompt(query, context, mode, history);
    const result = (await generateContentWithTimeout(model, prompt)) as {
      response: { text?: string | (() => string) };
    };
    answer = typeof result.response.text === "function"
      ? result.response.text()
      : (result.response.text ?? "");

    if (!answer.trim()) {
      throw new Error("Empty Gemini response");
    }
  } catch (error) {
    console.warn("[Chat] Gemini failed, using deterministic fallback:", error);
    if (greeting) {
      answer = "Hi! I'm your business AI assistant. Ask me anything about your documents, vendors, or spending.";
    } else if (context) {
      answer = formatDeterministicSummary(context);
    } else {
      answer = "Hello! How can I help you today? Try asking about your business or searching for documents.";
    }
  }

  console.log(`[Chat] Generated answer (${answer.length} chars)`);

  return {
    answer,
    context: context ?? undefined,
    confidence: "high",
  };
}

export function formatChatResult(result: ChatResult): string {
  return result.answer;
}
