import { NextRequest, NextResponse } from "next/server";
import { exportToCSV, exportToExcel } from "@/lib/export";
import type { ExportOptions } from "@/lib/export/types";
import { verifyAuth } from "@/lib/auth/api-middleware";

/**
 * GET /api/export
 *
 * Export documents with optional filtering.
 *
 * Query params:
 * - format: 'csv' | 'xlsx' (default: csv)
 * - types: comma-separated document types
 * - dateFrom: YYYY-MM-DD
 * - dateTo: YYYY-MM-DD
 * - minAmount: number
 * - maxAmount: number
 * - status: comma-separated sync statuses
 * - includeRawText: boolean
 * - includeLowConfidence: boolean
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated) {
      return authResult.response!;
    }

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

    options.includeRawText = searchParams.get("includeRawText") === "true";
    options.includeLowConfidence = searchParams.get("includeLowConfidence") === "true";

    // Determine format
    const format = searchParams.get("format") || "csv";
    const timestamp = new Date().toISOString().split("T")[0];

    if (format === "xlsx") {
      const buffer = await exportToExcel(options);

      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="due-diligence-export-${timestamp}.xlsx"`,
        },
      });
    } else {
      const csv = await exportToCSV(options);

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="due-diligence-export-${timestamp}.csv"`,
        },
      });
    }
  } catch (error) {
    console.error("Export error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: `Export failed: ${message}` },
      { status: 500 }
    );
  }
}
