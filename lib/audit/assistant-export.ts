import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";
import { requireAdminAccessForRequest, type AdminAccessResult } from "@/lib/auth/admin-access";

export interface AssistantAuditExportRow {
  id: string;
  created_at: string;
  actor: string;
  action: "assistant_query";
  document_id: string | null;
  notes: string | null;
  after_data: Record<string, unknown> | null;
}

export interface AssistantAuditExportFilters {
  requestId?: string;
  from?: string;
  to?: string;
  userId?: string;
}

export type AssistantAuditFetch = (
  filters: AssistantAuditExportFilters
) => Promise<AssistantAuditExportRow[]>;

export interface AssistantAuditListFilters {
  from?: string;
  to?: string;
  intent?: string;
  status?: string;
  limit: number;
  cursor?: {
    created_at: string;
    id: string;
  } | null;
}

export interface AssistantAuditListResult {
  rows: AssistantAuditExportRow[];
  next_cursor: string | null;
}

export type AssistantAuditListFetch = (
  filters: AssistantAuditListFilters
) => Promise<AssistantAuditListResult>;

export type AdminAccessFn = (request: NextRequest) => Promise<AdminAccessResult>;

const DENYLIST_KEY_PATTERN = /(ocr|full_text|raw|chunk|content|document_text)/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

function normalizeDateParam(
  value: string,
  boundary: "start" | "end"
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return boundary === "start"
      ? `${trimmed}T00:00:00.000Z`
      : `${trimmed}T23:59:59.999Z`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed.toISOString();
}

function parseAssistantAuditFilters(
  searchParams: URLSearchParams
): { filters?: AssistantAuditExportFilters; error?: string } {
  const requestId = searchParams.get("request_id")?.trim();
  const fromParam = searchParams.get("from")?.trim();
  const toParam = searchParams.get("to")?.trim();
  const userId = searchParams.get("user_id")?.trim();

  const hasRequestId = Boolean(requestId);
  const hasRange = Boolean(fromParam || toParam);

  if (!hasRequestId && !hasRange) {
    return {
      error: "Provide request_id or a from/to date range.",
    };
  }

  if (hasRequestId && (fromParam || toParam || userId)) {
    return {
      error: "request_id cannot be combined with from/to or user_id.",
    };
  }

  const filters: AssistantAuditExportFilters = {};
  if (requestId) filters.requestId = requestId;
  if (userId) filters.userId = userId;

  if (fromParam) {
    const normalized = normalizeDateParam(fromParam, "start");
    if (!normalized) {
      return { error: `Invalid from date: ${fromParam}` };
    }
    filters.from = normalized;
  }

  if (toParam) {
    const normalized = normalizeDateParam(toParam, "end");
    if (!normalized) {
      return { error: `Invalid to date: ${toParam}` };
    }
    filters.to = normalized;
  }

  if (filters.from && filters.to) {
    const fromTime = new Date(filters.from).valueOf();
    const toTime = new Date(filters.to).valueOf();
    if (fromTime > toTime) {
      return { error: "from must be before to." };
    }
  }

  return { filters };
}

function encodeCursor(cursor: { created_at: string; id: string }): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string): { created_at: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      created_at?: string;
      id?: string;
    };
    if (!parsed.created_at || !parsed.id) return null;
    return { created_at: String(parsed.created_at), id: String(parsed.id) };
  } catch {
    return null;
  }
}

function parseAssistantAuditListFilters(
  searchParams: URLSearchParams
): { filters?: AssistantAuditListFilters; error?: string } {
  const intent = searchParams.get("intent")?.trim() || undefined;
  const status = searchParams.get("status")?.trim() || undefined;
  const fromParam = searchParams.get("from")?.trim();
  const toParam = searchParams.get("to")?.trim();

  let from: string | undefined;
  let to: string | undefined;

  if (fromParam) {
    const normalized = normalizeDateParam(fromParam, "start");
    if (!normalized) {
      return { error: `Invalid from date: ${fromParam}` };
    }
    from = normalized;
  }

  if (toParam) {
    const normalized = normalizeDateParam(toParam, "end");
    if (!normalized) {
      return { error: `Invalid to date: ${toParam}` };
    }
    to = normalized;
  }

  if (from && to) {
    const fromTime = new Date(from).valueOf();
    const toTime = new Date(to).valueOf();
    if (fromTime > toTime) {
      return { error: "from must be before to." };
    }
  }

  const limitParam = searchParams.get("limit");
  let limit = DEFAULT_LIST_LIMIT;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: "limit must be a positive integer" };
    }
    limit = Math.min(parsed, MAX_LIST_LIMIT);
  }

  const cursorParam = searchParams.get("cursor");
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor) {
    return { error: "Invalid cursor" };
  }

  return {
    filters: {
      from,
      to,
      intent,
      status,
      limit,
      cursor,
    },
  };
}

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

function scrubAuditRow(row: AssistantAuditExportRow): AssistantAuditExportRow {
  return {
    ...row,
    after_data: row.after_data
      ? (scrubSensitiveValue(row.after_data) as Record<string, unknown>)
      : null,
  };
}

