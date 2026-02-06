import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import type { google } from "@google-cloud/documentai/build/protos/protos.js";
import type {
  DocumentAIResult,
  DocumentAIConfig,
  DetectedTable,
  TableRow,
  TableCell,
  DocumentLayout,
  DocumentLayoutLine,
  DocumentLayoutSegment,
  DocumentLayoutBBox,
} from "./types";

type IDocument = google.cloud.documentai.v1.IDocument;
type IPage = google.cloud.documentai.v1.Document.IPage;
type ITable = google.cloud.documentai.v1.Document.Page.ITable;
type ITableRow = google.cloud.documentai.v1.Document.Page.Table.ITableRow;
type ITableCell = google.cloud.documentai.v1.Document.Page.Table.ITableCell;
type ILayout = google.cloud.documentai.v1.Document.Page.ILayout;
type IDimension = google.cloud.documentai.v1.Document.Page.IDimension;
type IBoundingPoly = google.cloud.documentai.v1.IBoundingPoly;
type IVertex = google.cloud.documentai.v1.IVertex;
type INormalizedVertex = google.cloud.documentai.v1.INormalizedVertex;
type IProcessResponse = google.cloud.documentai.v1.IProcessResponse;
type ProcessDocumentTuple =
  | [IProcessResponse]
  | [IProcessResponse, unknown, unknown];

type DocumentAIClient = {
  processDocument: (request: {
    name: string;
    rawDocument: { content: string; mimeType: string };
  }) => Promise<ProcessDocumentTuple>;
};

let clientOverride: DocumentAIClient | null = null;

export function setDocumentAIClientOverride(client: DocumentAIClient | null): void {
  clientOverride = client;
}

/**
 * Get Document AI configuration from environment variables
 */
function getConfig(): DocumentAIConfig {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID;
  const location = process.env.DOCUMENT_AI_LOCATION || "us";

  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT_ID environment variable is required");
  }
  if (!processorId) {
    throw new Error("DOCUMENT_AI_PROCESSOR_ID environment variable is required");
  }

  return { projectId, processorId, location };
}

function resolveTimeoutMs(): number {
  const raw = process.env.DOCUMENT_AI_TIMEOUT_MS;
  if (!raw) return 60000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 60000;
  return parsed;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Document AI request timed out"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("timed out");
}

/**
 * Extract text content from a Document AI layout
 */
function extractTextFromLayout(
  layout: ILayout | null | undefined,
  fullText: string
): string {
  if (!layout?.textAnchor?.textSegments?.length) {
    return "";
  }

  return layout.textAnchor.textSegments
    .map((segment) => {
      const start = Number(segment.startIndex || 0);
      const end = Number(segment.endIndex || 0);
      return fullText.slice(start, end);
    })
    .join("")
    .trim();
}

function extractSegments(layout: ILayout | null | undefined): DocumentLayoutSegment[] {
  const segments = layout?.textAnchor?.textSegments;
  if (!segments || segments.length === 0) return [];
  return segments
    .map((segment) => ({
      startIndex: Number(segment.startIndex || 0),
      endIndex: Number(segment.endIndex || 0),
    }))
    .filter((segment) => segment.endIndex > segment.startIndex);
}

function normalizeVerticesFromBoundingPoly(
  boundingPoly: IBoundingPoly | null | undefined,
  dimension?: IDimension | null
): INormalizedVertex[] {
  if (!boundingPoly) return [];
  if (boundingPoly.normalizedVertices && boundingPoly.normalizedVertices.length > 0) {
    return boundingPoly.normalizedVertices;
  }

  if (!dimension?.width || !dimension?.height || !boundingPoly.vertices) {
    return [];
  }

  const width = Number(dimension.width);
  const height = Number(dimension.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return [];
  }

  return boundingPoly.vertices
    .filter((vertex): vertex is IVertex => typeof vertex?.x === "number" && typeof vertex?.y === "number")
    .map((vertex) => ({
      x: Math.min(Math.max((vertex.x as number) / width, 0), 1),
      y: Math.min(Math.max((vertex.y as number) / height, 0), 1),
    }));
}

function boundingBoxFromVertices(vertices: INormalizedVertex[]): DocumentLayoutBBox | null {
  if (!vertices.length) return null;
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.max(Math.min(...xs), 0);
  const maxX = Math.min(Math.max(...xs), 1);
  const minY = Math.max(Math.min(...ys), 0);
  const maxY = Math.min(Math.max(...ys), 1);
  const w = Math.max(maxX - minX, 0);
  const h = Math.max(maxY - minY, 0);
  return { x: minX, y: minY, w, h };
}

