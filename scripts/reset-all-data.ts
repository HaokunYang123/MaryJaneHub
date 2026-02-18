import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";
import { getDriveClient } from "../lib/google-drive/client";

interface ResetOptions {
  confirm: boolean;
}

interface ResetStats {
  supabase: {
    auditLogs: number;
    processingJobs: number;
    documentLayouts: number;
    documents: number;
    qbTokens: number;
  };
  googleDrive: {
    inboxFiles: number;
    processedFiles: number;
  };
}

/**
 * Count records in Supabase tables
 */
async function countSupabaseRecords(): Promise<ResetStats["supabase"]> {
  const supabase = getSupabase();

  const [
    auditLogsResult,
    processingJobsResult,
    documentLayoutsResult,
    documentsResult,
    qbTokensResult,
  ] =
    await Promise.all([
      supabase.from("audit_logs").select("*", { count: "exact", head: true }),
      supabase
        .from("processing_jobs")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("document_layouts")
        .select("*", { count: "exact", head: true }),
      supabase.from("documents").select("*", { count: "exact", head: true }),
      supabase.from("qb_tokens").select("*", { count: "exact", head: true }),
    ]);

  return {
    auditLogs: auditLogsResult.count || 0,
    processingJobs: processingJobsResult.count || 0,
    documentLayouts: documentLayoutsResult.count || 0,
    documents: documentsResult.count || 0,
    qbTokens: qbTokensResult.count || 0,
  };
}

/**
 * Clear all Supabase tables in correct order (foreign keys)
 */
async function clearSupabaseTables(): Promise<void> {
  const supabase = getSupabase();

  // Delete in order to respect foreign key constraints
  // 1. audit_logs (references documents)
  const { error: auditError } = await supabase
    .from("audit_logs")
    .delete()
    .gte("id", "00000000-0000-0000-0000-000000000000");

  if (auditError) {
    throw new Error(`Failed to clear audit_logs: ${auditError.message}`);
  }
  console.log("  Cleared audit_logs");

  // 2. processing_jobs (references documents)
  const { error: jobsError } = await supabase
    .from("processing_jobs")
    .delete()
    .gte("id", "00000000-0000-0000-0000-000000000000");

  if (jobsError) {
    throw new Error(`Failed to clear processing_jobs: ${jobsError.message}`);
  }
  console.log("  Cleared processing_jobs");

  // 3. document_layouts (references documents)
  const { error: layoutsError } = await supabase
    .from("document_layouts")
    .delete()
    .gte("document_id", "00000000-0000-0000-0000-000000000000");

  if (layoutsError) {
    console.warn(`  Warning: Failed to clear document_layouts: ${layoutsError.message}`);
  } else {
    console.log("  Cleared document_layouts");
  }

  // 4. documents (base table)
  const { error: docsError } = await supabase
    .from("documents")
    .delete()
    .gte("id", "00000000-0000-0000-0000-000000000000");

  if (docsError) {
    throw new Error(`Failed to clear documents: ${docsError.message}`);
  }
  console.log("  Cleared documents");

  // 5. qb_tokens (no FK dependencies)
  const { error: tokensError } = await supabase
    .from("qb_tokens")
    .delete()
    .gte("id", "");

  if (tokensError) {
    console.warn(`  Warning: Failed to clear qb_tokens: ${tokensError.message}`);
  } else {
    console.log("  Cleared qb_tokens");
  }
}

/**
 * List all files in a Google Drive folder
 */
