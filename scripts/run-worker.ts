#!/usr/bin/env npx tsx
/**
 * Run Processing Worker
 *
 * Processes document jobs from the queue with parallel processing.
 *
 * Usage:
 *   npm run worker                    # Queue inbox files and process
 *   npm run worker:only               # Process only existing queued jobs
 *   npm run worker -- full 2 3        # concurrency=2, batchSize=3
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { queueAndProcessInbox, processQueuedJobs } from "../lib/queue";

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || "full"; // 'full' | 'worker-only'

  const config = {
    concurrency: parseInt(args[1] || "16", 10),
    batchSize: parseInt(args[2] || "15", 10),
    maxRunTime: undefined as number | undefined, // No limit for manual runs
  };

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           Document Processing Worker                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`Mode: ${mode}`);
  console.log(`Concurrency: ${config.concurrency}`);
  console.log(`Batch Size: ${config.batchSize}`);
  console.log();

  try {
    let stats;

    if (mode === "full") {
      // Queue inbox files and process
      stats = await queueAndProcessInbox(config);
      console.log();
      console.log("═══════════════════════════════════════════════════════════");
      console.log("Final Stats:");
      console.log("═══════════════════════════════════════════════════════════");
      console.log(`  Queued:    ${(stats as { queued: number }).queued}`);
      console.log(`  Processed: ${stats.processed}`);
      console.log(`  Succeeded: ${stats.succeeded}`);
      console.log(`  Failed:    ${stats.failed}`);
      console.log(`  Skipped:   ${stats.skipped}`);
    } else {
      // Just run worker on existing queued jobs
      stats = await processQueuedJobs(config);
      console.log();
      console.log("═══════════════════════════════════════════════════════════");
      console.log("Final Stats:");
      console.log("═══════════════════════════════════════════════════════════");
      console.log(`  Processed: ${stats.processed}`);
      console.log(`  Succeeded: ${stats.succeeded}`);
      console.log(`  Failed:    ${stats.failed}`);
      console.log(`  Skipped:   ${stats.skipped}`);
    }

    const duration = stats.endTime
      ? stats.endTime.getTime() - stats.startTime.getTime()
      : 0;
    console.log(`  Duration:  ${(duration / 1000).toFixed(1)}s`);

  } catch (error) {
    console.error("Worker error:", error);
    process.exit(1);
  }
}

main();
