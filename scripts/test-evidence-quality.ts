#!/usr/bin/env tsx
/**
 * M3 - Backend Validation: Evidence Quality Regression Test
 *
 * Verifies that:
 * 1. Field evidence exists for evaluated fields
 * 2. Evidence excerpts are non-empty
 * 3. Page references are consistent
 * 4. Extracted field values match evidence
 */

import { readFileSync } from "fs";
import { join } from "path";

interface FieldEvidenceEntry {
  value: unknown;
  confidence: number | null;
  evidence: {
    page: number | null;
    quote: string | null;
    coords: unknown;
  };
}

interface ExtractionData {
  file_name: string;
  document_type: string;
  extraction: {
    type: string;
    data: {
      field_evidence?: Record<string, FieldEvidenceEntry>;
      [key: string]: unknown;
    };
  };
}

interface EvidenceCheck {
  file_name: string;
  field_name: string;
  has_evidence: boolean;
  excerpt_non_empty: boolean;
  page_valid: boolean;
  value_matches: boolean;
  issues: string[];
}

function checkFieldEvidence(
  fileName: string,
  fieldName: string,
  fieldValue: unknown,
  evidence: FieldEvidenceEntry | undefined
): EvidenceCheck {
  const issues: string[] = [];

  if (!evidence) {
    return {
      file_name: fileName,
      field_name: fieldName,
      has_evidence: false,
      excerpt_non_empty: false,
      page_valid: false,
      value_matches: false,
      issues: ["No evidence entry found"]
    };
  }

  const excerptNonEmpty = Boolean(evidence.evidence.quote && evidence.evidence.quote.trim().length > 0);
  if (!excerptNonEmpty) {
    issues.push("Evidence excerpt is empty or null");
  }

  const hasCoords = Boolean(evidence.evidence.coords);
  const pageValid = evidence.evidence.page !== null && evidence.evidence.page > 0;
  if (hasCoords && !pageValid) {
    issues.push("Page reference missing for evidence with coords");
  }

  // Check if the evidence value matches the field value
  const valueMatches = JSON.stringify(evidence.value) === JSON.stringify(fieldValue);
  if (!valueMatches) {
    issues.push(`Value mismatch: evidence=${JSON.stringify(evidence.value)}, field=${JSON.stringify(fieldValue)}`);
  }

  return {
    file_name: fileName,
    field_name: fieldName,
    has_evidence: true,
    excerpt_non_empty: excerptNonEmpty,
    page_valid: pageValid,
    value_matches: valueMatches,
    issues
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fixturesPath = args[0] || join(process.cwd(), "test-files/toy-fixtures/toy-dataset.json");

  console.log("M3 Backend Validation - Evidence Quality Test");
  console.log("==============================================");
  console.log();
  console.log(`Fixtures: ${fixturesPath}`);
  console.log();

  // Load fixtures
  let data: { documents: ExtractionData[] };
  try {
    const json = readFileSync(fixturesPath, "utf-8");
    data = JSON.parse(json);
    console.log(`✓ Loaded ${data.documents.length} documents`);
  } catch (error) {
    console.error(`✗ Failed to load fixtures: ${error}`);
    process.exit(1);
  }

  const checks: EvidenceCheck[] = [];
  let totalIssues = 0;

  for (const doc of data.documents) {
    const fieldEvidence = doc.extraction.data.field_evidence;

    if (!fieldEvidence) {
      console.error(`✗ ${doc.file_name}: No field_evidence map found`);
      totalIssues++;
      continue;
    }

    // Check each field in the extraction data
    for (const [fieldName, fieldValue] of Object.entries(doc.extraction.data)) {
      // Skip non-field properties
      if (fieldName === "field_evidence" || fieldName === "confidence" || fieldName === "raw_response" ||
          fieldName === "line_items" || fieldName === "items" || fieldName === "transactions" ||
          fieldName === "parties" || fieldName === "key_terms" || fieldName === "action_items") {
        continue;
      }

      // Skip null fields (not extracted)
      if (fieldValue === null || fieldValue === undefined) {
        continue;
      }

      const check = checkFieldEvidence(doc.file_name, fieldName, fieldValue, fieldEvidence[fieldName]);
      checks.push(check);

      if (check.issues.length > 0) {
        console.error(`✗ ${doc.file_name} / ${fieldName}:`);
        for (const issue of check.issues) {
          console.error(`    - ${issue}`);
        }
        totalIssues += check.issues.length;
      }
    }
  }

  console.log();
  console.log("Summary:");
  console.log(`  Total fields checked: ${checks.length}`);
  console.log(`  Fields with evidence: ${checks.filter(c => c.has_evidence).length}`);
  console.log(`  Non-empty excerpts:   ${checks.filter(c => c.excerpt_non_empty).length}`);
  console.log(`  Valid page refs:      ${checks.filter(c => c.page_valid).length}`);
  console.log(`  Value matches:        ${checks.filter(c => c.value_matches).length}`);
  console.log(`  Total issues:         ${totalIssues}`);
  console.log();

  if (totalIssues > 0) {
    console.error(`✗ FAILED: ${totalIssues} evidence quality issues found`);
    process.exit(1);
  } else {
    console.log("✓ PASSED: All evidence quality checks passed");
    process.exit(0);
  }
}

main().catch(console.error);
