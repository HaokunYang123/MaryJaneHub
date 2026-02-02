import { createHash, randomUUID } from "crypto";
import { getSupabase } from "../supabase/client";

export type AuditStatus = "success" | "clarification" | "error";

export interface AuditCitation {
  document_id: string;
  page?: number;
  start_offset?: number;
  end_offset?: number;
  verified?: boolean;
  score?: number;
}

export interface AuditRetrieval {
  document_ids?: string[];
  candidate_ids?: string[];
}

export interface AuditPayload {
  request_id: string;
  actor: string;
  input_hash: string;
  redacted_input?: string;
  intent?: string;
  confidence?: string;
  slots?: Record<string, unknown>;
  retrieval?: AuditRetrieval;
  citations?: AuditCitation[];
  citations_verified_ratio?: number;
  sql_path_used?: boolean;
  sql_query?: string;
  output_hash?: string;
  output_summary?: string;
  status?: AuditStatus;
  error?: string;
  error_message?: string;
  notes?: string;
}

export interface AuditLogger {
  startAudit(input: { actor: string; inputText: string }): Promise<string | null>;
  appendAudit(requestId: string, patch: Partial<AuditPayload>): Promise<void>;
  finalizeAudit(requestId: string, patch: Partial<AuditPayload>): Promise<void>;
}

let loggerOverride: AuditLogger | null = null;
const auditCache = new Map<string, AuditPayload>();
const DENYLIST_KEY_PATTERN = /(ocr|full_text|raw|chunk|content|document_text)/i;
const MAX_TEXT_LEN = 280;
const MAX_SQL_LEN = 500;

export function setAuditLoggerOverride(logger: AuditLogger | null): void {
  loggerOverride = logger;
}

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)
  );
}

function ensureSupabaseServiceKey(): void {
  if (!process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function redactText(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.slice(0, 200);
}

function truncateText(text: string | undefined, max = MAX_TEXT_LEN): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (DENYLIST_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }
  if (typeof value === "string") {
    if (/note|error/i.test(key)) {
      return truncateText(value, MAX_TEXT_LEN);
    }
    if (key === "redacted_input") return truncateText(value, 200);
    if (key === "output_summary") return truncateText(value, MAX_TEXT_LEN);
    if (key === "sql_query") return truncateText(value, MAX_SQL_LEN);
  }
  return value;
}

function sanitizeSlots(slots: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!slots) return undefined;
  const allowed = [
    "date",
    "year",
    "month",
    "amount",
    "documentType",
    "vendor",
    "field",
    "aggregation",
    "comparison",
    "comparisonValue",
  ];
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in slots) {
      result[key] = sanitizeValue(key, slots[key]);
    }
  }
  return result;
}

function sanitizeRetrieval(retrieval: AuditRetrieval | undefined): AuditRetrieval | undefined {
  if (!retrieval) return undefined;
  const cleanIds = (ids?: unknown[]): string[] | undefined => {
    if (!ids) return undefined;
    return ids.map((id) => String(id)).slice(0, 50);
  };
  return {
    document_ids: cleanIds(retrieval.document_ids as unknown[] | undefined),
    candidate_ids: cleanIds(retrieval.candidate_ids as unknown[] | undefined),
  };
}

function sanitizeCitations(citations: AuditCitation[] | undefined): AuditCitation[] | undefined {
  if (!citations) return undefined;
  return citations.map((c) => ({
    document_id: String(c.document_id),
    page: typeof c.page === "number" ? c.page : undefined,
    start_offset: typeof c.start_offset === "number" ? c.start_offset : undefined,
    end_offset: typeof c.end_offset === "number" ? c.end_offset : undefined,
    verified: typeof c.verified === "boolean" ? c.verified : undefined,
    score: typeof c.score === "number" ? c.score : undefined,
  }));
}

const ALLOWED_KEYS = new Set([
  "request_id",
  "actor",
  "input_hash",
  "redacted_input",
  "intent",
  "confidence",
  "slots",
  "retrieval",
  "citations",
  "citations_verified_ratio",
  "sql_path_used",
  "sql_query",
  "output_hash",
  "output_summary",
  "status",
  "error",
  "error_message",
  "notes",
]);

