"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfHighlight } from "./pdf-highlights";

type PdfHighlightViewerProps = {
  url: string;
  highlights: PdfHighlight[];
  initialPage: number | null;
  onLoadError: () => void;
  heightClass?: string;
};

// Dynamically import pdf.js (browser-only, avoids SSR issues)
async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

type PageRender = {
  pageNum: number;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

export default function PdfHighlightViewer({
  url,
  highlights,
  initialPage,
  onLoadError,
  heightClass = "h-[calc(100vh-320px)]",
}: PdfHighlightViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageRender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrolledRef = useRef(false);

  // Determine first highlighted page (for auto-scroll)
  const scrollTarget = initialPage ?? (highlights.length > 0 ? highlights[0].page : null);

  const renderPdf = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPages([]);
    scrolledRef.current = false;

    try {
      const pdfjs = await getPdfjs();
      const loadingTask = pdfjs.getDocument({ url, withCredentials: false });
      const pdf = await loadingTask.promise;

      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth || 600;
      const rendered: PageRender[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        // Scale to fit container width with some padding
        const unscaledViewport = page.getViewport({ scale: 1 });
        const scale = (containerWidth - 16) / unscaledViewport.width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * window.devicePixelRatio);
        canvas.height = Math.floor(viewport.height * window.devicePixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;

        rendered.push({
          pageNum: i,
          canvas,
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });
      }

      setPages(rendered);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load PDF";
      setError(msg);
      onLoadError();
    } finally {
      setLoading(false);
    }
  }, [url, onLoadError]);

  useEffect(() => {
    void renderPdf();
  }, [renderPdf]);

  // Auto-scroll to target page after pages render
  useEffect(() => {
    if (scrolledRef.current || !scrollTarget || pages.length === 0) return;
    const el = document.getElementById(`pdf-page-${scrollTarget}`);
    if (el) {
      scrolledRef.current = true;
      // Small delay to let layout settle
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [pages, scrollTarget]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-slate-900 text-sm text-slate-400 ${heightClass}`}>
        <span className="material-symbols-outlined mr-2 animate-spin text-base">progress_activity</span>
        Loading PDF...
      </div>
    );
  }

  if (error) {
    return null; // Parent handles fallback via onLoadError
  }

  return (
    <div
      ref={containerRef}
      className={`${heightClass} overflow-y-auto bg-slate-800`}
    >
      {pages.map((page) => {
        const pageHighlights = highlights.filter((h) => h.page === page.pageNum);
        return (
          <div
            key={page.pageNum}
            id={`pdf-page-${page.pageNum}`}
            className="relative mx-auto mb-3 rounded-md shadow-[0_8px_24px_rgba(15,23,42,0.35)] last:mb-0"
            style={{ width: page.width, height: page.height }}
          >
            <PageCanvas canvas={page.canvas} />
            {pageHighlights.map((hl, idx) => (
              <HighlightOverlay key={`${hl.label}-${idx}`} highlight={hl} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Mounts a pre-rendered canvas element into the DOM */
function PageCanvas({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";
    canvas.style.display = "block";
    container.appendChild(canvas);
    return () => {
      container.innerHTML = "";
    };
  }, [canvas]);

  return <div ref={ref} className="absolute inset-0" />;
}

/** Renders a single highlight overlay div */
function HighlightOverlay({ highlight }: { highlight: PdfHighlight }) {
  const [showLabel, setShowLabel] = useState(false);
  const isMatch = highlight.type === "match";

  return (
    <div
      className={`absolute rounded-sm ${
        isMatch
          ? "animate-pulse border-2 border-yellow-400 bg-yellow-300/35 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]"
          : "border border-amber-300 bg-amber-200/30"
      }`}
      style={{
        left: `${highlight.bbox.x * 100}%`,
        top: `${highlight.bbox.y * 100}%`,
        width: `${highlight.bbox.w * 100}%`,
        height: `${highlight.bbox.h * 100}%`,
        pointerEvents: "auto",
      }}
      onMouseEnter={() => setShowLabel(true)}
      onMouseLeave={() => setShowLabel(false)}
    >
      {showLabel && (
        <span
          className={`absolute -top-6 left-0 z-10 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${
            isMatch
              ? "bg-yellow-400 text-yellow-900"
              : "bg-amber-300 text-amber-900"
          }`}
        >
          {highlight.label}
        </span>
      )}
    </div>
  );
}