export async function fetchAssistantAuditLogs(
  filters: AssistantAuditExportFilters
): Promise<AssistantAuditExportRow[]> {
  const supabase = getSupabase();

  let query = supabase
    .from("audit_logs")
    .select("id, created_at, actor, action, document_id, notes, after_data")
    .eq("action", "assistant_query")
    .order("created_at", { ascending: false });

  if (filters.requestId) {
    query = query.eq("id", filters.requestId);
  }

  if (filters.userId) {
    query = query.eq("actor", filters.userId);
  }

  if (filters.from) {
    query = query.gte("created_at", filters.from);
  }

  if (filters.to) {
    query = query.lte("created_at", filters.to);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  return (data || []) as AssistantAuditExportRow[];
}

export async function fetchAssistantAuditLogsList(
  filters: AssistantAuditListFilters
): Promise<AssistantAuditListResult> {
  const supabase = getSupabase();

  let query = supabase
    .from("audit_logs")
    .select("id, created_at, actor, action, document_id, notes, after_data")
    .eq("action", "assistant_query")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limit + 1);

  if (filters.intent) {
    query = query.eq("after_data->>intent", filters.intent);
  }

  if (filters.status) {
    query = query.eq("after_data->>status", filters.status);
  }

  if (filters.from) {
    query = query.gte("created_at", filters.from);
  }

  if (filters.to) {
    query = query.lte("created_at", filters.to);
  }

  if (filters.cursor) {
    const cursorCreated = filters.cursor.created_at;
    const cursorId = filters.cursor.id;
    query = query.or(
      `created_at.lt.${cursorCreated},and(created_at.eq.${cursorCreated},id.lt.${cursorId})`
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  const rows = (data || []) as AssistantAuditExportRow[];
  const hasMore = rows.length > filters.limit;
  const trimmed = rows.slice(0, filters.limit);
  const last = trimmed[trimmed.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ created_at: last.created_at, id: last.id }) : null;

  return { rows: trimmed, next_cursor: nextCursor };
}

function escapeCsvValue(value: string): string {
  if (/["\n,]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function buildAuditCsv(rows: AssistantAuditExportRow[]): string {
  const header = [
    "id",
    "created_at",
    "actor",
    "intent",
    "status",
    "docs_count",
    "citations_count",
    "sql_path_used",
  ];

  const lines = rows.map((row) => {
    const afterData = (row.after_data || {}) as Record<string, unknown>;
    const intent = typeof afterData.intent === "string" ? afterData.intent : "";
    const status = typeof afterData.status === "string" ? afterData.status : "";
    const retrieval = afterData.retrieval as Record<string, unknown> | undefined;
    const docsCount = Array.isArray(retrieval?.document_ids)
      ? String(retrieval?.document_ids.length)
      : "0";
    const citationsCount = Array.isArray(afterData.citations)
      ? String(afterData.citations.length)
      : "0";
    const sqlPathUsed =
      typeof afterData.sql_path_used === "boolean"
        ? String(afterData.sql_path_used)
        : "";

    const values = [
      row.id,
      row.created_at,
      row.actor,
      intent,
      status,
      docsCount,
      citationsCount,
      sqlPathUsed,
    ].map((value) => escapeCsvValue(String(value ?? "")));

    return values.join(",");
  });

  return `${header.join(",")}\n${lines.join("\n")}`;
}

export function createAssistantAuditHandler(deps: {
  fetchAuditLogs?: AssistantAuditFetch;
  fetchAuditList?: AssistantAuditListFetch;
  requireAdminAccess?: AdminAccessFn;
} = {}) {
  const fetchAuditLogs = deps.fetchAuditLogs ?? fetchAssistantAuditLogs;
  const fetchAuditList = deps.fetchAuditList ?? fetchAssistantAuditLogsList;
  const requireAdminFn = deps.requireAdminAccess ?? requireAdminAccessForRequest;

  return async function handleAssistantAuditExport(
    request: NextRequest
  ): Promise<NextResponse> {
    const authResult = await requireAdminFn(request);
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.status === 401 ? "Unauthorized" : "Forbidden", message: authResult.message },
        { status: authResult.status }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const requestId = searchParams.get("request_id")?.trim();
    const format = searchParams.get("format")?.toLowerCase();
    const listRequested =
      searchParams.get("list") === "true" ||
      searchParams.has("limit") ||
      searchParams.has("cursor") ||
      searchParams.has("intent") ||
      searchParams.has("status") ||
      format === "csv";

    if (!requestId && listRequested) {
      const { filters, error } = parseAssistantAuditListFilters(searchParams);
      if (error || !filters) {
        return NextResponse.json(
          { error: "Validation error", message: error || "Invalid query" },
          { status: 400 }
        );
      }

      try {
        const result = await fetchAuditList(filters);
        const sanitizedRows = result.rows.map(scrubAuditRow);

        if (format === "csv") {
          const csv = buildAuditCsv(sanitizedRows);
          return new NextResponse(csv, {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": "attachment; filename=\"assistant-audit.csv\"",
            },
          });
        }

        return NextResponse.json({
          rows: sanitizedRows,
          next_cursor: result.next_cursor,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json(
          { error: "Failed to export audit logs", message },
          { status: 500 }
        );
      }
    }

    const { filters, error } = parseAssistantAuditFilters(searchParams);

    if (error || !filters) {
      return NextResponse.json(
        { error: "Validation error", message: error || "Invalid query" },
        { status: 400 }
      );
    }

    try {
      const rows = await fetchAuditLogs(filters);
      const sanitized = rows.map(scrubAuditRow);
      return NextResponse.json(sanitized);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { error: "Failed to export audit logs", message },
        { status: 500 }
      );
    }
  };
}
