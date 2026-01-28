import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import type { google } from "@google-cloud/documentai/build/protos/protos.js";
import type {
  DocumentAIResult,
  DocumentAIConfig,
  DetectedTable,
  TableRow,
  TableCell,
} from "./types.js";

type IDocument = google.cloud.documentai.v1.IDocument;
type IPage = google.cloud.documentai.v1.Document.IPage;
type ITable = google.cloud.documentai.v1.Document.Page.ITable;
type ITableRow = google.cloud.documentai.v1.Document.Page.Table.ITableRow;
type ITableCell = google.cloud.documentai.v1.Document.Page.Table.ITableCell;
type ILayout = google.cloud.documentai.v1.Document.Page.ILayout;

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

    const client = new DocumentProcessorServiceClient();

    const processorName = `projects/${config.projectId}/locations/${config.location}/processors/${config.processorId}`;

    const request = {
      name: processorName,
      rawDocument: {
        content: fileBuffer.toString("base64"),
        mimeType,
      },
    };

    const [result] = await client.processDocument(request);
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

    return {
      success: true,
      rawText,
      tables,
      confidence,
      pages,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    const errorCode =
      error instanceof Error && "code" in error
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
