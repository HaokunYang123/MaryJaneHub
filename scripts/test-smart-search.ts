#!/usr/bin/env npx tsx
/**
 * Test Smart Search
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { smartSearch } from "../lib/search/smart-search";

async function test() {
  const queries = [
    "march 2013",
    "$9.20",
    "2013-03-07",
    "2013",
    "$119",
    "printing",
    "fedex",
  ];

  for (const q of queries) {
    console.log("═".repeat(50));
    console.log("Query:", q);

    const result = await smartSearch(q, { limit: 3 });

    if (result.success === false) {
      console.log("Error:", result.error);
      continue;
    }

    if (result.results.length === 0) {
      console.log("No results");
      continue;
    }

    result.results.forEach((doc, i) => {
      const score = (doc.score * 100).toFixed(0);
      const indicator = doc.matchType === "exact" ? "📌" : "🔍";
      const fields = doc.matchedFields.join(", ");

      const ext = doc.extraction as Record<string, unknown>;
      const data = (ext?.data || ext) as Record<string, unknown>;
      const date = data?.invoice_date || data?.date || "";
      const total = data?.total ? "$" + (data.total as number).toFixed(2) : "";

      console.log(`${i + 1}. [${score}%] ${indicator} [${fields}] ${doc.fileName}`);
      if (date || total) {
        console.log(`   ${[date, total].filter(Boolean).join(" | ")}`);
      }
    });

    console.log(`(${result.processingTimeMs}ms)\n`);
  }
}

test().catch(console.error);