function parseLayoutLines(page: IPage): DocumentLayoutLine[] {
  if (!page.lines || page.lines.length === 0) return [];

  return page.lines
    .map((line) => {
      const segments = extractSegments(line.layout);
      if (segments.length === 0) return null;
      const vertices = normalizeVerticesFromBoundingPoly(line.layout?.boundingPoly, page.dimension);
      const bbox = boundingBoxFromVertices(vertices);
      return {
        segments,
        bbox,
        confidence: typeof line.layout?.confidence === "number" ? line.layout?.confidence : null,
      } as DocumentLayoutLine;
    })
    .filter(Boolean) as DocumentLayoutLine[];
}

function parseLayout(
  pages: IPage[] | null | undefined
): DocumentLayout | undefined {
  if (!pages || pages.length === 0) return undefined;

  const layoutPages = pages.map((page, index) => {
    const width = page.dimension?.width ? Number(page.dimension.width) : undefined;
    const height = page.dimension?.height ? Number(page.dimension.height) : undefined;
    const unit = page.dimension?.unit ? String(page.dimension.unit) : undefined;
    return {
      pageNumber: page.pageNumber || index + 1,
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined,
      unit,
      lines: parseLayoutLines(page),
    };
  });

  return { pages: layoutPages };
}

/**
 * Parse table cells from Document AI response
 */
function parseTableCells(
  cells: ITableCell[] | null | undefined,
  fullText: string,
  rowIndex: number
): TableCell[] {
  if (!cells) return [];

  return cells.map((cell, columnIndex) => ({
    text: extractTextFromLayout(cell.layout, fullText),
    rowIndex,
    columnIndex,
    rowSpan: cell.rowSpan || 1,
    columnSpan: cell.colSpan || 1,
    confidence: cell.layout?.confidence || 0,
  }));
}

/**
 * Parse table rows from Document AI response
 */
function parseTableRows(
  rows: ITableRow[] | null | undefined,
  fullText: string,
  startRowIndex: number
): TableRow[] {
  if (!rows) return [];

  return rows.map((row, index) => ({
    cells: parseTableCells(row.cells, fullText, startRowIndex + index),
  }));
}

/**
 * Parse tables from Document AI response
 */
function parseTables(
  pages: IPage[] | null | undefined,
  fullText: string
): DetectedTable[] {
  const tables: DetectedTable[] = [];

  if (!pages) return tables;

  pages.forEach((page, pageIndex) => {
    if (!page.tables) return;

    page.tables.forEach((table: ITable) => {
      const headerRows = parseTableRows(table.headerRows, fullText, 0);
      const bodyRows = parseTableRows(
        table.bodyRows,
        fullText,
        headerRows.length
      );

      const rowCount = headerRows.length + bodyRows.length;
      const columnCount = Math.max(
        ...headerRows.map((r) => r.cells.length),
        ...bodyRows.map((r) => r.cells.length),
        0
      );

      tables.push({
        pageNumber: pageIndex + 1,
        headerRows,
        bodyRows,
        rowCount,
        columnCount,
      });
    });
  });

  return tables;
}

/**
 * Calculate overall confidence score from page confidences
 */
function calculateOverallConfidence(
  pages: IPage[] | null | undefined
): number {
  if (!pages?.length) return 0;

  const confidences = pages
    .map((page) => page.layout?.confidence)
    .filter((c): c is number => typeof c === "number");

  if (confidences.length === 0) return 0;

  return confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
}

/**
 * Extract text and tables from a document using Google Document AI
 *
 * @param fileBuffer - The document file as a Buffer
 * @param mimeType - The MIME type of the document (e.g., 'application/pdf')
 * @returns Promise resolving to DocumentAIResult with extracted text and tables
 */
export async function extractWithDocumentAI(
  fileBuffer: Buffer,
  mimeType: string
): Promise<DocumentAIResult> {
  try {
    const config = getConfig();

    const client = clientOverride ?? new DocumentProcessorServiceClient();

    const processorName = `projects/${config.projectId}/locations/${config.location}/processors/${config.processorId}`;

    const request = {
      name: processorName,
      rawDocument: {
        content: fileBuffer.toString("base64"),
        mimeType,
      },
    };

    const timeoutMs = resolveTimeoutMs();
    const [result] = await withTimeout(client.processDocument(request), timeoutMs);
    const document = result.document;

    if (!document) {
      return {
        success: false,
        error: {
          code: "NO_DOCUMENT",
          message: "Document AI returned no document in response",
        },
      };
    }

    const rawText = document.text || "";
    const tables = parseTables(document.pages, rawText);
    const confidence = calculateOverallConfidence(document.pages);
    const pages = document.pages?.length || 0;
    const layout = parseLayout(document.pages);

    return {
      success: true,
      rawText,
      tables,
      confidence,
      pages,
      layout,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    const errorCode =
      isTimeoutError(error)
        ? "TIMEOUT"
        : error instanceof Error && "code" in error
        ? String(error.code)
        : "UNKNOWN_ERROR";

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      },
    };
  }
}
