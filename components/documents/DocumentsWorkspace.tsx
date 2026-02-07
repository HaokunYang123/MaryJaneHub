"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAiRail } from "@/components/layout/AiRailProvider";
import type { FactPair, SourceContext } from "@/components/layout/ai-rail-types";

type SyncStatus =
  | "pending_review"
  | "needs_attention"
  | "approved"
  | "auto_approved"
  | "synced"
  | "error"
  | "rejected"
  | "not_applicable";

type RecentDocument = {
  id: string;
  file_name: string;
  document_type: string | null;
  sync_status: SyncStatus;
  confidence_score: number | null;
  extraction_confidence: number | null;
  created_at: string;
};

type DocumentsApiResponse = {
  success: boolean;
  data?: {
    documents: RecentDocument[];
    total: number;
    limit: number;
    offset: number;
  };
  error?: string;
};

type DocumentDetail = {
  id: string;
  file_name: string;
  mime_type: string | null;
  document_type: string | null;
  sync_status: SyncStatus;
  confidence_score: number | null;
  extraction_confidence: number | null;
  created_at: string;
  raw_text: string | null;
  extraction: Record<string, unknown> | null;
};

type DocumentDetailApiResponse = {
  success: boolean;
  data?: DocumentDetail;
  error?: string;
};

type PreviewAsset = {
  source: "gcs" | "drive";
  fileName: string;
  mimeType: string | null;
  url: string;
  expiresAt: string | null;
};

type PreviewApiResponse = {
  success: boolean;
  data?: PreviewAsset;
  error?: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  return `${Math.round(value * 100)}%`;
}

function statusClasses(status: SyncStatus): string {
  if (status === "synced") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "approved" || status === "auto_approved") {
    return "bg-green-50 text-green-700 border-green-200";
  }
  if (status === "pending_review" || status === "needs_attention") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (status === "error" || status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function isPdfMime(mimeType: string | null | undefined): boolean {
  return (mimeType || "").toLowerCase().includes("pdf");
}

function isImageMime(mimeType: string | null | undefined): boolean {
  return (mimeType || "").toLowerCase().startsWith("image/");
}

function getExtractionData(extraction?: Record<string, unknown> | null): Record<string, unknown> {
  if (!extraction) return {};
  const nested = extraction.data;
  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }
  return extraction;
}

function toDisplay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function getResultFacts(extraction?: Record<string, unknown> | null): FactPair[] {
  const data = getExtractionData(extraction);
  const candidates: Array<{ key: string; label: string }> = [
    { key: "invoice_number", label: "Invoice #" },
    { key: "date", label: "Date" },
    { key: "invoice_date", label: "Invoice Date" },
    { key: "vendor", label: "Vendor" },
    { key: "merchant_name", label: "Merchant" },
    { key: "bill_to", label: "Bill To" },
    { key: "description", label: "Description" },
    { key: "total", label: "Total Amount" },
    { key: "amount", label: "Amount" },
  ];

  const output: FactPair[] = [];
  for (const candidate of candidates) {
    const value = toDisplay(data[candidate.key]);
    if (!value) continue;
    if (output.some((item) => item.label === candidate.label)) continue;
    output.push({ label: candidate.label, value });
    if (output.length >= 6) break;
  }
  return output;
}

function buildPdfPreviewUrl(url: string, page: number | null, token: string | null): string {
  const hashParts: string[] = [];
  if (page && Number.isFinite(page) && page > 0) {
    hashParts.push(`page=${Math.trunc(page)}`);
  }
  if (token && token.trim().length > 0) {
    hashParts.push(`search=${encodeURIComponent(token.trim())}`);
  }

  if (hashParts.length === 0) return url;
  const [base] = url.split("#");
  return `${base}#${hashParts.join("&")}`;
}

function renderTextWithHighlight(text: string, token: string | null): ReactNode {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "No OCR text available.";

  const excerptSize = 2600;
  if (!token) return clean.slice(0, excerptSize);

  const needle = token.toLowerCase();
  const haystack = clean.toLowerCase();
  const hit = haystack.indexOf(needle);

  if (hit < 0) return clean.slice(0, excerptSize);

  const start = Math.max(0, hit - 650);
  const end = Math.min(clean.length, hit + needle.length + 1200);
  const snippet = clean.slice(start, end);
  const localHit = snippet.toLowerCase().indexOf(needle);
  const prefix = snippet.slice(0, localHit);
  const match = snippet.slice(localHit, localHit + needle.length);
  const suffix = snippet.slice(localHit + needle.length);

  return (
    <>
      {start > 0 ? "... " : ""}
      {prefix}
      <mark className="rounded bg-amber-200 px-1 text-slate-900">{match}</mark>
      {suffix}
      {end < clean.length ? " ..." : ""}
    </>
  );
}

