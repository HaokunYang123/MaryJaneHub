import type { DocumentType } from "./document-types.js";
import type { InvoiceExtraction } from "./types.js";
import type { BankStatementExtraction } from "./extract-bank-statement.js";
import type { ReceiptExtraction } from "./extract-receipt.js";
import type { ContractExtraction } from "./extract-contract.js";
import type { TaxFormExtraction } from "./extract-tax-form.js";
import type { CorrespondenceExtraction } from "./extract-correspondence.js";

import { extractInvoiceWithGemini } from "./extract-invoice.js";
import { extractBankStatement } from "./extract-bank-statement.js";
import { extractReceipt } from "./extract-receipt.js";
import { extractContract } from "./extract-contract.js";
import { extractTaxForm } from "./extract-tax-form.js";
import { extractCorrespondence } from "./extract-correspondence.js";

/**
 * Union type of all possible extraction results
 */
export type DocumentExtraction =
  | { type: "invoice"; data: InvoiceExtraction }
  | { type: "bank_statement"; data: BankStatementExtraction }
  | { type: "receipt"; data: ReceiptExtraction }
  | { type: "contract"; data: ContractExtraction }
  | { type: "tax_form"; data: TaxFormExtraction }
  | { type: "correspondence"; data: CorrespondenceExtraction }
  | { type: "other"; data: InvoiceExtraction }; // Default to invoice extraction for "other"

/**
 * Extract structured data from a document based on its type
 *
 * @param documentType - The classified document type
 * @param rawText - The raw OCR text from the document
 * @returns Promise resolving to DocumentExtraction with type-specific data
 */
export async function extractDocument(
  documentType: DocumentType,
  rawText: string
): Promise<DocumentExtraction> {
  switch (documentType) {
    case "invoice":
      return {
        type: "invoice",
        data: await extractInvoiceWithGemini(rawText),
      };

    case "bank_statement":
      return {
        type: "bank_statement",
        data: await extractBankStatement(rawText),
      };

    case "receipt":
      return {
        type: "receipt",
        data: await extractReceipt(rawText),
      };

    case "contract":
      return {
        type: "contract",
        data: await extractContract(rawText),
      };

    case "tax_form":
      return {
        type: "tax_form",
        data: await extractTaxForm(rawText),
      };

    case "correspondence":
      return {
        type: "correspondence",
        data: await extractCorrespondence(rawText),
      };

    case "other":
    default:
      // Default to invoice extraction for unknown types
      // This provides a reasonable fallback with vendor/total fields
      return {
        type: "other",
        data: await extractInvoiceWithGemini(rawText),
      };
  }
}

/**
 * Get the confidence score from any extraction result
 */
export function getExtractionConfidence(extraction: DocumentExtraction): number {
  return extraction.data.confidence;
}

/**
 * Get the raw response from any extraction result
 */
export function getExtractionRawResponse(extraction: DocumentExtraction): string {
  return extraction.data.raw_response;
}
