import type { DocumentExtraction } from "../gemini/extract-document.js";
import { extname } from "path";

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
 * Example: 93.5 -> "$93.50"
 */
function formatAmountForFilename(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "$0.00";
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Get date string in YYYY-MM-DD format
 */
function getDateString(dateStr: string | null | undefined): string {
  if (dateStr) {
    // If it's already in ISO format (YYYY-MM-DD), use it
    const match = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) {
      return match[0];
    }
  }

  // Fall back to today's date
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
} {
  switch (extraction.type) {
    case "invoice": {
      const d = extraction.data;
      return {
        name: d.vendor,
        date: d.invoice_date,
        amount: d.total,
      };
    }
    case "receipt": {
      const d = extraction.data;
      return {
        name: d.merchant_name,
        date: d.date,
        amount: d.total,
      };
    }
    case "bank_statement": {
      const d = extraction.data;
      return {
        name: d.bank_name,
        date: d.statement_period_end,
        amount: d.closing_balance,
      };
    }
    case "contract": {
      const d = extraction.data;
      return {
        name: d.parties?.[0]?.name || null,
        date: d.effective_date,
        amount: d.value,
      };
    }
    case "tax_form": {
      const d = extraction.data;
      return {
        name: d.entity_name,
        date: d.tax_year ? `${d.tax_year}-01-01` : null,
        amount: d.total_income,
      };
    }
    case "correspondence": {
      const d = extraction.data;
      return {
        name: d.sender_organization || d.sender,
        date: d.date,
        amount: null,
      };
    }
    case "other":
    default: {
      const d = extraction.data;
      return {
        name: d.vendor,
        date: d.invoice_date,
        amount: d.total,
      };
    }
  }
}

/**
 * Generate a clean, descriptive filename from document extraction
 *
 * Format: YYYY-MM-DD_Name_$Amount.ext (for financial docs)
 * Format: YYYY-MM-DD_Name_Type.ext (for non-financial docs)
 * Example: 2016-01-25_SlicedInvoices_$93.50.pdf
 *
 * If extraction failed: YYYY-MM-DD_UNKNOWN_originalname.ext
 */
export function generateCleanFilename(
  extraction: DocumentExtraction,
  originalName: string
): string {
  const extension = getExtension(originalName);
  const info = getFilenameInfo(extraction);
  const dateStr = getDateString(info.date);

  // Check if we have meaningful extraction data
  const hasName = info.name && info.name.trim().length > 0;
  const hasAmount = info.amount !== null && !isNaN(info.amount);

  if (!hasName && !hasAmount) {
    // Extraction failed or produced no useful data
    const sanitizedOriginal = sanitizeForFilename(
      originalName.replace(/\.[^/.]+$/, ""), // Remove extension
      40
    );
    return `${dateStr}_UNKNOWN_${sanitizedOriginal}${extension}`;
  }

  const name = hasName
    ? sanitizeForFilename(info.name!)
    : "Unknown";

  // For documents with amounts, include the amount
  if (hasAmount) {
    const amount = formatAmountForFilename(info.amount);
    return `${dateStr}_${name}_${amount}${extension}`;
  }

  // For non-financial documents, include the type
  const docType = extraction.type.replace(/_/g, "");
  return `${dateStr}_${name}_${docType}${extension}`;
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
