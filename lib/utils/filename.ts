import type { InvoiceExtraction } from "../gemini/types.js";
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
function formatAmountForFilename(amount: number | null): string {
  if (amount === null || isNaN(amount)) {
    return "$0.00";
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Get date string in YYYY-MM-DD format
 */
function getDateString(dateStr: string | null): string {
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
 * Generate a clean, descriptive filename from invoice extraction
 *
 * Format: YYYY-MM-DD_Vendor_$Amount.ext
 * Example: 2016-01-25_SlicedInvoices_$93.50.pdf
 *
 * If extraction failed: YYYY-MM-DD_UNKNOWN_originalname.ext
 */
export function generateCleanFilename(
  extraction: InvoiceExtraction,
  originalName: string
): string {
  const extension = getExtension(originalName);
  const dateStr = getDateString(extraction.invoice_date);

  // Check if we have meaningful extraction data
  const hasVendor = extraction.vendor && extraction.vendor.trim().length > 0;
  const hasAmount = extraction.total !== null && !isNaN(extraction.total);

  if (!hasVendor && !hasAmount) {
    // Extraction failed or produced no useful data
    const sanitizedOriginal = sanitizeForFilename(
      originalName.replace(/\.[^/.]+$/, ""), // Remove extension
      40
    );
    return `${dateStr}_UNKNOWN_${sanitizedOriginal}${extension}`;
  }

  const vendor = hasVendor
    ? sanitizeForFilename(extraction.vendor!)
    : "UnknownVendor";

  const amount = formatAmountForFilename(extraction.total);

  return `${dateStr}_${vendor}_${amount}${extension}`;
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
