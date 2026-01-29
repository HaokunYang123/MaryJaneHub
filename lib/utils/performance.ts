/**
 * Performance Measurement Utilities
 *
 * Provides timing utilities and performance reporting for benchmarks.
 */

export interface TimingResult<T> {
  result: T;
  durationMs: number;
}

export interface PerformanceEntry {
  name: string;
  durationMs: number;
  category: string;
  status: "ok" | "warning" | "critical" | "error" | "skipped";
  error?: string;
}

export type PerformanceReport = PerformanceEntry[];

// Performance thresholds in milliseconds
export const THRESHOLDS = {
  ocr: { warning: 5000, critical: 10000 },
  classification: { warning: 2000, critical: 4000 },
  extraction: { warning: 3000, critical: 6000 },
  search: { warning: 500, critical: 1000 },
  embedding: { warning: 1000, critical: 2000 },
  database: { warning: 200, critical: 400 },
  external: { warning: 2000, critical: 5000 },
} as const;

export type ThresholdCategory = keyof typeof THRESHOLDS;

/**
 * Measure execution time of an async function
 */
export async function measureTime<T>(
  name: string,
  fn: () => Promise<T>
): Promise<TimingResult<T>> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)} μs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(0)} ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format duration for table display (fixed width)
 */
export function formatDurationPadded(ms: number, width = 10): string {
  const formatted = formatDuration(ms);
  return formatted.padStart(width);
}

/**
 * Determine status based on duration and threshold category
 */
export function getStatus(
  durationMs: number,
  category: ThresholdCategory
): "ok" | "warning" | "critical" {
  const threshold = THRESHOLDS[category];
  if (durationMs >= threshold.critical) {
    return "critical";
  }
  if (durationMs >= threshold.warning) {
    return "warning";
  }
  return "ok";
}

/**
 * Get status icon for display
 */
export function getStatusIcon(status: PerformanceEntry["status"]): string {
  switch (status) {
    case "ok":
      return "✓";
    case "warning":
      return "⚠";
    case "critical":
      return "✗";
    case "error":
      return "!";
    case "skipped":
      return "-";
  }
}

/**
 * Print a formatted table of performance results
 */
export function printPerformanceTable(report: PerformanceReport): void {
  const nameWidth = 35;
  const durationWidth = 12;
  const categoryWidth = 14;
  const statusWidth = 8;

  const totalWidth = nameWidth + durationWidth + categoryWidth + statusWidth + 7;

  // Header
  console.log("┌" + "─".repeat(totalWidth - 2) + "┐");
  console.log(
    "│ " +
      "Operation".padEnd(nameWidth) +
      "│ " +
      "Duration".padStart(durationWidth - 1) +
      " │ " +
      "Category".padEnd(categoryWidth - 1) +
      "│ " +
      "Status".padEnd(statusWidth - 2) +
      "│"
  );
  console.log(
    "├" +
      "─".repeat(nameWidth + 1) +
      "┼" +
      "─".repeat(durationWidth + 1) +
      "┼" +
      "─".repeat(categoryWidth) +
      "┼" +
      "─".repeat(statusWidth - 1) +
      "┤"
  );

  // Rows
  for (const entry of report) {
    const name = entry.name.length > nameWidth - 1
      ? entry.name.substring(0, nameWidth - 4) + "..."
      : entry.name.padEnd(nameWidth);

    const duration = entry.status === "skipped" || entry.status === "error"
      ? "-".padStart(durationWidth - 1)
      : formatDuration(entry.durationMs).padStart(durationWidth - 1);

    const category = entry.category.padEnd(categoryWidth - 1);
    const statusIcon = getStatusIcon(entry.status);
    const statusText = `${statusIcon} ${entry.status}`.padEnd(statusWidth - 2);

    console.log(`│ ${name}│ ${duration} │ ${category}│ ${statusText}│`);
  }

  // Footer
  console.log("└" + "─".repeat(totalWidth - 2) + "┘");
}

/**
 * Generate summary statistics from report
 */
