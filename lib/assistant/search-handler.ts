/**
 * Search Handler for Assistant
 *
 * Executes document searches and formats results for display.
 */

import { smartSearch, type SmartSearchResult } from "../search/smart-search";
import type { Slots } from "./types";

export interface SearchHandlerResult {
  success: boolean;
  message: string;
  results: SmartSearchResult[];
  count: number;
  processingTimeMs?: number;
}

/**
 * Build a search query string from slots
 */
function buildQueryFromSlots(slots: Slots): string {
  const parts: string[] = [];

  // Add document type
  if (slots.documentType) {
    parts.push(slots.documentType);
  }

  // Add year/date
  if (slots.year) {
    parts.push(String(slots.year));
  } else if (slots.date) {
    parts.push(slots.date);
  } else if (slots.month) {
    const monthNames = ["", "january", "february", "march", "april", "may", "june",
                        "july", "august", "september", "october", "november", "december"];
    parts.push(monthNames[slots.month] || "");
  }

  // Add amount for filtering
  if (slots.amount) {
    parts.push(`$${slots.amount}`);
  }

  // Add vendor/semantic text
  if (slots.vendor) {
    parts.push(slots.vendor);
  } else if (slots.semanticText && slots.semanticText.length > 2) {
    parts.push(slots.semanticText);
  }

  return parts.join(" ").trim() || "documents";
}

/**
 * Format a single search result for display
 */
function formatResult(result: SmartSearchResult, index: number): string {
  const ext = result.extraction as Record<string, unknown>;
  const data = (ext?.data || ext) as Record<string, unknown>;

  // Extract key fields
  const date = (data?.invoice_date || data?.date || "Unknown date") as string;
  const total = data?.total as number | undefined;
  const vendor = (data?.vendor || data?.merchant_name || "Unknown vendor") as string;

  // Format date nicely
  let formattedDate = date;
  if (date && date !== "Unknown date") {
    try {
      const d = new Date(date);
      formattedDate = d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch {
      formattedDate = date;
    }
  }

  // Format amount
  const amount = total ? `$${total.toFixed(2)}` : "-";

  // Format type
  const type = result.documentType || "document";

  return `${index + 1}. ${formattedDate} | ${amount.padEnd(12)} | ${vendor} (${type})`;
}

/**
 * Execute a search based on slots and return formatted results
 */
export async function executeSearch(slots: Slots): Promise<SearchHandlerResult> {
  // Build query from slots
  const query = buildQueryFromSlots(slots);
  console.log(`[SearchHandler] Query: "${query}"`);

  // Execute smart search
  const searchResult = await smartSearch(query, { limit: 10 });

  if (!searchResult.success) {
    return {
      success: false,
      message: `Search failed: ${searchResult.error}`,
      results: [],
      count: 0,
    };
  }

  const { results, processingTimeMs } = searchResult;

  // Apply additional slot-based filtering
  let filteredResults = results;

  // Filter by document type if specified (semantic search may return other types)
  if (slots.documentType) {
    filteredResults = filteredResults.filter((r) => r.documentType === slots.documentType);
  }

  // Filter by year if specified
  if (slots.year) {
    filteredResults = filteredResults.filter((r) => {
      const ext = r.extraction as Record<string, unknown>;
      const data = (ext?.data || ext) as Record<string, unknown>;
      const dateStr = (data?.invoice_date || data?.date) as string | undefined;
      if (!dateStr) return false;
      return dateStr.startsWith(String(slots.year));
    });
  }

  // Filter by comparison if specified
  if (slots.comparison && slots.comparisonValue !== undefined) {
    filteredResults = filteredResults.filter((r) => {
      const ext = r.extraction as Record<string, unknown>;
      const data = (ext?.data || ext) as Record<string, unknown>;
      const total = data?.total as number | undefined;

      if (!total) return false;

      if (slots.comparison === "greater") {
        return total > (slots.comparisonValue || 0);
      } else if (slots.comparison === "less") {
        return total < (slots.comparisonValue || 0);
      }
      return true;
    });
  }

  // Format results
  if (filteredResults.length === 0) {
    return {
      success: true,
      message: "No documents found matching your criteria.",
      results: [],
      count: 0,
      processingTimeMs,
    };
  }

  // Build summary based on what was searched
  const typeName = slots.documentType ? `${slots.documentType}s` : "documents";
  const timeframe = slots.year ? ` from ${slots.year}` :
                    slots.date ? ` from ${slots.date}` : "";
  const comparison = slots.comparison && slots.comparisonValue
    ? ` ${slots.comparison === "greater" ? "over" : "under"} $${slots.comparisonValue}`
    : "";
  const vendorInfo = slots.vendor ? ` from ${slots.vendor}` : "";

  const header = `Found ${filteredResults.length} ${typeName}${timeframe}${comparison}${vendorInfo}:\n`;

  // Format each result
  const formattedResults = filteredResults.map((r, i) => formatResult(r, i)).join("\n");

  return {
    success: true,
    message: header + "\n" + formattedResults,
    results: filteredResults,
    count: filteredResults.length,
    processingTimeMs,
  };
}
