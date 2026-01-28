/**
 * Supported document types for classification
 */
export type DocumentType =
  | "invoice"
  | "receipt"
  | "bank_statement"
  | "contract"
  | "tax_form"
  | "correspondence"
  | "other";

/**
 * Result of document classification
 */
export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number; // 0-1
  reasoning: string; // brief explanation
}

/**
 * Descriptions of each document type for the classifier prompt
 */
export const DOCUMENT_TYPE_DESCRIPTIONS: Record<DocumentType, string> = {
  invoice:
    "Bills, invoices, purchase orders - documents requesting payment for goods/services with line items, totals, due dates",
  receipt:
    "Receipts, purchase confirmations - proof of payment already made, showing items purchased and payment method",
  bank_statement:
    "Bank statements, account summaries - financial institution documents showing transactions, balances, account activity",
  contract:
    "Contracts, agreements, leases - legal documents with terms, conditions, signatures, binding obligations",
  tax_form:
    "Tax forms like W9, 1099, W2 - government tax documents with taxpayer information, income reporting",
  correspondence:
    "Letters, emails, notices - general business communication, announcements, notifications",
  other: "Any document that doesn't fit the above categories",
};

/**
 * Check if a string is a valid DocumentType
 */
export function isValidDocumentType(type: string): type is DocumentType {
  return [
    "invoice",
    "receipt",
    "bank_statement",
    "contract",
    "tax_form",
    "correspondence",
    "other",
  ].includes(type);
}
