// Classification
export { classifyDocument } from "./classify-document.js";
export type { DocumentType, ClassificationResult } from "./document-types.js";
export { DOCUMENT_TYPE_DESCRIPTIONS, isValidDocumentType } from "./document-types.js";

// Document router
export { extractDocument, getExtractionConfidence, getExtractionRawResponse } from "./extract-document.js";
export type { DocumentExtraction } from "./extract-document.js";

// Individual extractors
export { extractInvoiceWithGemini } from "./extract-invoice.js";
export { extractBankStatement } from "./extract-bank-statement.js";
export { extractReceipt } from "./extract-receipt.js";
export { extractContract } from "./extract-contract.js";
export { extractTaxForm } from "./extract-tax-form.js";
export { extractCorrespondence } from "./extract-correspondence.js";

// Types
export type { InvoiceExtraction, LineItem, GeminiInvoiceResponse } from "./types.js";
export type { BankStatementExtraction, Transaction } from "./extract-bank-statement.js";
export type { ReceiptExtraction, ReceiptItem } from "./extract-receipt.js";
export type { ContractExtraction, Party, KeyTerm } from "./extract-contract.js";
export type { TaxFormExtraction } from "./extract-tax-form.js";
export type { CorrespondenceExtraction, ActionItem } from "./extract-correspondence.js";
