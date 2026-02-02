#!/usr/bin/env npx tsx
/**
 * Test script for Single Document QA with Verifiable Citations
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { answerSingleDocumentQuestion } from "../lib/assistant/single-qa";
import type { Slots } from "../lib/assistant/types";

interface TestCase {
  name: string;
  query: string;
  slots: Partial<Slots>;
  expectedBehavior: string;
}

const TEST_CASES: TestCase[] = [
  {
    name: "Query invoice total by unique amount",
    query: "What is the total on the $1690 Centerpointe invoice?",
    slots: {
      documentType: "invoice",
      semanticText: "Centerpointe",
      amount: 1690,
      field: "total",
    },
    expectedBehavior: "Should find document and return $1690 with verified citation",
  },
  {
    name: "Query invoice date by amount",
    query: "What date is on the $1690 Centerpointe invoice?",
    slots: {
      documentType: "invoice",
      semanticText: "Centerpointe",
      amount: 1690,
      field: "date",
    },
    expectedBehavior: "Should find document and return 2011-01-19 with citation",
  },
  {
    name: "Query invoice vendor by unique amount",
    query: "Who is the vendor on the $1388.70 invoice?",
    slots: {
      documentType: "invoice",
      amount: 1388.70,
      semanticText: "",
      field: "vendor",
    },
    expectedBehavior: "Should find Centerpointe Graphics & Printing",
  },
  {
    name: "Query non-existent vendor",
    query: "What is the total on the XYZ Corp invoice?",
    slots: {
      documentType: "invoice",
      semanticText: "XYZ Corp",
      field: "total",
    },
    expectedBehavior: "Should return document_not_found error",
  },
  {
    name: "Ambiguous query - multiple Centerpointe invoices",
    query: "What is the total on the Centerpointe invoice?",
    slots: {
      documentType: "invoice",
      semanticText: "Centerpointe",
      field: "total",
    },
    expectedBehavior: "Should return multiple_matches since many invoices match",
  },
];

async function runTests() {
  console.log("═".repeat(70));
  console.log("Single Document QA Test Suite");
  console.log("═".repeat(70) + "\n");

  let passed = 0;
  let failed = 0;
  let totalCitations = 0;
  let verifiedCitations = 0;

  for (const testCase of TEST_CASES) {
    console.log("━".repeat(70));
    console.log(`Test: ${testCase.name}`);
    console.log(`Query: "${testCase.query}"`);
    console.log(`Expected: ${testCase.expectedBehavior}`);
    console.log("━".repeat(70));

    const slots: Slots = {
      semanticText: testCase.slots.semanticText || "",
      ...testCase.slots,
    };

    try {
      const result = await answerSingleDocumentQuestion(testCase.query, slots);

      // Display result
      if (result.error) {
        console.log(`\n❌ Error: ${result.error}`);
        if (result.clarifyingQuestion) {
          console.log(`   Clarifying: ${result.clarifyingQuestion}`);
        }
      } else {
        console.log(`\n✅ Answer:`);
        console.log(`   ${result.answer?.slice(0, 200)}${(result.answer?.length || 0) > 200 ? "..." : ""}`);
      }

      if (result.documentUsed) {
        console.log(`\n📄 Document: ${result.documentUsed.fileName}`);
        console.log(`   Type: ${result.documentUsed.documentType}`);
      }

      console.log(`\n📊 Confidence: ${result.confidence}`);
      console.log(`   All citations verified: ${result.allCitationsVerified}`);

      if (result.citations.length > 0) {
        console.log(`\n📝 Citations (${result.citations.length}):`);
        for (const citation of result.citations) {
          const status = citation.verified ? "✅" : "❌";
          // [0,0] means not found, any other span is valid
          const spanStr = (citation.span[0] === 0 && citation.span[1] === 0)
            ? "[not found]"
            : `[${citation.span[0]}:${citation.span[1]}]`;
          console.log(`   ${status} "${citation.excerpt.slice(0, 60)}${citation.excerpt.length > 60 ? "..." : ""}" ${spanStr}`);

          totalCitations++;
          if (citation.verified) verifiedCitations++;
        }
      }

      // Determine pass/fail
      const isError = !!result.error;
      const expectError = testCase.expectedBehavior.includes("error") ||
                         testCase.expectedBehavior.includes("not_found") ||
                         testCase.expectedBehavior.includes("multiple_matches");

      if ((isError && expectError) || (!isError && !expectError)) {
        passed++;
        console.log("\n✅ Test PASSED");
      } else {
        failed++;
        console.log("\n❌ Test FAILED");
      }

    } catch (error) {
      console.error("\n💥 Exception:", error);
      failed++;
    }

    console.log();
  }

  // Summary
  console.log("═".repeat(70));
  console.log("SUMMARY");
  console.log("═".repeat(70));
  console.log(`Tests: ${passed}/${TEST_CASES.length} passed`);
  console.log(`Citation verification rate: ${verifiedCitations}/${totalCitations} (${totalCitations > 0 ? ((verifiedCitations/totalCitations)*100).toFixed(0) : 0}%)`);

  if (verifiedCitations === totalCitations && totalCitations > 0) {
    console.log("\n🎉 100% citation verification rate achieved!");
  } else if (totalCitations > 0) {
    console.log("\n⚠️  Some citations could not be verified. Review the findSpanInText function.");
  }
}

runTests().catch(console.error);
