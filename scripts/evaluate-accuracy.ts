#!/usr/bin/env tsx
/**
 * M3 - Backend Validation: Accuracy Evaluation Harness
 *
 * Loads labeled truth data and computes per-field extraction accuracy metrics.
 * Supports partial labels and generates both JSON and Markdown reports.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

type DocumentType = "invoice" | "receipt" | "bank_statement" | "contract" | "tax_form" | "correspondence";

interface TruthLabel {
  file_name: string;
  document_type: DocumentType;
  fields: Record<string, unknown>;
}

interface TruthData {
  labels: TruthLabel[];
}

interface ExtractionData {
  file_name: string;
  document_type: DocumentType;
  extraction: {
    type: DocumentType;
    data: Record<string, unknown>;
  };
}

interface FieldResult {
  field_name: string;
  truth_value: unknown;
  extracted_value: unknown;
  match: boolean;
  match_type: "exact" | "numeric_tolerance" | "missing" | "mismatch";
  confidence?: number | null;
  has_evidence?: boolean;
}

interface DocumentResult {
  file_name: string;
  document_type: DocumentType;
  field_results: FieldResult[];
  accuracy: number;
}

interface FieldStats {
  field_name: string;
  total: number;
  correct: number;
  accuracy: number;
  confidence_high?: { total: number; correct: number; accuracy: number };
  confidence_med?: { total: number; correct: number; accuracy: number };
  confidence_low?: { total: number; correct: number; accuracy: number };
}

interface DocTypeStats {
  document_type: DocumentType;
  total_documents: number;
  field_stats: FieldStats[];
  overall_accuracy: number;
}

interface EvaluationReport {
  generated_at: string;
  mode: "toy" | "production";
  total_documents: number;
  total_fields_evaluated: number;
  overall_accuracy: number;
  sample_warning?: string;
  by_doc_type: DocTypeStats[];
  document_results: DocumentResult[];
  confidence_calibration: {
    high: { total: number; correct: number; accuracy: number };
    medium: { total: number; correct: number; accuracy: number };
    low: { total: number; correct: number; accuracy: number };
  };
}

// ============================================================================
// Configuration
// ============================================================================

const NUMERIC_TOLERANCE = 0.01; // ±$0.01 for amounts
const MIN_LABELS_FOR_PROD = 30;

// Fields that should be compared as numbers with tolerance
const NUMERIC_FIELDS = new Set([
  "total", "subtotal", "tax", "tip", "amount", "unit_price",
  "opening_balance", "closing_balance", "total_deposits", "total_withdrawals",
  "value", "total_income", "total_tax", "tax_withheld", "refund_or_owed"
]);

// Confidence thresholds
const CONFIDENCE_HIGH = 0.8;
const CONFIDENCE_LOW = 0.5;

// ============================================================================
// Comparison Logic
// ============================================================================

function compareValues(
  fieldName: string,
  truthValue: unknown,
  extractedValue: unknown
): { match: boolean; matchType: FieldResult["match_type"] } {
  // Both null/undefined = missing (not counted as error)
  if (truthValue == null && extractedValue == null) {
    return { match: true, matchType: "missing" };
  }

  // One is null = mismatch
  if (truthValue == null || extractedValue == null) {
    return { match: false, matchType: "mismatch" };
  }

  // Numeric comparison with tolerance
  if (NUMERIC_FIELDS.has(fieldName)) {
    const truthNum = typeof truthValue === "number" ? truthValue : parseFloat(String(truthValue));
    const extractedNum = typeof extractedValue === "number" ? extractedValue : parseFloat(String(extractedValue));

    if (isNaN(truthNum) || isNaN(extractedNum)) {
      return { match: false, matchType: "mismatch" };
    }

    const withinTolerance = Math.abs(truthNum - extractedNum) <= NUMERIC_TOLERANCE;
    return {
      match: withinTolerance,
      matchType: withinTolerance ? "numeric_tolerance" : "mismatch"
    };
  }

  // Exact string comparison (case-sensitive for dates, case-insensitive for others)
  const truthStr = String(truthValue).trim();
  const extractedStr = String(extractedValue).trim();

  // Dates must match exactly (ISO format)
  if (fieldName.includes("date") || fieldName.includes("year")) {
    return {
      match: truthStr === extractedStr,
      matchType: truthStr === extractedStr ? "exact" : "mismatch"
    };
  }

  // Other fields: case-insensitive
  return {
    match: truthStr.toLowerCase() === extractedStr.toLowerCase(),
    matchType: truthStr.toLowerCase() === extractedStr.toLowerCase() ? "exact" : "mismatch"
  };
}

function getFieldConfidence(
  extraction: Record<string, unknown>,
  fieldName: string
): number | null {
  // Check if field_evidence exists and has confidence for this field
  const fieldEvidence = extraction.field_evidence as Record<string, { confidence?: number }> | undefined;
  if (fieldEvidence?.[fieldName]?.confidence !== undefined) {
    return fieldEvidence[fieldName].confidence!;
  }

  // Fallback to overall confidence if available
  if (typeof extraction.confidence === "number") {
    return extraction.confidence;
  }

  return null;
}

function hasFieldEvidence(
  extraction: Record<string, unknown>,
  fieldName: string
): boolean {
  const fieldEvidence = extraction.field_evidence as Record<string, { evidence?: { quote?: string } }> | undefined;
  const evidence = fieldEvidence?.[fieldName]?.evidence;
  return Boolean(evidence?.quote && evidence.quote.length > 0);
}

function categorizeConfidence(conf: number | null): "high" | "medium" | "low" | null {
  if (conf === null) return null;
  if (conf >= CONFIDENCE_HIGH) return "high";
  if (conf >= CONFIDENCE_LOW) return "medium";
  return "low";
}

// ============================================================================
// Evaluation
// ============================================================================

function evaluateDocument(
  truth: TruthLabel,
  extraction: ExtractionData
): DocumentResult {
  const fieldResults: FieldResult[] = [];

  for (const [fieldName, truthValue] of Object.entries(truth.fields)) {
    const extractedValue = extraction.extraction.data[fieldName];
    const { match, matchType } = compareValues(fieldName, truthValue, extractedValue);
    const confidence = getFieldConfidence(extraction.extraction.data, fieldName);
    const has_evidence = hasFieldEvidence(extraction.extraction.data, fieldName);

    fieldResults.push({
      field_name: fieldName,
      truth_value: truthValue,
      extracted_value: extractedValue,
      match,
      match_type: matchType,
      confidence,
      has_evidence
    });
  }

  const totalFields = fieldResults.filter(r => r.match_type !== "missing").length;
  const correctFields = fieldResults.filter(r => r.match && r.match_type !== "missing").length;
  const accuracy = totalFields > 0 ? correctFields / totalFields : 0;

  return {
    file_name: truth.file_name,
    document_type: truth.document_type,
    field_results: fieldResults,
    accuracy
  };
}

function computeStats(results: DocumentResult[]): EvaluationReport {
  const isProduction = results.length >= MIN_LABELS_FOR_PROD;
  const mode: EvaluationReport["mode"] = isProduction ? "production" : "toy";
  const sampleWarning = isProduction
    ? undefined
    : `Sample size (${results.length}) is below ${MIN_LABELS_FOR_PROD}. Metrics are indicative only.`;
  const byDocType = new Map<DocumentType, DocumentResult[]>();

  // Group by document type
  for (const result of results) {
    if (!byDocType.has(result.document_type)) {
      byDocType.set(result.document_type, []);
    }
    byDocType.get(result.document_type)!.push(result);
  }

  // Compute per-field stats by doc type
  const docTypeStats: DocTypeStats[] = [];

  for (const [docType, docResults] of byDocType) {
    const fieldMap = new Map<string, FieldResult[]>();

    // Collect all field results
    for (const docResult of docResults) {
      for (const fieldResult of docResult.field_results) {
        if (!fieldMap.has(fieldResult.field_name)) {
          fieldMap.set(fieldResult.field_name, []);
        }
        fieldMap.get(fieldResult.field_name)!.push(fieldResult);
      }
    }

    // Compute stats per field
    const fieldStats: FieldStats[] = [];
    for (const [fieldName, fieldResults] of fieldMap) {
      const nonMissing = fieldResults.filter(r => r.match_type !== "missing");
      const total = nonMissing.length;
      const correct = nonMissing.filter(r => r.match).length;

      // Confidence calibration per field
      const confHigh = nonMissing.filter(r => categorizeConfidence(r.confidence) === "high");
      const confMed = nonMissing.filter(r => categorizeConfidence(r.confidence) === "medium");
      const confLow = nonMissing.filter(r => categorizeConfidence(r.confidence) === "low");

      fieldStats.push({
        field_name: fieldName,
        total,
        correct,
        accuracy: total > 0 ? correct / total : 0,
        confidence_high: confHigh.length > 0 ? {
          total: confHigh.length,
          correct: confHigh.filter(r => r.match).length,
          accuracy: confHigh.filter(r => r.match).length / confHigh.length
        } : undefined,
        confidence_med: confMed.length > 0 ? {
          total: confMed.length,
          correct: confMed.filter(r => r.match).length,
          accuracy: confMed.filter(r => r.match).length / confMed.length
        } : undefined,
        confidence_low: confLow.length > 0 ? {
          total: confLow.length,
          correct: confLow.filter(r => r.match).length,
          accuracy: confLow.filter(r => r.match).length / confLow.length
        } : undefined
      });
    }

    const totalCorrect = docResults.reduce((sum, r) => sum + r.field_results.filter(f => f.match && f.match_type !== "missing").length, 0);
    const totalFields = docResults.reduce((sum, r) => sum + r.field_results.filter(f => f.match_type !== "missing").length, 0);

    docTypeStats.push({
      document_type: docType,
      total_documents: docResults.length,
      field_stats: fieldStats,
      overall_accuracy: totalFields > 0 ? totalCorrect / totalFields : 0
    });
  }

  // Overall confidence calibration
  const allFieldResults = results.flatMap(r => r.field_results.filter(f => f.match_type !== "missing"));
  const confHigh = allFieldResults.filter(r => categorizeConfidence(r.confidence) === "high");
  const confMed = allFieldResults.filter(r => categorizeConfidence(r.confidence) === "medium");
  const confLow = allFieldResults.filter(r => categorizeConfidence(r.confidence) === "low");

  const totalFields = allFieldResults.length;
  const totalCorrect = allFieldResults.filter(r => r.match).length;

  return {
    generated_at: new Date().toISOString(),
    mode,
    total_documents: results.length,
    total_fields_evaluated: totalFields,
    overall_accuracy: totalFields > 0 ? totalCorrect / totalFields : 0,
    sample_warning: sampleWarning,
    by_doc_type: docTypeStats,
    document_results: results,
    confidence_calibration: {
      high: {
        total: confHigh.length,
        correct: confHigh.filter(r => r.match).length,
        accuracy: confHigh.length > 0 ? confHigh.filter(r => r.match).length / confHigh.length : 0
      },
      medium: {
        total: confMed.length,
        correct: confMed.filter(r => r.match).length,
        accuracy: confMed.length > 0 ? confMed.filter(r => r.match).length / confMed.length : 0
      },
      low: {
        total: confLow.length,
        correct: confLow.filter(r => r.match).length,
        accuracy: confLow.length > 0 ? confLow.filter(r => r.match).length / confLow.length : 0
      }
    }
  };
}

// ============================================================================
// Markdown Report Generation
// ============================================================================

function generateMarkdownReport(report: EvaluationReport): string {
  const lines: string[] = [];

  lines.push("# Extraction Accuracy Evaluation Report");
  lines.push("");
  lines.push(`**Generated:** ${report.generated_at}`);
  lines.push(`**Mode:** ${report.mode}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total Documents Evaluated:** ${report.total_documents}`);
  lines.push(`- **Total Fields Evaluated:** ${report.total_fields_evaluated}`);
  lines.push(`- **Overall Accuracy:** ${(report.overall_accuracy * 100).toFixed(2)}%`);
  if (report.sample_warning) {
    lines.push(`- **Warning:** ${report.sample_warning}`);
  }
  lines.push("");

  lines.push("## Confidence Calibration");
  lines.push("");
  lines.push("| Confidence Level | Total Fields | Correct | Accuracy |");
  lines.push("|-----------------|--------------|---------|----------|");
  lines.push(`| High (≥0.8) | ${report.confidence_calibration.high.total} | ${report.confidence_calibration.high.correct} | ${(report.confidence_calibration.high.accuracy * 100).toFixed(2)}% |`);
  lines.push(`| Medium (0.5-0.8) | ${report.confidence_calibration.medium.total} | ${report.confidence_calibration.medium.correct} | ${(report.confidence_calibration.medium.accuracy * 100).toFixed(2)}% |`);
  lines.push(`| Low (<0.5) | ${report.confidence_calibration.low.total} | ${report.confidence_calibration.low.correct} | ${(report.confidence_calibration.low.accuracy * 100).toFixed(2)}% |`);
  lines.push("");

  // Check if high confidence is significantly better
  const highAcc = report.confidence_calibration.high.accuracy;
  const medAcc = report.confidence_calibration.medium.accuracy;
  if (report.confidence_calibration.high.total > 0 && report.confidence_calibration.medium.total > 0) {
    if (highAcc - medAcc < 0.1) {
      lines.push("⚠️ **WARNING:** High confidence is not significantly better than medium confidence.");
      lines.push("");
    }
  }

  lines.push("## Accuracy by Document Type");
  lines.push("");

  for (const docType of report.by_doc_type) {
    lines.push(`### ${docType.document_type.toUpperCase()}`);
    lines.push("");
    lines.push(`- **Documents:** ${docType.total_documents}`);
    lines.push(`- **Overall Accuracy:** ${(docType.overall_accuracy * 100).toFixed(2)}%`);
    lines.push("");

    lines.push("| Field | Total | Correct | Accuracy | High Conf | Med Conf | Low Conf |");
    lines.push("|-------|-------|---------|----------|-----------|----------|----------|");

    for (const field of docType.field_stats) {
      const highStr = field.confidence_high
        ? `${(field.confidence_high.accuracy * 100).toFixed(0)}% (${field.confidence_high.correct}/${field.confidence_high.total})`
        : "N/A";
      const medStr = field.confidence_med
        ? `${(field.confidence_med.accuracy * 100).toFixed(0)}% (${field.confidence_med.correct}/${field.confidence_med.total})`
        : "N/A";
      const lowStr = field.confidence_low
        ? `${(field.confidence_low.accuracy * 100).toFixed(0)}% (${field.confidence_low.correct}/${field.confidence_low.total})`
        : "N/A";

      lines.push(`| ${field.field_name} | ${field.total} | ${field.correct} | ${(field.accuracy * 100).toFixed(2)}% | ${highStr} | ${medStr} | ${lowStr} |`);
    }
    lines.push("");
  }

  lines.push("## Per-Document Results");
  lines.push("");

  for (const docResult of report.document_results) {
    lines.push(`### ${docResult.file_name} (${docResult.document_type})`);
    lines.push("");
    lines.push(`**Accuracy:** ${(docResult.accuracy * 100).toFixed(2)}%`);
    lines.push("");

    lines.push("| Field | Truth | Extracted | Match | Evidence |");
    lines.push("|-------|-------|-----------|-------|----------|");

    for (const field of docResult.field_results) {
      const truthStr = field.truth_value != null ? String(field.truth_value) : "null";
      const extractedStr = field.extracted_value != null ? String(field.extracted_value) : "null";
      const matchIcon = field.match ? "✓" : "✗";
      const evidenceIcon = field.has_evidence ? "✓" : "✗";

      lines.push(`| ${field.field_name} | ${truthStr} | ${extractedStr} | ${matchIcon} | ${evidenceIcon} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const truthPath = args[0] || join(process.cwd(), "test-files/truth-labels.json");
  const extractionsPath = args[1] || join(process.cwd(), "test-files/toy-fixtures/toy-dataset.json");
  const outputDir = args[2] || join(process.cwd(), "evaluation-results");

  console.log("M3 Backend Validation - Accuracy Evaluation");
  console.log("===========================================");
  console.log();
  console.log(`Truth labels: ${truthPath}`);
  console.log(`Extractions:  ${extractionsPath}`);
  console.log(`Output dir:   ${outputDir}`);
  console.log();

  // Load data
  let truthData: TruthData;
  try {
    const truthJson = readFileSync(truthPath, "utf-8");
    truthData = JSON.parse(truthJson);
    console.log(`✓ Loaded ${truthData.labels.length} truth labels`);
  } catch (error) {
    console.error(`✗ Failed to load truth labels: ${error}`);
    process.exit(1);
  }

  let extractionsData: { documents: ExtractionData[] };
  try {
    const extractionsJson = readFileSync(extractionsPath, "utf-8");
    extractionsData = JSON.parse(extractionsJson);
    console.log(`✓ Loaded ${extractionsData.documents.length} extractions`);
  } catch (error) {
    console.error(`✗ Failed to load extractions: ${error}`);
    process.exit(1);
  }

  // Match truth labels to extractions
  const results: DocumentResult[] = [];
  for (const truth of truthData.labels) {
    const extraction = extractionsData.documents.find(d => d.file_name === truth.file_name);
    if (!extraction) {
      console.warn(`⚠ No extraction found for ${truth.file_name}`);
      continue;
    }

    const result = evaluateDocument(truth, extraction);
    results.push(result);
    console.log(`  ${truth.file_name}: ${(result.accuracy * 100).toFixed(2)}% accuracy`);
  }

  console.log();
  console.log(`✓ Evaluated ${results.length} documents`);
  console.log();

  // Compute overall stats
  const report = computeStats(results);

  // Output JSON
  const jsonPath = join(outputDir, "accuracy-evaluation.json");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`✓ Wrote JSON report: ${jsonPath}`);

  // Output Markdown
  const markdown = generateMarkdownReport(report);
  const mdPath = join(outputDir, "accuracy-evaluation.md");
  writeFileSync(mdPath, markdown);
  console.log(`✓ Wrote Markdown report: ${mdPath}`);

  console.log();
  console.log("Summary:");
  console.log(`  Overall Accuracy: ${(report.overall_accuracy * 100).toFixed(2)}%`);
  console.log(`  High Conf: ${(report.confidence_calibration.high.accuracy * 100).toFixed(2)}%`);
  console.log(`  Med Conf:  ${(report.confidence_calibration.medium.accuracy * 100).toFixed(2)}%`);
  console.log(`  Low Conf:  ${(report.confidence_calibration.low.accuracy * 100).toFixed(2)}%`);
}

main().catch(console.error);
