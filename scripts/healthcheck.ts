#!/usr/bin/env npx tsx
/**
 * Release readiness healthcheck (safe output only).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

type SectionStatus = "PASS" | "WARN" | "FAIL";

type Section = {
  name: string;
  status: SectionStatus;
  lines: string[];
};

type UrlInfo = {
  name: string;
  host: string;
  ref: string;
};

function parseUrl(name: string, value?: string): UrlInfo | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.host;
    const ref = host.endsWith(".supabase.co") ? host.split(".")[0] : "n/a";
    return { name, host, ref };
  } catch {
    return { name, host: "invalid", ref: "n/a" };
  }
}

function resolveSupabaseKey(): { name: string; value: string } | null {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { name: "SUPABASE_SERVICE_ROLE_KEY", value: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  if (process.env.SUPABASE_SERVICE_KEY) {
    return { name: "SUPABASE_SERVICE_KEY", value: process.env.SUPABASE_SERVICE_KEY };
  }
  return null;
}

function boolLine(label: string, value: boolean): string {
  return `${label}: ${value ? "true" : "false"}`;
}

function formatSection(section: Section): string {
  const lines = section.lines.map((line) => `  - ${line}`).join("\n");
  return `[${section.status}] ${section.name}\n${lines}`;
}

function determineStatus(hasFail: boolean, hasWarn: boolean): SectionStatus {
  if (hasFail) return "FAIL";
  if (hasWarn) return "WARN";
  return "PASS";
}

async function envSection(): Promise<Section> {
  const lines: string[] = [];
  let hasFail = false;
  let hasWarn = false;

  const supabaseUrlInfo = parseUrl("SUPABASE_URL", process.env.SUPABASE_URL);
  if (supabaseUrlInfo) {
    lines.push(`${supabaseUrlInfo.name}: ref=${supabaseUrlInfo.ref}, host=${supabaseUrlInfo.host}`);
  } else {
    lines.push("SUPABASE_URL: missing");
    hasFail = true;
  }

  const supabaseKey = resolveSupabaseKey();
  lines.push(boolLine("has SUPABASE_SERVICE_ROLE_KEY", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)));
  lines.push(boolLine("has SUPABASE_SERVICE_KEY", Boolean(process.env.SUPABASE_SERVICE_KEY)));
  if (!supabaseKey) {
    hasFail = true;
  }

  const adminSecret = Boolean(process.env.ADMIN_API_SECRET || process.env.ADMIN_SECRET);
  lines.push(boolLine("has ADMIN_API_SECRET|ADMIN_SECRET", adminSecret));
  if (!adminSecret) {
    hasWarn = true;
  }

  const evidenceBucket = Boolean(process.env.EVIDENCE_BUCKET);
  lines.push(boolLine("has EVIDENCE_BUCKET", evidenceBucket));
  if (!evidenceBucket) {
    hasWarn = true;
  }

  lines.push(boolLine("has GEMINI_API_KEY", Boolean(process.env.GEMINI_API_KEY)));
  lines.push(boolLine("has GOOGLE_CLOUD_PROJECT_ID", Boolean(process.env.GOOGLE_CLOUD_PROJECT_ID)));
  lines.push(boolLine("has DOCUMENT_AI_PROCESSOR_ID", Boolean(process.env.DOCUMENT_AI_PROCESSOR_ID)));
  lines.push(boolLine("has GOOGLE_APPLICATION_CREDENTIALS", Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS)));
  lines.push(boolLine("has GOOGLE_DRIVE_INBOX_FOLDER_ID", Boolean(process.env.GOOGLE_DRIVE_INBOX_FOLDER_ID)));
  lines.push(boolLine("has GOOGLE_DRIVE_PROCESSED_FOLDER_ID", Boolean(process.env.GOOGLE_DRIVE_PROCESSED_FOLDER_ID)));

  if (!process.env.GEMINI_API_KEY || !process.env.GOOGLE_CLOUD_PROJECT_ID || !process.env.DOCUMENT_AI_PROCESSOR_ID) {
    hasWarn = true;
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    hasWarn = true;
  }

  return {
    name: "Env sanity",
    status: determineStatus(hasFail, hasWarn),
    lines,
  };
}

async function dbSection(): Promise<Section> {
  const lines: string[] = [];
  let hasFail = false;
  let hasWarn = false;

  const key = resolveSupabaseKey();
  if (!process.env.SUPABASE_URL || !key) {
    lines.push("Supabase credentials missing; DB checks skipped");
    hasWarn = true;
    return {
      name: "DB sanity",
      status: determineStatus(hasFail, hasWarn),
      lines,
    };
  }

  const supabase = createClient(process.env.SUPABASE_URL, key.value);

  const tables = ["documents", "document_layouts", "audit_logs", "processing_jobs"];
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
    if (error) {
      lines.push(`${table} count: error`);
      hasWarn = true;
    } else {
      lines.push(`${table} count: ${typeof count === "number" ? count : "n/a"}`);
    }
  }

  const { data: minData, error: minError } = await supabase
    .from("documents")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1);
  const { data: maxData, error: maxError } = await supabase
    .from("documents")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  if (minError || maxError) {
    lines.push("documents created_at min/max: error");
    hasWarn = true;
  } else {
    const minCreatedAt = (minData?.[0] as { created_at?: string } | undefined)?.created_at ?? "n/a";
    const maxCreatedAt = (maxData?.[0] as { created_at?: string } | undefined)?.created_at ?? "n/a";
    lines.push(`documents created_at min: ${minCreatedAt}`);
    lines.push(`documents created_at max: ${maxCreatedAt}`);
  }

  return {
    name: "DB sanity",
    status: determineStatus(hasFail, hasWarn),
    lines,
  };
}

async function assistantSection(): Promise<Section> {
  const lines: string[] = [];
  let hasFail = false;
  let hasWarn = false;

  const requiredFiles = [
    "scripts/test-assistant-router-regression.ts",
    "scripts/test-assistant-audit.ts",
    "scripts/test-assistant-integration.ts",
    "scripts/verify-evidence-v2.ts",
  ];

  for (const file of requiredFiles) {
    const exists = existsSync(join(process.cwd(), file));
    lines.push(`${file}: ${exists ? "present" : "missing"}`);
    if (!exists) hasFail = true;
  }

  const packageJsonPath = join(process.cwd(), "package.json");
  if (!existsSync(packageJsonPath)) {
    lines.push("package.json: missing");
    hasFail = true;
  } else {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts || {};
      const requiredScripts = ["assistant:test", "assistant:audit:test", "assistant:integration", "verify:evidence:v2"];
      for (const script of requiredScripts) {
        const exists = Boolean(scripts[script]);
        lines.push(`${script}: ${exists ? "present" : "missing"}`);
        if (!exists) hasFail = true;
      }
    } catch {
      lines.push("package.json: unreadable");
      hasFail = true;
    }
  }

  if (!hasFail && !hasWarn) {
    lines.push("assistant scripts present");
  }

  return {
    name: "Assistant gates",
    status: determineStatus(hasFail, hasWarn),
    lines,
  };
}

async function evidenceSection(): Promise<Section> {
  const lines: string[] = [];
  let hasFail = false;
  let hasWarn = false;

  const requestId = process.env.EVIDENCE_REQUEST_ID;
  if (!requestId) {
    lines.push("EVIDENCE_REQUEST_ID: not set (skipped)");
    hasWarn = true;
    return {
      name: "Evidence v2 readiness",
      status: determineStatus(hasFail, hasWarn),
      lines,
    };
  }

  const adminSecret = Boolean(process.env.EVIDENCE_ADMIN_SECRET);
  const adminCookie = Boolean(process.env.EVIDENCE_ADMIN_COOKIE);
  if (!adminSecret && !adminCookie) {
    lines.push("EVIDENCE_ADMIN_SECRET|EVIDENCE_ADMIN_COOKIE: missing");
    hasFail = true;
    return {
      name: "Evidence v2 readiness",
      status: determineStatus(hasFail, hasWarn),
      lines,
    };
  }

  const result = spawnSync("npm", ["run", "verify:evidence:v2"], {
    stdio: "pipe",
    env: process.env,
  });

  if (result.status === 0) {
    lines.push("verify:evidence:v2: PASS");
  } else {
    lines.push("verify:evidence:v2: FAIL");
    hasFail = true;
  }

  return {
    name: "Evidence v2 readiness",
    status: determineStatus(hasFail, hasWarn),
    lines,
  };
}

async function main(): Promise<void> {
  const sections = [
    await envSection(),
    await dbSection(),
    await assistantSection(),
    await evidenceSection(),
  ];

  console.log("Release Healthcheck");
  sections.forEach((section) => console.log(formatSection(section)));

  const hasFail = sections.some((section) => section.status === "FAIL");
  process.exit(hasFail ? 1 : 0);
}

main().catch((error) => {
  console.error("healthcheck failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
