import { config } from "dotenv";
config({ path: ".env.local" });

import { smartSearch } from "../lib/search/smart-search";

async function test() {
  const queries = [
    "bega company on 2013",
    "fedex 2013",
    "centerpointe 2013",
  ];

  for (const q of queries) {
    console.log("═".repeat(60));
    console.log("Query:", q);
    console.log("═".repeat(60));

    const result = await smartSearch(q, { limit: 5 });

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
      const matchType = doc.matchType === "hybrid" ? "🎯" : doc.matchType === "exact" ? "📌" : "🔍";
      const fields = doc.matchedFields.join(", ");

      const ext = doc.extraction as Record<string, unknown>;
      const data = (ext?.data || ext) as Record<string, unknown>;
      const vendor = data?.vendor || "";

      console.log(`${i + 1}. [${score}%] ${matchType} ${doc.fileName}`);
      console.log(`   Vendor: ${vendor}`);
      console.log(`   Matched: ${fields}`);
    });

    console.log(`\n(${result.processingTimeMs}ms)\n`);
  }
}

test().catch(console.error);
