/**
 * Represents a single cell in a detected table
 */
export interface TableCell {
  text: string;
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  confidence: number;
}

/**
 * Represents a row in a detected table
 */
export interface TableRow {
  cells: TableCell[];
}

/**
 * Represents a table detected in the document
 */
export interface DetectedTable {
  pageNumber: number;
  headerRows: TableRow[];
  bodyRows: TableRow[];
  rowCount: number;
  columnCount: number;
}

/**
 * Successful result from Document AI OCR
 */
export interface DocumentAISuccess {
  success: true;
  rawText: string;
  tables: DetectedTable[];
  confidence: number;
  pages: number;
}

/**
 * Error result from Document AI OCR
 */
export interface DocumentAIError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Result type returned by extractWithDocumentAI
 */
export type DocumentAIResult = DocumentAISuccess | DocumentAIError;

/**
 * Configuration for Document AI processor
 */
export interface DocumentAIConfig {
  projectId: string;
  processorId: string;
  location: string;
}
