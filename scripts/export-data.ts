#!/usr/bin/env npx tsx
/**
 * Export Data CLI Script
 *
 * Usage:
 *   npm run export -- --format=xlsx --output=./exports/report.xlsx
 *   npm run export -- --format=csv --from=2019-01-01 --to=2019-12-31
 *   npm run export -- --summary --output=./exports/summary.json
 *   npm run export -- --types=receipt,invoice --min=50 --max=200
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { exportToCSV, exportToExcel, generateSummaryReport } from "../lib/export";
import type { ExportOptions } from "../lib/export/types";

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      result[key] = value || "true";
    }
  }
  return result;
}

function printHelp() {
  console.log(`
Due Diligence Export CLI

Usage:
  npm run export -- [options]

Options:
  --format=csv|xlsx    Output format (default: csv)
  --output=PATH        Output file path (default: ./exports/export-{date}.{format})
  --summary            Generate summary report only (JSON)

  --from=YYYY-MM-DD    Filter: documents from this date
  --to=YYYY-MM-DD      Filter: documents until this date
  --types=TYPE,TYPE    Filter: document types (receipt,invoice,bank_statement,etc)
  --min=NUMBER         Filter: minimum amount
  --max=NUMBER         Filter: maximum amount
  --status=STATUS      Filter: sync status

  --include-raw        Include raw OCR text in export
  --include-low-conf   Include documents with <70% confidence

  --help               Show this help message

Examples:
  npm run export -- --format=xlsx --output=./reports/due-diligence.xlsx
  npm run export -- --summary --output=./reports/summary.json
  npm run export -- --from=2019-01-01 --to=2019-12-31 --types=receipt
  `);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  console.log("=".repeat(60));
  console.log("Due Diligence Export");
  console.log("=".repeat(60) + "\n");

  // Build export options
  const options: ExportOptions = {};

  if (args.types) {
    options.documentTypes = args.types.split(",").map((t) => t.trim());
    console.log(`Filter: Document types = ${options.documentTypes.join(", ")}`);
  }

  if (args.from) {
    options.dateFrom = args.from;
    console.log(`Filter: From date = ${options.dateFrom}`);
  }

  if (args.to) {
    options.dateTo = args.to;
    console.log(`Filter: To date = ${options.dateTo}`);
  }

  if (args.min) {
    options.minAmount = parseFloat(args.min);
    console.log(`Filter: Min amount = $${options.minAmount}`);
  }

  if (args.max) {
    options.maxAmount = parseFloat(args.max);
    console.log(`Filter: Max amount = $${options.maxAmount}`);
  }

  if (args.status) {
    options.syncStatus = args.status.split(",").map((s) => s.trim());
    console.log(`Filter: Status = ${options.syncStatus.join(", ")}`);
  }

  if (args["include-raw"]) {
    options.includeRawText = true;
    console.log("Include: Raw OCR text");
  }

  if (args["include-low-conf"]) {
    options.includeLowConfidence = true;
    console.log("Include: Low confidence documents");
  }

  console.log("");

  // Determine output
  const timestamp = new Date().toISOString().split("T")[0];
  const isSummary = args.summary === "true";
  const format = isSummary ? "json" : args.format || "csv";

  const defaultOutput = `./exports/export-${timestamp}.${format}`;
  const outputPath = args.output || defaultOutput;

  // Ensure directory exists
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }

  try {
    if (isSummary) {
      console.log("Generating summary report...\n");
      const summary = await generateSummaryReport(options);

      // Display summary
      console.log("=".repeat(40));
      console.log("SUMMARY REPORT");
      console.log("=".repeat(40));
      console.log(`Total Documents: ${summary.totalDocuments}`);
      console.log(`Date Range: ${summary.dateRange.from || "N/A"} to ${summary.dateRange.to || "N/A"}`);
      console.log(`Total Amount: $${summary.totalAmount.toFixed(2)}`);
      console.log(`Average Confidence: ${(summary.avgConfidence * 100).toFixed(1)}%`);
      console.log("");
      console.log("By Type:");
      Object.entries(summary.byType).forEach(([type, count]) => {
        const amount = summary.byTypeAmount[type] || 0;
        console.log(`  ${type}: ${count} docs, $${amount.toFixed(2)}`);
      });
      console.log("");
      console.log("Issues:");
      summary.issues.forEach((issue) => {
        console.log(`  ${issue.description}: ${issue.count}`);
      });

      // Write JSON
      writeFileSync(outputPath, JSON.stringify(summary, null, 2));
      console.log(`\nSaved to: ${outputPath}`);
    } else if (format === "xlsx") {
      console.log("Generating Excel workbook...");
      const buffer = await exportToExcel(options);
      writeFileSync(outputPath, buffer);
      console.log(`\nExcel workbook saved to: ${outputPath}`);
      console.log("Sheets included:");
      console.log("  1. Executive Summary");
      console.log("  2. All Documents");
      console.log("  3. Receipts (if any)");
      console.log("  4. Invoices (if any)");
      console.log("  5. Bank Statements (if any)");
      console.log("  6. Issues & Flags");
      console.log("  7. Monthly Summary");
    } else {
      console.log("Generating CSV...");
      const csv = await exportToCSV(options);
      writeFileSync(outputPath, csv);
      const lineCount = csv.split("\n").length - 1;
      console.log(`\nCSV saved to: ${outputPath}`);
      console.log(`Total rows: ${lineCount}`);
    }

    console.log("\nExport complete!");
  } catch (error) {
    console.error("\nExport failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);
