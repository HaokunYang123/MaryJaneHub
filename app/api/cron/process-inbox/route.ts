import { NextResponse } from "next/server";
import { queueAndProcessInbox } from "@/lib/queue";

/**
 * Vercel Cron endpoint for processing inbox files
 * Called automatically by Vercel Cron based on vercel.json schedule
 *
 * Uses parallel processing with configurable concurrency.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error("Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[${new Date().toISOString()}] Cron job triggered: process-inbox (parallel)`);

  try {
    const stats = await queueAndProcessInbox({
      concurrency: 12, // Process 12 files in parallel
      batchSize: 15, // Claim 15 jobs per cycle
      maxRunTime: 55000, // 55 seconds (safe for Vercel 60s timeout)
    });

    console.log(
      `Cron complete: ${stats.queued} queued, ${stats.processed} processed, ` +
        `${stats.succeeded} succeeded, ${stats.failed} failed, ${stats.skipped} skipped`
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      queued: stats.queued,
      processed: stats.processed,
      succeeded: stats.succeeded,
      failed: stats.failed,
      skipped: stats.skipped,
      duration: stats.endTime
        ? stats.endTime.getTime() - stats.startTime.getTime()
        : 0,
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
