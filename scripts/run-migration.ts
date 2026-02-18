#!/usr/bin/env npx tsx
/**
 * Migration Runner
 *
 * Runs SQL migration files directly against Supabase PostgreSQL.
 *
 * Usage:
 *   npm run db:migrate supabase/migrations/009_processing_queue.sql
 *   npm run db:migrate:all  # Run all pending migrations
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";
import { requireSafeEnv } from "./lib/check-env";

function getDatabaseUrl(): string {
  // Check various possible env var names (including the typo)
  const url =
    process.env.DATABASE_URL ||
    process.env.DTATBASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL;

  if (!url) {
    console.error("Error: No database URL found in environment variables.");
    console.error("Expected one of: DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL");
    console.error("\nTo get your connection string:");
    console.error("1. Go to Supabase Dashboard > Project Settings > Database");
    console.error("2. Copy the 'Connection string' (URI format)");
    console.error("3. Add to .env.local as DATABASE_URL=postgresql://...");
    process.exit(1);
  }

  return url;
}

async function runMigration(filePath: string): Promise<void> {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: Migration file not found: ${absolutePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(absolutePath, "utf-8");
  const fileName = path.basename(filePath);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Running migration: ${fileName}`);
  console.log("=".repeat(60));

  const client = new Client({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    // Run the migration
    console.log("Executing SQL...\n");
    await client.query(sql);

    console.log(`\nMigration ${fileName} completed successfully.`);
  } catch (error) {
    console.error("\nMigration failed:");
    if (error instanceof Error) {
      console.error(error.message);
      if ("detail" in error) {
        console.error("Detail:", (error as { detail: string }).detail);
      }
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

async function verifyMigration(): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Verifying migration...");
  console.log("=".repeat(60));

  const client = new Client({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'processing_jobs'
      ) as exists;
    `);
    console.log(`\nTable 'processing_jobs' exists: ${tableCheck.rows[0].exists}`);

    // Check if functions exist
    const functionCheck = await client.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('claim_processing_jobs', 'get_batch_stats');
    `);
    console.log(`Functions created: ${functionCheck.rows.map((r) => r.routine_name).join(", ") || "none"}`);

    // Show table columns
    if (tableCheck.rows[0].exists) {
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'processing_jobs'
        ORDER BY ordinal_position;
      `);

      console.log(`\nTable structure (${columns.rows.length} columns):`);
      for (const col of columns.rows) {
        const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default.substring(0, 30)}...` : "";
        console.log(`  - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      }

      // Show indexes
      const indexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'processing_jobs';
      `);
      console.log(`\nIndexes (${indexes.rows.length}):`);
      for (const idx of indexes.rows) {
        console.log(`  - ${idx.indexname}`);
      }
    }

  } finally {
    await client.end();
  }
}

async function runSqlQuery(sql: string): Promise<void> {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const result = await client.query(sql);
    console.log("Query result:");
    console.table(result.rows);
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  requireSafeEnv(args, "run-migration");

  if (args.filter((a) => !a.startsWith("--env")).length === 0) {
    console.log("Usage:");
    console.log("  npm run db:migrate <migration-file.sql> --env=local|staging");
    console.log("  npm run db:migrate --verify --env=local|staging");
    console.log("  npm run db:migrate --query 'SELECT ...' --env=local|staging");
    process.exit(0);
  }

  if (args[0] === "--verify") {
    await verifyMigration();
    return;
  }

  if (args[0] === "--query" && args[1]) {
    await runSqlQuery(args[1]);
    return;
  }

  // Run migration file
  await runMigration(args[0]);
  await verifyMigration();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
