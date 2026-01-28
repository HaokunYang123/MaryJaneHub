// Classification
export { classifyDocument } from "./classify-document";
export type { DocumentType, ClassificationResult } from "./document-types";
export { DOCUMENT_TYPE_DESCRIPTIONS, isValidDocumentType } from "./document-types";

// Embeddings
export { generateEmbedding, generateEmbeddingsBatch } from "./embeddings";
export type { EmbeddingResult, EmbeddingError, EmbeddingResponse } from "./embeddings";

// Document router
export { extractDocument, getExtractionConfidence, getExtractionRawResponse } from "./extract-document";
export type { DocumentExtraction } from "./extract-document";

// Individual extractors
export { extractInvoiceWithGemini } from "./extract-invoice";
export { extractBankStatement } from "./extract-bank-statement";
export { extractReceipt } from "./extract-receipt";
export { extractContract } from "./extract-contract";
export { extractTaxForm } from "./extract-tax-form";
export { extractCorrespondence } from "./extract-correspondence";

// Types
export type { InvoiceExtraction, LineItem, GeminiInvoiceResponse } from "./types";
export type { BankStatementExtraction, Transaction } from "./extract-bank-statement";
export type { ReceiptExtraction, ReceiptItem } from "./extract-receipt";
export type { ContractExtraction, Party, KeyTerm } from "./extract-contract";
export type { TaxFormExtraction } from "./extract-tax-form";
export type { CorrespondenceExtraction, ActionItem } from "./extract-correspondence";