export function generateSummary(report: PerformanceReport): {
  totalMs: number;
  bottleneck: PerformanceEntry | null;
  warnings: PerformanceEntry[];
  criticals: PerformanceEntry[];
  errors: PerformanceEntry[];
  successCount: number;
  totalCount: number;
} {
  const validEntries = report.filter(
    (e) => e.status !== "skipped" && e.status !== "error"
  );

  const totalMs = validEntries.reduce((sum, e) => sum + e.durationMs, 0);

  const bottleneck = validEntries.length > 0
    ? validEntries.reduce((max, e) => (e.durationMs > max.durationMs ? e : max))
    : null;

  const warnings = report.filter((e) => e.status === "warning");
  const criticals = report.filter((e) => e.status === "critical");
  const errors = report.filter((e) => e.status === "error");
  const successCount = report.filter(
    (e) => e.status === "ok" || e.status === "warning"
  ).length;

  return {
    totalMs,
    bottleneck,
    warnings,
    criticals,
    errors,
    successCount,
    totalCount: report.length,
  };
}

/**
 * Print summary of benchmark results
 */
export function printSummary(report: PerformanceReport): void {
  const summary = generateSummary(report);

  console.log();
  console.log("═".repeat(60));
  console.log("Summary");
  console.log("═".repeat(60));
  console.log();
  console.log(`  Total benchmarks: ${summary.successCount}/${summary.totalCount} passed`);
  console.log(`  Total time: ${formatDuration(summary.totalMs)}`);

  if (summary.bottleneck) {
    console.log(
      `  Bottleneck: ${summary.bottleneck.name} (${formatDuration(summary.bottleneck.durationMs)})`
    );
  }

  if (summary.warnings.length > 0) {
    console.log();
    console.log("  ⚠ Warnings:");
    for (const w of summary.warnings) {
      console.log(`    - ${w.name}: ${formatDuration(w.durationMs)}`);
    }
  }

  if (summary.criticals.length > 0) {
    console.log();
    console.log("  ✗ Critical (exceeds 2x threshold):");
    for (const c of summary.criticals) {
      console.log(`    - ${c.name}: ${formatDuration(c.durationMs)}`);
    }
  }

  if (summary.errors.length > 0) {
    console.log();
    console.log("  ! Errors:");
    for (const e of summary.errors) {
      console.log(`    - ${e.name}: ${e.error || "Unknown error"}`);
    }
  }

  // Recommendations
  const recommendations: string[] = [];

  if (summary.criticals.some((c) => c.category === "Processing")) {
    recommendations.push(
      "Consider using a dedicated Document AI processor for high-volume OCR"
    );
  }

  if (summary.criticals.some((c) => c.name.includes("Search"))) {
    recommendations.push(
      "Consider adding more specific indexes or reducing result limits"
    );
  }

  if (summary.criticals.some((c) => c.category === "Database")) {
    recommendations.push(
      "Database operations are slow - check connection pooling and indexes"
    );
  }

  if (recommendations.length > 0) {
    console.log();
    console.log("  Recommendations:");
    for (const rec of recommendations) {
      console.log(`    → ${rec}`);
    }
  }

  console.log();
}

/**
 * Save benchmark report to JSON file
 */
export function generateJsonReport(
  report: PerformanceReport,
  metadata: {
    timestamp: string;
    nodeVersion: string;
    quickMode: boolean;
  }
): object {
  const summary = generateSummary(report);

  return {
    metadata: {
      ...metadata,
      generatedAt: new Date().toISOString(),
    },
    summary: {
      totalMs: summary.totalMs,
      totalFormatted: formatDuration(summary.totalMs),
      bottleneck: summary.bottleneck
        ? {
            name: summary.bottleneck.name,
            durationMs: summary.bottleneck.durationMs,
          }
        : null,
      successCount: summary.successCount,
      totalCount: summary.totalCount,
      warningCount: summary.warnings.length,
      criticalCount: summary.criticals.length,
      errorCount: summary.errors.length,
    },
    results: report.map((entry) => ({
      name: entry.name,
      category: entry.category,
      durationMs: entry.durationMs,
      durationFormatted: formatDuration(entry.durationMs),
      status: entry.status,
      error: entry.error,
    })),
    thresholds: THRESHOLDS,
  };
}
