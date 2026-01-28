import { NextResponse } from "next/server";
import { processAllInboxFiles } from "@/lib/workflow/process-inbox";

/**
 * Vercel Cron endpoint for processing inbox files
 * Called automatically by Vercel Cron based on vercel.json schedule
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error("Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[${new Date().toISOString()}] Cron job triggered: process-inbox`);

  try {
    const result = await processAllInboxFiles();

    console.log(
      `Cron complete: ${result.processed} processed, ${result.skipped} skipped, ${result.failed} failed`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Cron error: ${errorMessage}`);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Disable body parsing for this route (not needed for GET)
export const dynamic = "force-dynamic";
