#!/usr/bin/env tsx
/**
 * Phase 5 - Evidence Coordinates Coverage Test
 *
 * Builds synthetic layouts from line-based fixtures and verifies
 * that key invoice fields resolve to page + coords.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { ensureFieldEvidence } from "../lib/workflow/field-evidence";
import type { DocumentLayout } from "../lib/document-ai/types";
import type { DocumentExtraction } from "../lib/gemini/extract-document";

type FixtureDoc = {
  file_name: string;
  document_type: string;
  lines: string[];
  extraction: DocumentExtraction;
};

type FixtureData = {
  documents: FixtureDoc[];
};

const REQUIRED_FIELDS = [
  "vendor",
  "invoice_number",
  "invoice_date",
  "due_date",
  "subtotal",
  "tax",
  "total",
];

function buildLayoutFromLines(lines: string[]): { rawText: string; layout: DocumentLayout } {
  const rawText = lines.join("\n");
  const lineHeight = 0.08;
  let cursor = 0;

  const layoutLines = lines.map((line, index) => {
    const startIndex = cursor;
    const endIndex = startIndex + line.length;
    cursor = endIndex + 1; // newline

    return {
      segments: [{ startIndex, endIndex }],
      bbox: {
        x: 0.05,
        y: Math.min(0.05 + index * lineHeight, 0.95),
        w: 0.9,
        h: 0.06,
      },
      confidence: 0.99,
    };
  });

  return {
    rawText,
    layout: {
      pages: [
        {
          pageNumber: 1,
          width: 1000,
          height: 1400,
          unit: "pixel",
          lines: layoutLines,
        },
      ],
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const fixturesPath = args[0] || join(process.cwd(), "test-files/coords-fixtures/coords-dataset.json");

  console.log("Phase 5 - Evidence Coordinates Coverage Test");
  console.log("===========================================");
  console.log();
  console.log(`Fixtures: ${fixturesPath}`);
  console.log();

  let data: FixtureData;
  try {
    const json = readFileSync(fixturesPath, "utf-8");
    data = JSON.parse(json) as FixtureData;
    console.log(`✓ Loaded ${data.documents.length} documents`);
  } catch (error) {
    console.error(`✗ Failed to load fixtures: ${error}`);
    process.exit(1);
    return;
  }

  let totalFields = 0;
  let coordsFound = 0;
  let docsWithIssues = 0;

  for (const doc of data.documents) {
    const { rawText, layout } = buildLayoutFromLines(doc.lines);
    const ensured = ensureFieldEvidence(doc.extraction, rawText, undefined, layout);

    for (const field of REQUIRED_FIELDS) {
      const value = (doc.extraction.data as Record<string, unknown>)[field];
      if (value === null || value === undefined) continue;
      totalFields += 1;
      const evidence = ensured[field];
      const hasCoords = Boolean(evidence?.evidence?.coords && evidence?.evidence?.page);
      if (hasCoords) {
        coordsFound += 1;
      } else {
        docsWithIssues += 1;
        console.error(`✗ ${doc.file_name}: missing coords for ${field}`);
      }
    }
  }

  const coverage = totalFields > 0 ? coordsFound / totalFields : 0;

  console.log();
  console.log("Summary:");
  console.log(`  Fields checked: ${totalFields}`);
  console.log(`  Fields with coords: ${coordsFound}`);
  console.log(`  Coverage: ${(coverage * 100).toFixed(1)}%`);
  console.log();

  if (coverage < 0.9) {
    console.error(`✗ FAILED: Coverage ${(coverage * 100).toFixed(1)}% below 90% target`);
    process.exit(1);
  } else {
    console.log("✓ PASSED: Evidence coords coverage meets target");
    process.exit(0);
  }
}

main();
