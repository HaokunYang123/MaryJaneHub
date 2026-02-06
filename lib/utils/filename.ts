import type { DocumentExtraction } from "../gemini/extract-document";
import type { DocumentType } from "../gemini/document-types";
import { extname } from "path";

/**
 * Document type prefixes for filenames
 * Makes it easy for lawyers and accountants to identify document types at a glance
 */
const TYPE_PREFIX: Record<DocumentType | "unknown", string> = {
  invoice: "INVOICE",
  receipt: "RECEIPT",
  bank_statement: "BANK-STMT",
  contract: "CONTRACT",
  tax_form: "TAX-FORM",
  correspondence: "CORRESPONDENCE",
  other: "DOC",
  unknown: "DOC",
};

/**
 * Document types that typically don't have monetary amounts
 */
const NON_FINANCIAL_TYPES: DocumentType[] = ["contract", "correspondence", "tax_form"];

/**
 * Sanitize a string for use in a filename
 * - Remove special characters
 * - Convert spaces to underscores
 * - Limit length
 */
function sanitizeForFilename(str: string, maxLength = 30): string {
  return str
    .replace(/[^a-zA-Z0-9\s]/g, "") // Remove special chars
    .replace(/\s+/g, "_") // Spaces to underscores
    .replace(/_+/g, "_") // Multiple underscores to single
    .replace(/^_|_$/g, "") // Trim leading/trailing underscores
    .slice(0, maxLength);
}

/**
 * Format a number as currency string for filename
 * Example: 93.5 -> "USD93.50"
 */
function formatAmountForFilename(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "";
  }
  return `USD${amount.toFixed(2)}`;
}

/**
 * Get date string in YYYY-MM-DD format
 * Returns null if no valid date found (caller decides how to handle)
 */
function getDateString(dateStr: string | null | undefined): string | null {
  if (dateStr) {
    // If it's already in ISO format (YYYY-MM-DD), use it
    const match = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) {
      return match[0];
    }
    // Try to parse other date formats
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

/**
 * Get today's date as YYYY-MM-DD
 */
function getTodayString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get file extension from original filename
 */
function getExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return ext || ".pdf"; // Default to .pdf if no extension
}

/**
 * Extract naming info from different document types
 */
function getFilenameInfo(extraction: DocumentExtraction): {
  name: string | null;
  date: string | null;
  amount: number | null;
  reference: string | null; // Invoice number, account suffix, form type, etc.
  extraInfo: string | null; // For additional context (e.g., period for bank statements)
} {
  switch (extraction.type) {
    case "invoice": {
      const d = extraction.data;
      return {
        name: d.vendor,
        date: d.invoice_date,
        amount: d.total,
        reference: d.invoice_number ? sanitizeForFilename(d.invoice_number, 20) : null,
        extraInfo: null,
      };
    }
    case "receipt": {
      const d = extraction.data as {
        merchant_name?: string | null;
        vendor?: string | null; // Fallback for reclassified invoices
        date?: string | null;
        invoice_date?: string | null; // Fallback for reclassified invoices
        total?: number | null;
      };
      return {
        name: d.merchant_name || d.vendor || null,
        date: d.date || d.invoice_date || null,
        amount: d.total ?? null,
        reference: null,
        extraInfo: null,
      };
    }
    case "bank_statement": {
      const d = extraction.data;
      // Create period info like "Jan2024"
      let periodInfo: string | null = null;
      if (d.statement_period_end) {
        const endDate = new Date(d.statement_period_end);
        if (!isNaN(endDate.getTime())) {
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          periodInfo = `${months[endDate.getMonth()]}${endDate.getFullYear()}`;
        }
      }
      return {
        name: d.bank_name,
        date: d.statement_period_end,
        amount: null, // Don't show balance in filename
        reference: d.account_number_last4
          ? sanitizeForFilename(`ACCT${d.account_number_last4}`, 12)
          : null,
        extraInfo: periodInfo,
      };
    }
    case "contract": {
      const d = extraction.data;
      return {
        name: d.parties?.[0]?.name || null,
        date: d.effective_date,
        amount: null, // Don't show contract value in filename
        reference: null,
        extraInfo: null,
      };
    }
    case "tax_form": {
      const d = extraction.data;
      // Include form type like "W2" or "1099"
      const formType = d.form_type ? sanitizeForFilename(d.form_type, 10) : null;
      return {
        name: d.entity_name,
        date: d.tax_year ? `${d.tax_year}-01-01` : null,
        amount: null, // Don't show income in filename
        reference: formType,
        extraInfo: null,
      };
    }
    case "correspondence": {
      const d = extraction.data;
      return {
        name: d.sender_organization || d.sender,
        date: d.date,
        amount: null,
        reference: null,
        extraInfo: null,
      };
    }
    case "other":
    default: {
      const d = extraction.data;
      return {
        name: d.vendor,
        date: d.invoice_date,
        amount: d.total,
        reference: d.invoice_number ? sanitizeForFilename(d.invoice_number, 20) : null,
        extraInfo: null,
      };
    }
  }
}