function parsePage(pageParam: string | null): number | null {
  if (!pageParam) return null;
  const parsed = Number(pageParam);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

export default function DocumentsWorkspace() {
  const searchParams = useSearchParams();
  const { registerPreviewHandler } = useAiRail();

  const [documents, setDocuments] = useState<RecentDocument[]>([]);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [previewAsset, setPreviewAsset] = useState<PreviewAsset | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<"file" | "text">("file");
  const [activeContext, setActiveContext] = useState<SourceContext | null>(null);

  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const documentFacts = useMemo(
    () => getResultFacts(selectedDocument?.extraction || null),
    [selectedDocument]
  );

  const highlightToken = activeContext?.token || null;
  const previewPage = activeContext?.page || null;

  const pdfPreviewUrl = useMemo(() => {
    if (!previewAsset) return null;
    if (!isPdfMime(previewAsset.mimeType)) return previewAsset.url;
    return buildPdfPreviewUrl(previewAsset.url, previewPage, highlightToken);
  }, [previewAsset, previewPage, highlightToken]);

  const stats = useMemo(() => {
    const pending = documents.filter(
      (doc) => doc.sync_status === "pending_review" || doc.sync_status === "needs_attention"
    ).length;
    const approved = documents.filter(
      (doc) => doc.sync_status === "approved" || doc.sync_status === "auto_approved"
    ).length;
    return { pending, approved };
  }, [documents]);

  async function loadDocuments(): Promise<void> {
    setDocumentsLoading(true);
    setDocumentsError(null);

    try {
      const response = await fetch("/api/documents?limit=25", { cache: "no-store" });
      const payload = (await response.json()) as DocumentsApiResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Failed to load documents.");
      }

      setDocuments(payload.data.documents);
      setTotalDocuments(payload.data.total);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load documents.";
      setDocumentsError(message);
    } finally {
      setDocumentsLoading(false);
    }
  }

  const openPreview = useCallback((documentId: string, context: SourceContext | null): void => {
    setSelectedDocumentId(documentId);
    setPreviewOpen(true);
    setPreviewTab("file");
    setActiveContext(context);
  }, []);

  const openFromRecent = useCallback(
    (documentId: string): void => {
      openPreview(documentId, null);
    },
    [openPreview]
  );

  useEffect(() => {
    void loadDocuments();
  }, []);

  useEffect(() => {
    registerPreviewHandler(openPreview);
    return () => {
      registerPreviewHandler(null);
    };
  }, [openPreview, registerPreviewHandler]);

  const docParam = searchParams.get("doc");
  const queryParam = searchParams.get("q");
  const tokenParam = searchParams.get("token");
  const pageParam = searchParams.get("page");

  useEffect(() => {
    if (!docParam) return;

    const page = parsePage(pageParam);
    const hasContext = Boolean(queryParam || tokenParam || page);
    const context: SourceContext | null = hasContext
      ? {
          query: queryParam || "Linked source",
          fileName: "",
          quote: null,
          token: tokenParam || null,
          page,
          coords: null,
          facts: [],
        }
      : null;

    openPreview(docParam, context);
  }, [docParam, openPreview, pageParam, queryParam, tokenParam]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setSelectedDocument(null);
      setPreviewAsset(null);
      setDetailError(null);
      setPreviewError(null);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);
    setPreviewLoading(true);
    setDetailError(null);
    setPreviewError(null);

    const load = async (): Promise<void> => {
      try {
        const detailPromise = fetch(`/api/documents/${selectedDocumentId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const previewPromise = fetch(`/api/documents/${selectedDocumentId}/preview`, {
          cache: "no-store",
          signal: controller.signal,
        });

        const [detailResponse, previewResponse] = await Promise.all([detailPromise, previewPromise]);

        const detailPayload = (await detailResponse.json()) as DocumentDetailApiResponse;
        if (!detailResponse.ok || !detailPayload.success || !detailPayload.data) {
          throw new Error(detailPayload.error || "Failed to load document details.");
        }

        const previewPayload = (await previewResponse.json()) as PreviewApiResponse;
        if (!previewResponse.ok || !previewPayload.success || !previewPayload.data) {
          throw new Error(previewPayload.error || "Failed to load file preview.");
        }

        if (controller.signal.aborted) return;
        setSelectedDocument(detailPayload.data);
        setPreviewAsset(previewPayload.data);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Failed to load document preview.";
        setSelectedDocument(null);
        setPreviewAsset(null);
        setDetailError(message);
        setPreviewError(message);
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
          setPreviewLoading(false);
        }
      }
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [selectedDocumentId]);

  function handleDropFiles(fileList: FileList | null): void {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    setStagedFiles((prev) => [...incoming, ...prev].slice(0, 8));
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Documents</h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload staging, recent files, and right-side file preview linked from the always-on AI rail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
            Total {totalDocuments}
          </span>
          <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            Needs Review {stats.pending}
          </span>
          <span className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
            Ready {stats.approved}
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative flex h-[calc(100vh-220px)] min-h-[650px]">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-slate-200 p-4">
              <div
                className={`rounded-xl border-2 border-dashed p-6 transition-colors ${
                  dragActive
                    ? "border-[var(--brand-green)] bg-emerald-50"
                    : "border-slate-300 bg-slate-50"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  handleDropFiles(event.dataTransfer.files);
                }}
              >
                <div className="flex flex-col items-center text-center">
                  <span className="material-symbols-outlined text-5xl text-[var(--brand-green)]">
                    upload_file
                  </span>
                  <h2 className="mt-2 text-xl font-bold text-slate-900">Upload Files</h2>
                  <p className="mt-1 max-w-xl text-sm text-slate-600">
                    Drag files here or select local files to stage. Ingestion still runs via the current
                    Drive inbox backend pipeline.
                  </p>
                  <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--brand-green)] px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:opacity-90">
                    <span className="material-symbols-outlined text-base">folder_open</span>
                    Select Files
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.doc,.docx"
                      onChange={(event) => handleDropFiles(event.target.files)}
                    />
                  </label>
                </div>
              </div>

              {stagedFiles.length > 0 ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Staged Local Files
                    </p>
                    <button
                      type="button"
                      onClick={() => setStagedFiles([])}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {stagedFiles.map((file) => (
                      <span
                        key={`${file.name}-${file.lastModified}`}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                      >
                        {file.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h3 className="text-base font-bold text-slate-900">Recent Files</h3>
                <button
                  type="button"
                  onClick={() => void loadDocuments()}
                  disabled={documentsLoading}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">refresh</span>
                  Refresh
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {documentsLoading && documents.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Loading documents...
                  </p>
                ) : null}

                {documentsError ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {documentsError}
                  </p>
                ) : null}

                {!documentsLoading && !documentsError && documents.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    No documents found.
                  </p>
                ) : null}

                <div className="space-y-2">
                  {documents.map((doc) => {
                    const active = doc.id === selectedDocumentId;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => openFromRecent(doc.id)}
                        className={`w-full rounded-xl border p-3 text-left transition-all duration-200 ${
                          active
                            ? "border-[var(--brand-green)] bg-emerald-50"
                            : "border-slate-200 bg-white hover:-translate-y-0.5 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                            {doc.file_name}
                          </p>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClasses(
                              doc.sync_status
                            )}`}
                          >
                            {doc.sync_status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{doc.document_type || "other"}</span>
                          <span>•</span>
                          <span>Confidence {formatPercent(doc.confidence_score ?? doc.extraction_confidence)}</span>
                          <span>•</span>
                          <span>{formatDate(doc.created_at)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {selectedDocumentId ? (
            <>
              <button
                type="button"
                onClick={() => setPreviewOpen((prev) => !prev)}
                className="absolute top-3 z-30 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-100"
                style={{ right: "8px" }}
                aria-label={previewOpen ? "Collapse preview panel" : "Open preview panel"}
              >
                <span className="material-symbols-outlined text-base">
                  {previewOpen ? "chevron_right" : "chevron_left"}
                </span>
              </button>

              <aside
                className={`absolute inset-y-0 z-30 flex w-[min(44vw,680px)] min-w-[400px] max-w-[75vw] flex-col border-l border-slate-200 bg-slate-50 shadow-2xl transition-transform duration-300 ${
                  previewOpen ? "translate-x-0" : "pointer-events-none translate-x-full"
                }`}
                style={{ right: "0px" }}
              >
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">File Preview</p>
                    <p className="max-w-[420px] truncate text-xs text-slate-500">
                      {selectedDocument?.file_name || activeContext?.fileName || "Select a source file"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(false)}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
                    aria-label="Collapse preview panel"
                  >
                    <span className="material-symbols-outlined text-base">chevron_right</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTab("file")}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      previewTab === "file"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    File
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("text")}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      previewTab === "text"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    OCR Text
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {detailLoading || previewLoading ? (
                    <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                      Loading preview...
                    </p>
                  ) : null}

                  {detailError || previewError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {detailError || previewError}
                    </p>
                  ) : null}

                  {!detailLoading && !previewLoading && !detailError && !previewError ? (
                    <div className="space-y-3">
                      {activeContext ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            AI Focus
                          </p>
                          <p className="mt-1 text-xs text-emerald-700">Query: "{activeContext.query}"</p>
                          {activeContext.quote ? (
                            <p className="mt-2 rounded-md bg-white/70 p-2 text-sm text-slate-800">
                              "{activeContext.quote}"
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-emerald-700">
                            {activeContext.page ? <span>Page {activeContext.page}</span> : null}
                            {activeContext.token ? <span>Token: {activeContext.token}</span> : null}
                          </div>
                          {activeContext.facts.length > 0 ? (
                            <div className="mt-3 grid grid-cols-1 gap-1.5">
                              {activeContext.facts.map((fact) => (
                                <p key={`${fact.label}-${fact.value}`} className="text-xs text-slate-700">
                                  <span className="font-semibold">{fact.label}:</span> {fact.value}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {previewTab === "file" ? (
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-black">
                          {previewAsset && pdfPreviewUrl ? (
                            isImageMime(previewAsset.mimeType) ? (
                              <div className="relative">
                                <img
                                  src={previewAsset.url}
                                  alt={previewAsset.fileName}
                                  className="max-h-[560px] w-full object-contain"
                                />
                                {activeContext?.coords ? (
                                  <div
                                    className="pointer-events-none absolute border-2 border-amber-400 bg-amber-300/25 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]"
                                    style={{
                                      left: `${activeContext.coords.x * 100}%`,
                                      top: `${activeContext.coords.y * 100}%`,
                                      width: `${activeContext.coords.w * 100}%`,
                                      height: `${activeContext.coords.h * 100}%`,
                                    }}
                                  />
                                ) : null}
                              </div>
                            ) : (
                              <iframe
                                key={`${pdfPreviewUrl}-${activeContext?.page || 0}-${activeContext?.token || ""}`}
                                title="Document file preview"
                                src={pdfPreviewUrl}
                                className="h-[560px] w-full border-0"
                              />
                            )
                          ) : (
                            <div className="p-4 text-sm text-slate-300">
                              File preview is unavailable for this document.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            OCR Preview
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                            {renderTextWithHighlight(selectedDocument?.raw_text || "", activeContext?.token || null)}
                          </p>
                        </div>
                      )}

                      {selectedDocument ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                              {selectedDocument.document_type || "other"}
                            </span>
                            <span
                              className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${statusClasses(
                                selectedDocument.sync_status
                              )}`}
                            >
                              {selectedDocument.sync_status.replaceAll("_", " ")}
                            </span>
                            <span className="text-xs text-slate-500">{formatDate(selectedDocument.created_at)}</span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-md bg-slate-50 p-2 text-slate-600">
                              Confidence{" "}
                              <span className="font-semibold text-slate-900">
                                {formatPercent(
                                  selectedDocument.confidence_score ?? selectedDocument.extraction_confidence
                                )}
                              </span>
                            </div>
                            <div className="rounded-md bg-slate-50 p-2 text-slate-600">
                              MIME{" "}
                              <span className="font-semibold text-slate-900">
                                {selectedDocument.mime_type || "unknown"}
                              </span>
                            </div>
                          </div>
                          {documentFacts.length > 0 ? (
                            <div className="mt-3 space-y-1 text-xs">
                              {documentFacts.map((fact) => (
                                <p key={`${fact.label}-${fact.value}`} className="text-slate-700">
                                  <span className="font-semibold">{fact.label}:</span> {fact.value}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </aside>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
