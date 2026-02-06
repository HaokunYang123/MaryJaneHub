"use client";

import { useState } from "react";

interface AssistantAuditRow {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  document_id: string | null;
  notes: string | null;
  after_data: Record<string, unknown> | null;
}

interface AssistantAuditListResponse {
  rows: AssistantAuditRow[];
  next_cursor: string | null;
}

interface FetchState {
  loading: boolean;
  error: string | null;
  row: AssistantAuditRow | null;
  rowCount: number;
}

export default function AssistantAuditViewer() {
  const [requestId, setRequestId] = useState("");
  const [state, setState] = useState<FetchState>({
    loading: false,
    error: null,
    row: null,
    rowCount: 0,
  });
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [intent, setIntent] = useState("");
  const [status, setStatus] = useState("");
  const [listRows, setListRows] = useState<AssistantAuditRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const listLimit = 25;

  const fetchAudit = async (overrideId?: string) => {
    const trimmed = (overrideId ?? requestId).trim();
    if (!trimmed) {
      setState((prev) => ({
        ...prev,
        error: "Enter a request_id to fetch.",
      }));
      return;
    }

    if (overrideId) {
      setRequestId(trimmed);
    }

    setState({ loading: true, error: null, row: null, rowCount: 0 });

    try {
    const response = await fetch(
        `/api/admin/audit/assistant?request_id=${encodeURIComponent(trimmed)}`,
        { credentials: "include", cache: "no-store" }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        const message = payload?.message || payload?.error || response.statusText;
        setState({
          loading: false,
          error: `Fetch failed: ${message}`,
          row: null,
          rowCount: 0,
        });
        return;
      }

      const data = (await response.json()) as AssistantAuditRow[];
      if (!Array.isArray(data) || data.length === 0) {
        setState({
          loading: false,
          error: "No audit records found for that request_id.",
          row: null,
          rowCount: 0,
        });
        return;
      }

      const sanitized = JSON.parse(
        JSON.stringify(data[0], (_key, value) => {
          if (value === "[redacted]") return undefined;
          return value;
        })
      ) as AssistantAuditRow;
      setState({
        loading: false,
        error: null,
        row: sanitized,
        rowCount: data.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setState({ loading: false, error: message, row: null, rowCount: 0 });
    }
  };

  const buildListParams = (cursor?: string | null) => {
    const params = new URLSearchParams();
    params.set("list", "true");
    params.set("limit", String(listLimit));
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (intent) params.set("intent", intent);
    if (status) params.set("status", status);
    if (cursor) params.set("cursor", cursor);
    return params;
  };

  const fetchList = async (cursor?: string | null) => {
    setListLoading(true);
    setListError(null);
    try {
      const params = buildListParams(cursor);
      const response = await fetch(`/api/admin/audit/assistant?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        const message = payload?.message || payload?.error || response.statusText;
        setListError(`Fetch failed: ${message}`);
        setListRows([]);
        setNextCursor(null);
        return;
      }

      const data = (await response.json()) as AssistantAuditListResponse;
      setListRows(Array.isArray(data.rows) ? data.rows : []);
      setNextCursor(data.next_cursor || null);
      setCurrentCursor(cursor ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setListError(message);
      setListRows([]);
      setNextCursor(null);
    } finally {
      setListLoading(false);
    }
  };

  const applyFilters = async () => {
    setCursorStack([]);
    await fetchList(null);
  };

  const goNext = async () => {
    if (!nextCursor) return;
    setCursorStack((prev) => [...prev, currentCursor]);
    await fetchList(nextCursor);
  };

  const goPrev = async () => {
    if (cursorStack.length === 0) return;
    const prevCursor = cursorStack[cursorStack.length - 1] ?? null;
    setCursorStack((prev) => prev.slice(0, -1));
    await fetchList(prevCursor);
  };

  const exportCsv = async () => {
    const params = new URLSearchParams();
    params.set("format", "csv");
    params.set("limit", "500");
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (intent) params.set("intent", intent);
    if (status) params.set("status", status);

    const response = await fetch(`/api/admin/audit/assistant?${params.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;
      const message = payload?.message || payload?.error || response.statusText;
      setListError(`Export failed: ${message}`);
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "assistant-audit.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const afterData = state.row?.after_data as Record<string, unknown> | null;
  const retrieval = afterData?.retrieval as Record<string, unknown> | undefined;
  const retrievalDocs = Array.isArray(retrieval?.document_ids)
    ? (retrieval?.document_ids as unknown[])
    : [];
  const citations = Array.isArray(afterData?.citations)
    ? (afterData?.citations as unknown[])
    : [];

  const auditStatus = typeof afterData?.status === "string" ? afterData.status : "n/a";
  const auditIntent = typeof afterData?.intent === "string" ? afterData.intent : "n/a";
  const sqlPathUsed =
    typeof afterData?.sql_path_used === "boolean"
      ? afterData.sql_path_used
      : "n/a";

  const formattedDate = state.row?.created_at
    ? new Date(state.row.created_at).toLocaleString()
    : "n/a";

  const getIntent = (row: AssistantAuditRow) => {
    const after = row.after_data as Record<string, unknown> | null;
    return typeof after?.intent === "string" ? after.intent : "n/a";
  };

  const getStatus = (row: AssistantAuditRow) => {
    const after = row.after_data as Record<string, unknown> | null;
    return typeof after?.status === "string" ? after.status : "n/a";
  };

  const getDocsCount = (row: AssistantAuditRow) => {
    const after = row.after_data as Record<string, unknown> | null;
    const retrieval = after?.retrieval as Record<string, unknown> | undefined;
    return Array.isArray(retrieval?.document_ids)
      ? retrieval?.document_ids.length
      : 0;
  };

  const getCitationsCount = (row: AssistantAuditRow) => {
    const after = row.after_data as Record<string, unknown> | null;
    return Array.isArray(after?.citations) ? after?.citations.length : 0;
  };

  const getSqlPathUsed = (row: AssistantAuditRow) => {
    const after = row.after_data as Record<string, unknown> | null;
    return typeof after?.sql_path_used === "boolean"
      ? after.sql_path_used
      : null;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium text-gray-700">
          Request ID
          <input
            type="text"
            value={requestId}
            onChange={(event) => setRequestId(event.target.value)}
            placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            void fetchAudit();
          }}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          disabled={state.loading}
        >
          {state.loading ? "Fetching..." : "Fetch"}
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-sm font-medium text-gray-700">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Intent
            <select
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="search">search</option>
              <option value="rag">rag</option>
              <option value="sum">sum</option>
              <option value="single_qa">single_qa</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="success">success</option>
              <option value="error">error</option>
              <option value="clarification">clarification</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
            disabled={listLoading}
          >
            {listLoading ? "Loading..." : "Apply Filters"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
            disabled={listLoading}
          >
            Export CSV
          </button>
        </div>

        {listError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {listError}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Created</th>
                <th className="px-4 py-3 text-left font-semibold">Intent</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Docs</th>
                <th className="px-4 py-3 text-left font-semibold">Citations</th>
                <th className="px-4 py-3 text-left font-semibold">SQL Path</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {listRows.length === 0 && !listLoading && (
                <tr>
                  <td className="px-4 py-4 text-gray-500" colSpan={6}>
                    No results.
                  </td>
                </tr>
              )}
              {listRows.map((row) => {
                const sqlPath = getSqlPathUsed(row);
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-blue-50"
                    onClick={() => {
                      fetchAudit(row.id);
                    }}
                  >
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{getIntent(row)}</td>
                    <td className="px-4 py-3 text-gray-700">{getStatus(row)}</td>
                    <td className="px-4 py-3 text-gray-700">{getDocsCount(row)}</td>
                    <td className="px-4 py-3 text-gray-700">{getCitationsCount(row)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {sqlPath === null ? "n/a" : sqlPath ? "true" : "false"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
            disabled={listLoading || cursorStack.length === 0}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
            disabled={listLoading || !nextCursor}
          >
            Next
          </button>
        </div>
      </div>

      {state.error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state.row && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Created</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{formattedDate}</p>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Actor</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{state.row.actor}</p>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {String(auditStatus)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Intent</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {String(auditIntent)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Retrieved Docs</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {retrievalDocs.length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Citations</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {citations.length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">SQL Path Used</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {typeof sqlPathUsed === "boolean" ? (sqlPathUsed ? "true" : "false") : "n/a"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Matches</p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {state.rowCount > 1 ? `${state.rowCount} rows` : "1 row"}
              </p>
            </div>
          </div>

          <details className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">
              Raw JSON (sanitized)
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-white p-4 text-xs text-gray-800">
              {JSON.stringify(state.row, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
