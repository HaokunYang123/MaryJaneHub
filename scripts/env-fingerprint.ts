#!/usr/bin/env npx tsx
/**
 * Environment fingerprint (safe output only).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

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

async function main(): Promise<void> {
  const urls: UrlInfo[] = [];
  const supabaseUrlInfo = parseUrl("SUPABASE_URL", process.env.SUPABASE_URL);
  const nextPublicUrlInfo = parseUrl("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const databaseUrlInfo = parseUrl("DATABASE_URL", process.env.DATABASE_URL);
  if (supabaseUrlInfo) urls.push(supabaseUrlInfo);
  if (nextPublicUrlInfo) urls.push(nextPublicUrlInfo);
  if (databaseUrlInfo) urls.push(databaseUrlInfo);

  const hasRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_KEY);

  const key = resolveSupabaseKey();
  if (process.env.SUPABASE_URL && key && !process.env.SUPABASE_SERVICE_KEY) {
    process.env.SUPABASE_SERVICE_KEY = key.value;
  }

  let docCount: number | null = null;
  let minCreatedAt: string | null = null;
  let maxCreatedAt: string | null = null;

  if (process.env.SUPABASE_URL && key) {
    const supabase = createClient(process.env.SUPABASE_URL, key.value);

    const { count, error: countError } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true });
    if (!countError && typeof count === "number") {
      docCount = count;
    }

    const { data: minData } = await supabase
      .from("documents")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1);
    const { data: maxData } = await supabase
      .from("documents")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1);

    minCreatedAt = (minData?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
    maxCreatedAt = (maxData?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
  }

  console.log("Env Fingerprint");
  for (const info of urls) {
    console.log(`${info.name}: ref=${info.ref}, host=${info.host}`);
  }
  console.log(`has SUPABASE_SERVICE_ROLE_KEY: ${hasRoleKey}`);
  console.log(`has SUPABASE_SERVICE_KEY: ${hasServiceKey}`);
  console.log(`documents count: ${docCount === null ? "n/a" : docCount}`);
  console.log(`documents created_at min: ${minCreatedAt ?? "n/a"}`);
  console.log(`documents created_at max: ${maxCreatedAt ?? "n/a"}`);
}

main().catch((error) => {
  console.error("env:fingerprint failed:", error instanceof Error ? error.message : String(error));
  process.exit(0);
});
