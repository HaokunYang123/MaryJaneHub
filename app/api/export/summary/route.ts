import { NextResponse } from "next/server";
import { generateSummaryReport } from "@/lib/export";
import type { ExportOptions } from "@/lib/export/types";

/**
 * GET /api/export/summary
 *
 * Generate summary report in JSON format.
 *
 * Query params:
 * - types: comma-separated document types
 * - dateFrom: YYYY-MM-DD
 * - dateTo: YYYY-MM-DD
 * - minAmount: number
 * - maxAmount: number
 * - status: comma-separated sync statuses
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    // Parse options from query params
    const options: ExportOptions = {};

    const types = searchParams.get("types");
    if (types) {
      options.documentTypes = types.split(",").map((t) => t.trim());
    }

    const dateFrom = searchParams.get("dateFrom");
    if (dateFrom) options.dateFrom = dateFrom;

    const dateTo = searchParams.get("dateTo");
    if (dateTo) options.dateTo = dateTo;

    const minAmount = searchParams.get("minAmount");
    if (minAmount) options.minAmount = parseFloat(minAmount);

    const maxAmount = searchParams.get("maxAmount");
    if (maxAmount) options.maxAmount = parseFloat(maxAmount);

    const status = searchParams.get("status");
    if (status) {
      options.syncStatus = status.split(",").map((s) => s.trim());
    }

    // Always include low confidence in summary for issue detection
    options.includeLowConfidence = true;

    const summary = await generateSummaryReport(options);

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Summary report error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: `Failed to generate summary: ${message}` },
      { status: 500 }
    );
  }
}
