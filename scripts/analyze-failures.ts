#!/usr/bin/env npx tsx
/**
 * Analyze failed processing jobs
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";

async function main() {
  const supabase = getSupabase();

  console.log("=".repeat(60));
  console.log("Failed Jobs Analysis");
  console.log("=".repeat(60) + "\n");

  const { data: failed, error } = await supabase
    .from("processing_jobs")
    .select("drive_file_name, error_message, current_step, attempts, drive_file_id")
    .eq("status", "failed")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  if (failed.length === 0) {
    console.log("No failed jobs found.");
    return;
  }

  console.log(`Failed jobs: ${failed.length}\n`);

  // Group by error type
  const byStep: Record<string, number> = {};
  const byError: Record<string, number> = {};

  failed.forEach((job, i) => {
    console.log(`${i + 1}. ${job.drive_file_name}`);
    console.log(`   Step: ${job.current_step}`);
    console.log(`   Attempts: ${job.attempts}`);
    console.log(`   Error: ${(job.error_message || "N/A").slice(0, 120)}`);
    console.log(`   Drive ID: ${job.drive_file_id}`);
    console.log("");

    // Aggregate
    byStep[job.current_step] = (byStep[job.current_step] || 0) + 1;

    // Categorize error
    const err = job.error_message || "";
    if (err.includes("Extraction failed")) {
      byError["Extraction failed"] = (byError["Extraction failed"] || 0) + 1;
    } else if (err.includes("OCR failed")) {
      byError["OCR failed"] = (byError["OCR failed"] || 0) + 1;
    } else if (err.includes("Processing failed")) {
      byError["Processing failed"] = (byError["Processing failed"] || 0) + 1;
    } else {
      byError["Other"] = (byError["Other"] || 0) + 1;
    }
  });

  console.log("=".repeat(40));
  console.log("Summary by Step:");
  Object.entries(byStep).forEach(([step, count]) => {
    console.log(`  ${step}: ${count}`);
  });

  console.log("\nSummary by Error Type:");
  Object.entries(byError).forEach(([err, count]) => {
    console.log(`  ${err}: ${count}`);
  });

  // Check current sync_status values
  console.log("\n" + "=".repeat(40));
  console.log("Current sync_status values in documents:");
  const { data: statuses } = await supabase
    .from("documents")
    .select("sync_status");

  const statusCounts: Record<string, number> = {};
  statuses?.forEach((d) => {
    const s = d.sync_status || "null";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
}

main().catch(console.error);
