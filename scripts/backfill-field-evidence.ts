#!/usr/bin/env node
/**
 * Backfill Field Evidence Script
 *
 * Adds/repairs extraction.data.field_evidence for existing documents.
 * - Idempotent: only updates when evidence changes
 * - Checkpointed: stores last processed cursor
 * - Supports dry-run and sample modes
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { createHash } from "crypto";
import { getSupabase } from "../lib/supabase/client";
import { ensureFieldEvidence } from "../lib/workflow/field-evidence";
import type { FieldEvidenceMap } from "../lib/gemini/field-evidence";
import type { DocumentExtraction } from "../lib/gemini/extract-document";

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_CHECKPOINT_PATH = "exports/field-evidence-backfill-state.json";

type BackfillDoc = {
  id: string;
  created_at: string;
  extraction: DocumentExtraction;
  raw_text: string | null;
};

type Checkpoint = {
  run_id: string;
  updated_at: string;
  last_created_at: string | null;
  last_id: string | null;
  processed: number;
  updated: number;
  skipped: number;
  sample_mode: boolean;
  dry_run: boolean;
};

type Options = {
  dryRun: boolean;
  limit?: number;
  sample?: number;
  batchSize: number;
  checkpointPath: string;
};

function parseNumberArg(args: string[], flag: string): number | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const raw = args[index + 1];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const raw = args[index + 1];
  if (!raw) return undefined;
  return raw;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limit = parseNumberArg(args, "--limit");
  const sample = parseNumberArg(args, "--sample");
  const batchSize = parseNumberArg(args, "--batch-size") ?? DEFAULT_BATCH_SIZE;
  const checkpointPath =
    parseStringArg(args, "--checkpoint") ?? DEFAULT_CHECKPOINT_PATH;

  return { dryRun, limit, sample, batchSize, checkpointPath };
}

async function readCheckpoint(path: string): Promise<Checkpoint | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

async function writeCheckpoint(path: string, checkpoint: Checkpoint): Promise<void> {
  const dir = path.split("/").slice(0, -1).join("/");
  if (dir) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(path, JSON.stringify(checkpoint, null, 2));
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object") {
      if (seen.has(val)) return val;
      seen.add(val);
      if (!Array.isArray(val)) {
        return Object.keys(val)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (val as Record<string, unknown>)[key];
            return acc;
          }, {});
      }
    }
    return val;
  });
}

function hashId(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

function applyCursorFilter(docs: BackfillDoc[], checkpoint: Checkpoint | null): BackfillDoc[] {
  if (!checkpoint?.last_created_at) return docs;
  return docs.filter((doc) => {
    if (doc.created_at > checkpoint.last_created_at!) return true;
    if (doc.created_at < checkpoint.last_created_at!) return false;
    if (!checkpoint.last_id) return true;
    return doc.id > checkpoint.last_id;
  });
}

async function fetchCandidateDocs(): Promise<BackfillDoc[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("documents")
    .select("id, created_at, extraction, raw_text")
    .not("raw_text", "is", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return (data || []) as BackfillDoc[];
}

function computeEvidenceUpdate(doc: BackfillDoc): {
  nextEvidence: FieldEvidenceMap;
  changed: boolean;
} {
  const data = doc.extraction.data as Record<string, unknown>;
  const existing = data.field_evidence as FieldEvidenceMap | undefined;
  const ensured = ensureFieldEvidence(doc.extraction, doc.raw_text || "", existing);
  const existingStable = stableStringify(existing ?? {});
  const nextStable = stableStringify(ensured ?? {});
  return { nextEvidence: ensured, changed: existingStable !== nextStable };
}

async function logBatchAudit(params: {
  runId: string;
  batchIndex: number;
  processed: number;
  updated: number;
  skipped: number;
  lastCreatedAt: string | null;
  lastId: string | null;
}): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("audit_logs").insert({
    document_id: null,
    actor: "system",
    action: "modified",
    after_data: {
      run_id: params.runId,
      batch_index: params.batchIndex,
      processed: params.processed,
      updated: params.updated,
      skipped: params.skipped,
      last_created_at: params.lastCreatedAt,
      last_id: params.lastId,
    },
    notes: "field_evidence_backfill:batch",
  });
}

async function main(): Promise<void> {
  const options = parseArgs();
  const checkpoint = await readCheckpoint(options.checkpointPath);
  const runId = checkpoint?.run_id ?? `backfill-${Date.now()}`;

  console.log("=".repeat(60));
  console.log("Field Evidence Backfill");
  console.log("=".repeat(60));
  console.log(`dryRun: ${options.dryRun}`);
  console.log(`sample: ${options.sample ?? "none"}`);
  console.log(`limit: ${options.limit ?? "none"}`);
  console.log(`batchSize: ${options.batchSize}`);
  console.log(`checkpoint: ${options.checkpointPath}`);
  if (checkpoint?.last_created_at) {
    console.log(`resume from: ${checkpoint.last_created_at} / ${checkpoint.last_id}`);
  }
  console.log();

  let allDocs = await fetchCandidateDocs();
  allDocs = applyCursorFilter(allDocs, options.sample ? null : checkpoint);

  if (options.sample && options.sample > 0) {
    const sorted = [...allDocs].sort((a, b) => hashId(a.id).localeCompare(hashId(b.id)));
    allDocs = sorted.slice(0, options.sample);
  }

  if (options.limit && options.limit > 0) {
    allDocs = allDocs.slice(0, options.limit);
  }

  if (allDocs.length === 0) {
    console.log("No documents found to backfill.");
    return;
  }

  console.log(`Found ${allDocs.length} documents to inspect.`);
  console.log();

  let processed = checkpoint?.processed ?? 0;
  let updated = checkpoint?.updated ?? 0;
  let skipped = checkpoint?.skipped ?? 0;

  let batchIndex = 0;

  for (let i = 0; i < allDocs.length; i += options.batchSize) {
    batchIndex += 1;
    const batch = allDocs.slice(i, i + options.batchSize);

    let batchUpdated = 0;
    let batchSkipped = 0;

    for (const doc of batch) {
      processed += 1;

      const { nextEvidence, changed } = computeEvidenceUpdate(doc);
      if (!changed) {
        batchSkipped += 1;
        skipped += 1;
        continue;
      }

      if (!options.dryRun) {
        const data = doc.extraction.data as Record<string, unknown>;
        data.field_evidence = nextEvidence;
        doc.extraction.data = data as DocumentExtraction["data"];

        const supabase = getSupabase();
        const { error } = await supabase
          .from("documents")
          .update({ extraction: doc.extraction, updated_at: new Date().toISOString() })
          .eq("id", doc.id);
        if (error) {
          console.warn(`Update failed for ${doc.id}: ${error.message}`);
          continue;
        }
      }

      batchUpdated += 1;
      updated += 1;
    }

    const lastDoc = batch[batch.length - 1];
    const checkpointData: Checkpoint = {
      run_id: runId,
      updated_at: new Date().toISOString(),
      last_created_at: lastDoc?.created_at ?? null,
      last_id: lastDoc?.id ?? null,
      processed,
      updated,
      skipped,
      sample_mode: Boolean(options.sample),
      dry_run: options.dryRun,
    };

    await writeCheckpoint(options.checkpointPath, checkpointData);

    console.log(
      `Batch ${batchIndex}: processed ${batch.length}, updated ${batchUpdated}, skipped ${batchSkipped}`
    );

    if (!options.dryRun) {
      await logBatchAudit({
        runId,
        batchIndex,
        processed,
        updated,
        skipped,
        lastCreatedAt: checkpointData.last_created_at,
        lastId: checkpointData.last_id,
      });
    }
  }

  console.log();
  console.log("Done.");
  console.log(`Processed: ${processed}`);
  console.log(`Updated:   ${updated}`);
  console.log(`Skipped:   ${skipped}`);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
