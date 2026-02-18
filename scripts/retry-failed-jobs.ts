#!/usr/bin/env npx tsx
/**
 * Retry Failed Jobs Script
 *
 * Resets failed jobs to pending status so they can be reprocessed
 * with the improved graceful degradation logic.
 *
 * Usage:
 *   npm run worker:retry-failed
 *   npm run worker:retry-failed -- --dry-run
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";
import { runWorker } from "../lib/queue/worker";
import { requireSafeEnv } from "./lib/check-env";

async function main() {
  const args = process.argv.slice(2);
  requireSafeEnv(args, "retry-failed-jobs");
  const dryRun = args.includes("--dry-run");

  const supabase = getSupabase();

  console.log("=".repeat(60));
  console.log(`Retry Failed Jobs ${dryRun ? "(DRY RUN)" : ""}`);
  console.log("=".repeat(60) + "\n");

  // Find all failed jobs
  const { data: failedJobs, error } = await supabase
    .from("processing_jobs")
    .select("id, drive_file_name, error_message, attempts")
    .eq("status", "failed")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching failed jobs:", error.message);
    process.exit(1);
  }

  if (!failedJobs || failedJobs.length === 0) {
    console.log("No failed jobs found.");
    return;
  }

  console.log(`Found ${failedJobs.length} failed job(s):\n`);

  failedJobs.forEach((job, i) => {
    console.log(`${i + 1}. ${job.drive_file_name}`);
    console.log(`   Attempts: ${job.attempts}`);
    console.log(`   Error: ${(job.error_message || "N/A").slice(0, 80)}`);
    console.log("");
  });

  if (dryRun) {
    console.log("DRY RUN - No changes made.");
    console.log("Run without --dry-run to actually retry these jobs.");
    return;
  }

  // Reset failed jobs to pending
  console.log("Resetting jobs to pending...\n");

  const jobIds = failedJobs.map((j) => j.id);

  const { error: updateError } = await supabase
    .from("processing_jobs")
    .update({
      status: "pending",
      error_message: null,
      current_step: null,
      steps_completed: [],
      started_at: null,
      completed_at: null,
      // Don't reset attempts - we want to track total attempts
    })
    .in("id", jobIds);

  if (updateError) {
    console.error("Error resetting jobs:", updateError.message);
    process.exit(1);
  }

  console.log(`Reset ${jobIds.length} job(s) to pending.\n`);

  // Ask if user wants to run worker now
  console.log("Starting worker to process reset jobs...\n");

  const stats = await runWorker({
    concurrency: 3, // Lower concurrency for retry
    batchSize: 5,
    maxRunTime: 120000, // 2 minutes
  });

  console.log("\n" + "=".repeat(60));
  console.log("Retry Results:");
  console.log("=".repeat(60));
  console.log(`  Processed: ${stats.processed}`);
  console.log(`  Succeeded: ${stats.succeeded}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Skipped: ${stats.skipped}`);

  // Check final status
  const { data: stillFailed } = await supabase
    .from("processing_jobs")
    .select("drive_file_name, error_message")
    .eq("status", "failed");

  if (stillFailed && stillFailed.length > 0) {
    console.log(`\nStill failed (${stillFailed.length}):`);
    stillFailed.forEach((job) => {
      console.log(`  - ${job.drive_file_name}`);
    });
  } else {
    console.log("\nAll previously failed jobs have been processed!");
  }
}

main().catch(console.error);