async function listDriveFiles(
  folderId: string
): Promise<Array<{ id: string; name: string }>> {
  const drive = getDriveClient();
  const allFiles: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = response.data.files || [];
    for (const file of files) {
      if (file.id && file.name) {
        allFiles.push({ id: file.id, name: file.name });
      }
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return allFiles;
}

/**
 * Delete files from Google Drive permanently
 */
async function deleteDriveFiles(
  files: Array<{ id: string; name: string }>,
  folderName: string
): Promise<void> {
  const drive = getDriveClient();
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    try {
      await drive.files.delete({ fileId: file.id, supportsAllDrives: true });
      console.log(`  Deleted: ${file.name}`);
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  Failed: ${file.name} (${message})`);
      failCount++;
    }
  }

  if (failCount > 0) {
    console.log(
      `\n  ${folderName}: ${successCount} deleted, ${failCount} failed`
    );
  }
}

/**
 * Main reset function
 */
async function resetAllData(options: ResetOptions): Promise<void> {
  console.log("=".repeat(60));
  console.log("DATA RESET SCRIPT");
  console.log("=".repeat(60));

  if (!options.confirm) {
    console.log("\nDRY RUN MODE - No data will be deleted");
    console.log("Add --confirm flag to actually delete data\n");
  } else {
    console.log("\nLIVE MODE - Data WILL be permanently deleted\n");
  }

  const inboxFolderId = process.env.GOOGLE_DRIVE_INBOX_FOLDER_ID;
  const processedFolderId = process.env.GOOGLE_DRIVE_PROCESSED_FOLDER_ID;

  if (!inboxFolderId) {
    throw new Error("GOOGLE_DRIVE_INBOX_FOLDER_ID is required");
  }
  if (!processedFolderId) {
    throw new Error("GOOGLE_DRIVE_PROCESSED_FOLDER_ID is required");
  }

  const stats: ResetStats = {
    supabase: { auditLogs: 0, processingJobs: 0, documentLayouts: 0, documents: 0, qbTokens: 0 },
    googleDrive: { inboxFiles: 0, processedFiles: 0 },
  };

  // 1. Count Supabase records
  console.log("Counting Supabase records...");
  try {
    stats.supabase = await countSupabaseRecords();
    console.log(`  audit_logs: ${stats.supabase.auditLogs}`);
    console.log(`  processing_jobs: ${stats.supabase.processingJobs}`);
    console.log(`  document_layouts: ${stats.supabase.documentLayouts}`);
    console.log(`  documents: ${stats.supabase.documents}`);
    console.log(`  qb_tokens: ${stats.supabase.qbTokens}`);
  } catch (error) {
    console.error(
      `  Error: ${error instanceof Error ? error.message : error}`
    );
  }

  // 2. List Google Drive INBOX folder
  console.log("\nListing Google Drive INBOX folder...");
  let inboxFiles: Array<{ id: string; name: string }> = [];
  try {
    inboxFiles = await listDriveFiles(inboxFolderId);
    stats.googleDrive.inboxFiles = inboxFiles.length;
    console.log(`  Files: ${inboxFiles.length}`);
    if (inboxFiles.length > 0 && inboxFiles.length <= 10) {
      inboxFiles.forEach((f) => console.log(`    - ${f.name}`));
    } else if (inboxFiles.length > 10) {
      inboxFiles.slice(0, 5).forEach((f) => console.log(`    - ${f.name}`));
      console.log(`    ... and ${inboxFiles.length - 5} more`);
    }
  } catch (error) {
    console.error(
      `  Error: ${error instanceof Error ? error.message : error}`
    );
  }

  // 3. List Google Drive Processed folder
  console.log("\nListing Google Drive Processed folder...");
  let processedFiles: Array<{ id: string; name: string }> = [];
  try {
    processedFiles = await listDriveFiles(processedFolderId);
    stats.googleDrive.processedFiles = processedFiles.length;
    console.log(`  Files: ${processedFiles.length}`);
    if (processedFiles.length > 0 && processedFiles.length <= 10) {
      processedFiles.forEach((f) => console.log(`    - ${f.name}`));
    } else if (processedFiles.length > 10) {
      processedFiles.slice(0, 5).forEach((f) => console.log(`    - ${f.name}`));
      console.log(`    ... and ${processedFiles.length - 5} more`);
    }
  } catch (error) {
    console.error(
      `  Error: ${error instanceof Error ? error.message : error}`
    );
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const totalSupabase =
    stats.supabase.auditLogs +
    stats.supabase.processingJobs +
    stats.supabase.documentLayouts +
    stats.supabase.qbTokens +
    stats.supabase.documents;
  const totalDrive =
    stats.googleDrive.inboxFiles + stats.googleDrive.processedFiles;

  console.log(`Supabase records to delete: ${totalSupabase}`);
  console.log(
    `Google Drive files to delete: ${totalDrive} (${stats.googleDrive.inboxFiles} inbox, ${stats.googleDrive.processedFiles} processed)`
  );

  const totalItems = totalSupabase + totalDrive;

  if (totalItems === 0) {
    console.log("\nNothing to delete - all storage is already empty!");
    return;
  }

  // Execute deletion if confirmed
  if (!options.confirm) {
    console.log("\n" + "-".repeat(60));
    console.log("To execute deletion, run:");
    console.log("  npm run reset:execute");
    return;
  }

  console.log("\nExecuting deletion...\n");

  // Delete Supabase records
  if (totalSupabase > 0) {
    console.log("Clearing Supabase tables...");
    try {
      await clearSupabaseTables();
      console.log("Supabase tables cleared\n");
    } catch (error) {
      console.error(
        `Error clearing Supabase: ${error instanceof Error ? error.message : error}\n`
      );
    }
  }

  // Delete Google Drive INBOX files
  if (inboxFiles.length > 0) {
    console.log("Clearing Google Drive INBOX folder...");
    try {
      await deleteDriveFiles(inboxFiles, "INBOX");
      console.log("INBOX folder cleared\n");
    } catch (error) {
      console.error(
        `Error clearing INBOX: ${error instanceof Error ? error.message : error}\n`
      );
    }
  }

  // Delete Google Drive Processed files
  if (processedFiles.length > 0) {
    console.log("Clearing Google Drive Processed folder...");
    try {
      await deleteDriveFiles(processedFiles, "Processed");
      console.log("Processed folder cleared\n");
    } catch (error) {
      console.error(
        `Error clearing Processed: ${error instanceof Error ? error.message : error}\n`
      );
    }
  }

  console.log("=".repeat(60));
  console.log("RESET COMPLETE");
  console.log("=".repeat(60));
}

// Parse command line arguments
const args = process.argv.slice(2);
const confirm = args.includes("--confirm");

// Environment safety gate — requires explicit --env=local or --env=staging flag.
// Prevents accidental execution against production data.
const envFlag = args.find((a) => a.startsWith("--env="))?.split("=")[1];

if (!envFlag) {
  console.error(
    "ERROR: --env flag required. Use --env=local or --env=staging.\n" +
    "  npm run reset:execute -- --env=local\n" +
    "  npm run reset:execute -- --env=staging"
  );
  process.exit(1);
}

if (envFlag !== "local" && envFlag !== "staging") {
  console.error(`ERROR: Invalid --env value "${envFlag}". Must be "local" or "staging".`);
  process.exit(1);
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();

if (envFlag === "local") {
  const isLocal =
    supabaseUrl.startsWith("http://localhost") ||
    supabaseUrl.startsWith("http://127.0.0.1");
  if (!isLocal) {
    console.error(
      `ERROR: --env=local specified but SUPABASE_URL does not look local.\n` +
      `  SUPABASE_URL: ${supabaseUrl || "(not set)"}\n` +
      `  Expected a localhost URL. Refusing to run.`
    );
    process.exit(1);
  }
}

if (envFlag === "staging") {
  const isProduction = supabaseUrl.includes("supabase.co") && !supabaseUrl.includes("-staging");
  if (isProduction) {
    console.error(
      `ERROR: --env=staging specified but SUPABASE_URL appears to be a production URL.\n` +
      `  SUPABASE_URL: ${supabaseUrl}\n` +
      `  Refusing to run against production. Verify you have the staging .env loaded.`
    );
    process.exit(1);
  }
}

console.log(`[reset] Environment: ${envFlag} | Supabase: ${supabaseUrl}`);

// Run
resetAllData({ confirm }).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