/**
 * Generate a clean, descriptive filename from document extraction
 *
 * Format: DATE_TYPE_VENDOR_REFERENCE_EXTRA_AMOUNT.ext
 *
 * Examples:
 * - Receipt:        2019-05-03_RECEIPT_Primo_Family_Restaurant_USD52.47.jpg
 * - Invoice:        2026-01-15_INVOICE_CoolAir_HVAC_Services_INV2048_USD400.00.pdf
 * - Contract:       2024-03-15_CONTRACT_ABC_Property_LLC.pdf
 * - Bank Statement: 2024-01-31_BANK-STMT_Chase_Business_ACCT9876_Jan2024.pdf
 * - Tax Form:       2024-02-15_TAX-FORM_Acme_Corp_W2.pdf
 * - Correspondence: 2024-06-01_CORRESPONDENCE_IRS_Notice.pdf
 * - Unknown:        2024-06-01_DOC_Unknown_Vendor.pdf
 *
 * Edge cases:
 * - No date: Uses UNDATED prefix
 * - No vendor: Uses "Unknown_Vendor"
 * - No amount (for non-financial): Omits amount
 */
export function generateCleanFilename(
  extraction: DocumentExtraction,
  originalName: string,
  documentTypeOverride?: DocumentType
): string {
  const extension = getExtension(originalName);
  const info = getFilenameInfo(extraction);
  // Use override if provided (from database), otherwise fall back to extraction.type
  const docType = documentTypeOverride || extraction.type || "other";

  // Get type prefix
  const typePrefix = TYPE_PREFIX[docType as keyof typeof TYPE_PREFIX] || TYPE_PREFIX.unknown;

  // Get date (or UNDATED)
  const dateStr = getDateString(info.date) || "UNDATED";

  // Get vendor/source name
  const hasName = info.name && info.name.trim().length > 0;
  const name = hasName ? sanitizeForFilename(info.name!) : "Unknown_Vendor";

  // Build filename parts
  const parts: string[] = [dateStr, typePrefix, name];

  // Add stable references where available (invoice number, account suffix, form type)
  if (info.reference) {
    parts.push(info.reference);
  }

  // Add extra info if available (e.g., period for bank statements, form type for tax)
  if (info.extraInfo) {
    parts.push(info.extraInfo);
  }

  // Add amount for financial documents (receipts, invoices)
  const isFinancialDoc = !NON_FINANCIAL_TYPES.includes(docType as DocumentType);
  if (isFinancialDoc && info.amount !== null && !isNaN(info.amount)) {
    parts.push(formatAmountForFilename(info.amount));
  }

  // Join parts and add extension
  return parts.join("_") + extension;
}

/**
 * Generate a unique filename by adding a counter suffix if needed
 */
export function makeFilenameUnique(
  filename: string,
  existingNames: string[]
): string {
  if (!existingNames.includes(filename)) {
    return filename;
  }

  const extension = getExtension(filename);
  const baseName = filename.slice(0, -extension.length);

  let counter = 1;
  let newName = `${baseName}_${counter}${extension}`;

  while (existingNames.includes(newName)) {
    counter++;
    newName = `${baseName}_${counter}${extension}`;
  }

  return newName;
}

/**
 * Append _NEEDS_REVIEW before the extension (deduped).
 */
export function appendNeedsReviewSuffix(filename: string): string {
  const extension = getExtension(filename);
  const baseName = filename.slice(0, -extension.length);
  const normalizedBase = baseName.replace(/(_NEEDS_REVIEW)+$/g, "_NEEDS_REVIEW");
  const finalBase = normalizedBase.endsWith("_NEEDS_REVIEW")
    ? normalizedBase
    : `${normalizedBase}_NEEDS_REVIEW`;
  return `${finalBase}${extension}`;
}
