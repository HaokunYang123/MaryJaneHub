#!/usr/bin/env npx tsx
/**
 * Interactive Smart Search CLI
 *
 * Combines structured queries (date, amount, type) with semantic search.
 *
 * Usage:
 *   npm run search
 *
 * Examples:
 *   Search > march 2016 $44
 *   Search > fedex
 *   Search > receipt $99.24
 *   Search > printing invoice
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as readline from "readline";
import { smartSearch } from "../lib/search/smart-search";
import { formatParsedQuery } from "../lib/search/parse-query";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function search(query: string) {
  const result = await smartSearch(query, { limit: 10 });

  if (!result.success) {
    console.log(`Error: ${result.error}\n`);
    return;
  }

  // Show parsed query
  console.log(`\nParsed: ${formatParsedQuery(result.parsedQuery)}`);

  if (result.results.length === 0) {
    console.log("No results found.\n");
    return;
  }

  console.log();
  result.results.forEach((doc, i) => {
    const score = (doc.score * 100).toFixed(0);
    const type = doc.documentType || "unknown";

    // Show match type indicator
    let indicator: string;
    if (doc.matchType === "exact") {
      indicator = `📌 EXACT [${doc.matchedFields.join(", ")}]`;
    } else {
      indicator = `🔍 SEMANTIC`;
    }

    // Extract useful info from extraction
    const extraction = doc.extraction as Record<string, unknown>;
    const data = (extraction?.data || extraction) as Record<string, unknown>;
    const date = data?.invoice_date || data?.date || "";
    const total = data?.total ? `$${(data.total as number).toFixed(2)}` : "";
    const vendor = data?.vendor || "";

    console.log(`${i + 1}. [${score}%] ${indicator}`);
    console.log(`   ${doc.fileName}`);
    if (date || total || vendor) {
      const meta = [date, total, vendor].filter(Boolean).join(" | ");
      console.log(`   ${meta}`);
    }
    console.log();
  });

  console.log(`(${result.processingTimeMs}ms)\n`);
}

function prompt() {
  rl.question("Search > ", async (input) => {
    const query = input.trim();

    if (query === "exit" || query === "quit" || query === "q") {
      console.log("Bye!");
      rl.close();
      return;
    }

    if (query === "help" || query === "?") {
      console.log(`
Examples:
  march 2016           - documents from March 2016
  $44.00               - documents with amount ~$44
  18 march 2016 $44    - exact date and amount
  receipt $99          - receipts around $99
  fedex                - semantic search for "fedex"
  printing invoice     - invoices about printing
  exit                 - quit
`);
      prompt();
      return;
    }

    if (query) {
      await search(query);
    }

    prompt();
  });
}

console.log("═".repeat(50));
console.log("  Smart Hybrid Search");
console.log("  📌 EXACT = structured match (date/amount/type)");
console.log("  🔍 SEMANTIC = vector similarity match");
console.log('  Type "help" for examples, "exit" to quit');
console.log("═".repeat(50) + "\n");

prompt();