export function sanitizeAuditPayloadForTest(payload: AuditPayload): AuditPayload {
  const result: AuditPayload = {
    request_id: payload.request_id,
    actor: payload.actor,
    input_hash: payload.input_hash,
  };

  for (const key of Object.keys(payload)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (key === "slots") {
      result.slots = sanitizeSlots(payload.slots as Record<string, unknown>);
      continue;
    }
    if (key === "retrieval") {
      result.retrieval = sanitizeRetrieval(payload.retrieval);
      continue;
    }
    if (key === "citations") {
      result.citations = sanitizeCitations(payload.citations);
      continue;
    }
    const value = (payload as Record<string, unknown>)[key];
    (result as Record<string, unknown>)[key] = sanitizeValue(key, value);
  }

  return result;
}

function mergePayload(base: AuditPayload, patch: Partial<AuditPayload>): AuditPayload {
  const merged: AuditPayload = { ...base, ...patch };
  if (base.slots || patch.slots) {
    merged.slots = { ...(base.slots || {}), ...(patch.slots || {}) };
  }
  if (base.retrieval || patch.retrieval) {
    merged.retrieval = { ...(base.retrieval || {}), ...(patch.retrieval || {}) };
  }
  if (patch.citations) {
    merged.citations = patch.citations;
  }
  return sanitizeAuditPayloadForTest(merged);
}

async function writeAuditRow(requestId: string, payload: AuditPayload): Promise<void> {
  try {
    if (!hasSupabaseEnv()) return;
    ensureSupabaseServiceKey();
    const supabase = getSupabase();
    const sanitized = sanitizeAuditPayloadForTest(payload);
    await supabase
      .from("audit_logs")
      .update({
        after_data: sanitized as unknown as Record<string, unknown>,
        notes: sanitized.status ? `assistant_query:${sanitized.status}` : "assistant_query",
      })
      .eq("id", requestId);
  } catch (error) {
    console.warn(
      `[Audit] Failed to write audit update: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function insertAuditRow(payload: AuditPayload): Promise<void> {
  try {
    if (!hasSupabaseEnv()) return;
    ensureSupabaseServiceKey();
    const supabase = getSupabase();
    const sanitized = sanitizeAuditPayloadForTest(payload);
    await supabase.from("audit_logs").insert({
      id: sanitized.request_id,
      actor: sanitized.actor,
      action: "assistant_query",
      after_data: sanitized as unknown as Record<string, unknown>,
      notes: "assistant_query:started",
    });
  } catch (error) {
    console.warn(
      `[Audit] Failed to create audit row: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function startAudit(input: { actor: string; inputText: string }): Promise<string | null> {
  if (loggerOverride) return loggerOverride.startAudit(input);
  if (!hasSupabaseEnv()) return null;

  const requestId = randomUUID();
  const payload: AuditPayload = {
    request_id: requestId,
    actor: input.actor,
    input_hash: hashText(input.inputText),
    redacted_input: redactText(input.inputText),
  };
  auditCache.set(requestId, payload);
  await insertAuditRow(payload);
  return requestId;
}

export async function appendAudit(
  requestId: string,
  patch: Partial<AuditPayload>
): Promise<void> {
  if (!requestId) return;
  if (loggerOverride) return loggerOverride.appendAudit(requestId, patch);
  const base = auditCache.get(requestId);
  if (!base) return;
  const merged = mergePayload(base, patch);
  auditCache.set(requestId, merged);
  await writeAuditRow(requestId, merged);
}

export async function finalizeAudit(
  requestId: string,
  patch: Partial<AuditPayload>
): Promise<void> {
  if (!requestId) return;
  if (loggerOverride) return loggerOverride.finalizeAudit(requestId, patch);
  const base = auditCache.get(requestId);
  if (!base) return;
  const merged = mergePayload(base, patch);
  auditCache.set(requestId, merged);
  await writeAuditRow(requestId, merged);
}

export function hashQuote(text: string): string {
  return hashText(text);
}
