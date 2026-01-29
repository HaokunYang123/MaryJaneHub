#!/usr/bin/env npx tsx
/**
 * Test Processing Queue
 *
 * Tests the job queue system:
 * 1. Creates test jobs
 * 2. Claims jobs (simulating workers)
 * 3. Updates progress
 * 4. Completes/fails jobs
 * 5. Tests retry logic
 *
 * Usage: npm run test:queue
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  createJobs,
  claimJobs,
  updateJobProgress,
  completeJob,
  failJob,
  shouldRetry,
  resetFailedJobs,
  getBatchStats,
  getPendingJobCount,
  cancelPendingJobs,
  getJob,
  getRecentJobs,
} from "../lib/queue";
import type { CreateJobInput, ProcessingStep } from "../lib/queue";

const TEST_BATCH_ID = "00000000-0000-0000-0000-000000000001";

function log(message: string) {
  console.log(`\n${message}`);
}

function logSection(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(title);
  console.log("=".repeat(60));
}

async function cleanupTestJobs() {
  log("Cleaning up any existing test jobs...");
  await cancelPendingJobs(TEST_BATCH_ID);
}

async function testCreateJobs() {
  logSection("Test 1: Create Jobs");

  const testFiles: CreateJobInput[] = [
    {
      drive_file_id: "test-file-001",
      drive_file_name: "invoice-001.pdf",
      mime_type: "application/pdf",
      batch_id: TEST_BATCH_ID,
    },
    {
      drive_file_id: "test-file-002",
      drive_file_name: "receipt-002.pdf",
      mime_type: "application/pdf",
      batch_id: TEST_BATCH_ID,
    },
    {
      drive_file_id: "test-file-003",
      drive_file_name: "contract-003.pdf",
      mime_type: "application/pdf",
      batch_id: TEST_BATCH_ID,
    },
  ];

  const result = await createJobs(testFiles);

  console.log(`  Created: ${result.created}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Success: ${result.success}`);

  if (result.jobs) {
    console.log(`  Jobs:`);
    for (const job of result.jobs) {
      console.log(`    - ${job.id}: ${job.drive_file_name} (${job.status})`);
    }
  }

  return result.success;
}

async function testDuplicatePrevention() {
  logSection("Test 2: Duplicate Prevention");

  // Try to create a job with the same drive_file_id
  const duplicateInput: CreateJobInput[] = [
    {
      drive_file_id: "test-file-001", // Already exists
      drive_file_name: "invoice-001-duplicate.pdf",
      mime_type: "application/pdf",
      batch_id: TEST_BATCH_ID,
    },
  ];

  const result = await createJobs(duplicateInput);

  console.log(`  Created: ${result.created}`);
  console.log(`  Skipped: ${result.skipped}`);

  if (result.skipped === 1) {
    console.log("  PASS: Duplicate was correctly skipped");
    return true;
  } else {
    console.log("  FAIL: Duplicate was not prevented");
    return false;
  }
}

async function testClaimJobs() {
  logSection("Test 3: Claim Jobs");

  const pendingBefore = await getPendingJobCount();
  console.log(`  Pending jobs before: ${pendingBefore}`);

  // Claim 2 jobs
  const claimed = await claimJobs(2);

  console.log(`  Claimed ${claimed.length} job(s):`);
  for (const job of claimed) {
    console.log(`    - ${job.id}: ${job.drive_file_name}`);
    console.log(`      Status: ${job.status}`);
    console.log(`      Attempts: ${job.attempts}`);
    console.log(`      Started: ${job.started_at}`);
  }

  const pendingAfter = await getPendingJobCount();
  console.log(`  Pending jobs after: ${pendingAfter}`);

  return claimed;
}

async function testJobProgress(jobId: string) {
  logSection("Test 4: Update Job Progress");

  const steps: ProcessingStep[] = ["download", "ocr", "classify"];
  const completedSteps: ProcessingStep[] = [];

  for (const step of steps) {
    completedSteps.push(step);
    await updateJobProgress(jobId, {
      current_step: step,
      steps_completed: [...completedSteps],
    });
    console.log(`  Updated: current_step = ${step}`);
  }

  const job = await getJob(jobId);
  console.log(`  Job after updates:`);
  console.log(`    Current step: ${job?.current_step}`);
  console.log(`    Steps completed: ${JSON.stringify(job?.steps_completed)}`);

  return true;
}

async function testCompleteJob(jobId: string) {
  logSection("Test 5: Complete Job");

  // Complete without document_id (testing queue mechanics, not document creation)
  await completeJob(jobId);

  const job = await getJob(jobId);
  console.log(`  Job status: ${job?.status}`);
  console.log(`  Document ID: ${job?.document_id || "(none - test mode)"}`);
  console.log(`  Completed at: ${job?.completed_at}`);

  return job?.status === "completed";
}

async function testFailJob(jobId: string) {
  logSection("Test 6: Fail Job");

  const testError = new Error("Test error: Simulated OCR failure");

  await failJob(jobId, testError);

  const job = await getJob(jobId);
  console.log(`  Job status: ${job?.status}`);
  console.log(`  Error message: ${job?.error_message}`);
  console.log(`  Attempts: ${job?.attempts}`);

  if (job) {
    const canRetry = shouldRetry(job);
    console.log(`  Should retry: ${canRetry}`);
  }

  return job?.status === "failed";
}

async function testRetryLogic() {
  logSection("Test 7: Retry Logic");

  // Reset failed jobs for retry
  const resetCount = await resetFailedJobs(TEST_BATCH_ID);
  console.log(`  Reset ${resetCount} job(s) for retry`);

  const pendingCount = await getPendingJobCount();
  console.log(`  Pending jobs after reset: ${pendingCount}`);

  return true;
}

async function testBatchStats() {
  logSection("Test 8: Batch Statistics");

  const stats = await getBatchStats(TEST_BATCH_ID);

  if (stats) {
    console.log(`  Batch ID: ${stats.batch_id}`);
    console.log(`  Total:      ${stats.total}`);
    console.log(`  Pending:    ${stats.pending}`);
    console.log(`  Processing: ${stats.processing}`);
    console.log(`  Completed:  ${stats.completed}`);
    console.log(`  Failed:     ${stats.failed}`);
    console.log(`  Cancelled:  ${stats.cancelled}`);
  } else {
    console.log("  No stats found for batch");
  }

  return true;
}

async function testConcurrentClaims() {
  logSection("Test 9: Concurrent Claims (Simulated)");

  // Create more jobs for testing
  const moreJobs: CreateJobInput[] = Array.from({ length: 5 }, (_, i) => ({
    drive_file_id: `concurrent-test-${i}`,
    drive_file_name: `concurrent-${i}.pdf`,
    mime_type: "application/pdf",
    batch_id: TEST_BATCH_ID,
  }));

  await createJobs(moreJobs);

  // Simulate concurrent workers claiming jobs
  console.log("  Simulating 3 workers claiming 2 jobs each...");

  const claims = await Promise.all([
    claimJobs(2),
    claimJobs(2),
    claimJobs(2),
  ]);

  const totalClaimed = claims.flat();
  const uniqueIds = new Set(totalClaimed.map((j) => j.id));

  console.log(`  Worker 1 claimed: ${claims[0].length}`);
  console.log(`  Worker 2 claimed: ${claims[1].length}`);
  console.log(`  Worker 3 claimed: ${claims[2].length}`);
  console.log(`  Total claimed: ${totalClaimed.length}`);
  console.log(`  Unique jobs: ${uniqueIds.size}`);

  if (totalClaimed.length === uniqueIds.size) {
    console.log("  PASS: No duplicate claims (SKIP LOCKED working)");
    return true;
  } else {
    console.log("  FAIL: Duplicate claims detected!");
    return false;
  }
}

async function testRecentJobs() {
  logSection("Test 10: Get Recent Jobs");

  const recentJobs = await getRecentJobs(10);

  console.log(`  Found ${recentJobs.length} recent job(s):`);
  for (const job of recentJobs.slice(0, 5)) {
    console.log(`    - ${job.drive_file_name}: ${job.status}`);
  }

  return true;
}

async function cleanup() {
  logSection("Cleanup");

  // Cancel all remaining test jobs
  const cancelled = await cancelPendingJobs(TEST_BATCH_ID);
  console.log(`  Cancelled ${cancelled} remaining test job(s)`);
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           Processing Queue Test Suite                      ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  try {
    await cleanupTestJobs();

    // Run tests
    await testCreateJobs();
    await testDuplicatePrevention();

    const claimedJobs = await testClaimJobs();

    if (claimedJobs.length >= 2) {
      await testJobProgress(claimedJobs[0].id);
      await testCompleteJob(claimedJobs[0].id);
      await testFailJob(claimedJobs[1].id);
    }

    await testRetryLogic();
    await testBatchStats();
    await testConcurrentClaims();
    await testRecentJobs();

    await cleanup();

    logSection("Summary");
    console.log("  All tests completed. Check output above for PASS/FAIL.");

  } catch (error) {
    console.error("\n❌ Test failed with error:", error);
    process.exit(1);
  }
}

main();
