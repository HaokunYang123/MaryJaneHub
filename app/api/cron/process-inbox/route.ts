import { NextResponse } from "next/server";
import { queueAndProcessInbox } from "@/lib/queue";

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseEnvBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.toLowerCase() === "true";
}

/**
 * Vercel Cron endpoint for processing inbox files
 * Called automatically by Vercel Cron based on vercel.json schedule
 *
 * Uses parallel processing with configurable concurrency.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error("Cron secret not configured");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("Unauthorized cron request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[${new Date().toISOString()}] Cron job triggered: process-inbox (parallel)`);

  try {
    const concurrency = parseEnvInt("WORKER_CONCURRENCY", 6);
    const batchSize = parseEnvInt("WORKER_BATCH_SIZE", 10);
    const maxRunTime = parseEnvInt("WORKER_MAX_RUNTIME_MS", 55000);
    const minConcurrency = parseEnvInt("WORKER_MIN_CONCURRENCY", 2);
    const maxConcurrency = parseEnvInt("WORKER_MAX_CONCURRENCY", 12);
    const scaleUpAfter = parseEnvInt("WORKER_SCALE_UP_AFTER", 2);
    const adaptiveConcurrency = parseEnvBool("WORKER_ADAPTIVE_CONCURRENCY", true);

    const stats = await queueAndProcessInbox({
      concurrency,
      batchSize,
      maxRunTime,
      adaptiveConcurrency,
      minConcurrency,
      maxConcurrency,
      scaleUpAfter,
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
