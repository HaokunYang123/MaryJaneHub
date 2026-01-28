import type { InvoiceExtraction } from "../gemini/types";
import type { QBBillInput } from "./types";

/**
 * Default expense account ID for bills
 * This should be configured per-company or selected by user
 */
const DEFAULT_EXPENSE_ACCOUNT_ID = "1"; // Placeholder - should be configured

/**
 * Convert extracted invoice data to QuickBooks Bill format
 *
 * @param invoice - Extracted invoice data from Gemini
 * @param vendorId - QuickBooks Vendor ID (must be looked up/created first)
 * @param vendorName - Optional vendor name for reference
 * @param expenseAccountId - QuickBooks Account ID for expenses (defaults to configured account)
 * @returns QBBillInput ready for createBill API
 */
export function convertInvoiceToBill(
  invoice: InvoiceExtraction,
  vendorId: string,
  vendorName?: string,
  expenseAccountId: string = DEFAULT_EXPENSE_ACCOUNT_ID
): QBBillInput {
  // Format date from various formats to YYYY-MM-DD
  const formatDate = (dateStr: string | null): string | undefined => {
    if (!dateStr) return undefined;

    // If already in YYYY-MM-DD format, return as-is
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return isoMatch[0];
    }

    // Try to parse and format
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    } catch {
      // Fall through
    }

    return undefined;
  };

  // Build line items from invoice
  const lines: QBBillInput["lines"] = [];

  if (invoice.line_items && invoice.line_items.length > 0) {
    // Use individual line items
    for (const item of invoice.line_items) {
      if (item.amount !== null && item.amount > 0) {
        lines.push({
          amount: item.amount,
          description: buildLineDescription(item),
          accountId: expenseAccountId,
        });
      }
    }
  }

  // If no line items or all amounts were null, create single line with total
  if (lines.length === 0 && invoice.total !== null && invoice.total > 0) {
    lines.push({
      amount: invoice.total,
      description: `Invoice ${invoice.invoice_number || ""}`.trim(),
      accountId: expenseAccountId,
    });
  }

  // Handle tax as separate line if present
  if (invoice.tax !== null && invoice.tax > 0) {
    lines.push({
      amount: invoice.tax,
      description: "Tax",
      accountId: expenseAccountId, // Could use separate tax account
    });
  }

  return {
    vendorId,
    vendorName: vendorName || invoice.vendor || undefined,
    txnDate: formatDate(invoice.invoice_date),
    dueDate: formatDate(invoice.due_date),
    docNumber: invoice.invoice_number || undefined,
    lines,
    privateNote: `Imported from document processing pipeline`,
  };
}

/**
 * Build description for a line item
 */
function buildLineDescription(item: {
  description: string;
  quantity: number | null;
  unit_price: number | null;
}): string {
  const parts: string[] = [];

  if (item.description) {
    parts.push(item.description);
  }

  if (item.quantity !== null && item.unit_price !== null) {
    parts.push(`(${item.quantity} x $${item.unit_price.toFixed(2)})`);
  } else if (item.quantity !== null) {
    parts.push(`(Qty: ${item.quantity})`);
  }

  return parts.join(" ") || "Line item";
}

/**
 * Validate that an invoice has enough data to create a bill
 */
export function canConvertToBill(invoice: InvoiceExtraction): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!invoice.vendor) {
    errors.push("Missing vendor name");
  }

  const hasLineAmounts = invoice.line_items?.some(
    (item) => item.amount !== null && item.amount > 0
  );
  const hasTotal = invoice.total !== null && invoice.total > 0;

  if (!hasLineAmounts && !hasTotal) {
    errors.push("No amounts found (need line items with amounts or total)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate expected total from line items for validation
 */
export function calculateLineItemsTotal(invoice: InvoiceExtraction): number {
  let total = 0;

  if (invoice.line_items) {
    for (const item of invoice.line_items) {
      if (item.amount !== null) {
        total += item.amount;
      }
    }
  }

  if (invoice.tax !== null) {
    total += invoice.tax;
  }

  return total;
}
