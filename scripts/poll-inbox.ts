import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { processAllInboxFiles } from "../lib/workflow/process-inbox.js";

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "60000", 10);

let isProcessing = false;

async function poll(): Promise<void> {
  // Prevent overlapping polls
  if (isProcessing) {
    console.log(`[${new Date().toISOString()}] Previous poll still running, skipping...`);
    return;
  }

  isProcessing = true;
  console.log(`\n[${new Date().toISOString()}] Checking INBOX...`);

  try {
    const result = await processAllInboxFiles();

    if (result.total === 0) {
      console.log("No new files found.");
    } else {
      console.log(
        `Processed: ${result.processed}, Skipped: ${result.skipped}, Failed: ${result.failed}`
      );

      // Log details for processed files
      for (const r of result.results) {
        if (r.success && !r.skipped) {
          console.log(`  ✓ ${r.originalName} → ${r.newName}`);
        } else if (r.skipped) {
          console.log(`  - ${r.originalName} (already processed)`);
        } else {
          console.log(`  ✗ ${r.originalName}: ${r.error}`);
        }
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Polling error: ${errorMessage}`);
  } finally {
    isProcessing = false;
  }
}

// Startup banner
console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║              INBOX POLLING SERVICE STARTED                 ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log(`\nPoll interval: ${POLL_INTERVAL_MS / 1000} seconds`);
console.log("Press Ctrl+C to stop.\n");

// Run immediately
poll();

// Then run every POLL_INTERVAL_MS
setInterval(poll, POLL_INTERVAL_MS);

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nShutting down polling service...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\nReceived SIGTERM, shutting down...");
  process.exit(0);
});
