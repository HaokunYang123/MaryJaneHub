/**
 * Environment safety gate for destructive / high-risk scripts.
 *
 * Usage (call at the top of main(), before any DB operations):
 *   requireSafeEnv(process.argv.slice(2), "my-script-name");
 *
 * Enforces:
 *   --env=local    → SUPABASE_URL must be a localhost URL
 *   --env=staging  → SUPABASE_URL must not look like a production URL
 *   (no flag)      → hard exit
 */

export function requireSafeEnv(args: string[], scriptName: string): void {
  const envFlag = args.find((a) => a.startsWith("--env="))?.split("=")[1];

  if (!envFlag) {
    console.error(
      `ERROR [${scriptName}]: --env flag required.\n` +
        `  npx ts-node ${scriptName} --env=local\n` +
        `  npx ts-node ${scriptName} --env=staging`
    );
    process.exit(1);
  }

  if (envFlag !== "local" && envFlag !== "staging") {
    console.error(
      `ERROR [${scriptName}]: Invalid --env value "${envFlag}". Must be "local" or "staging".`
    );
    process.exit(1);
  }

  const supabaseUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).trim();

  if (envFlag === "local") {
    const isLocal =
      supabaseUrl.startsWith("http://localhost") ||
      supabaseUrl.startsWith("http://127.0.0.1");
    if (!isLocal) {
      console.error(
        `ERROR [${scriptName}]: --env=local specified but SUPABASE_URL does not look local.\n` +
          `  SUPABASE_URL: ${supabaseUrl || "(not set)"}\n` +
          `  Expected a localhost URL. Refusing to run.`
      );
      process.exit(1);
    }
  }

  if (envFlag === "staging") {
    const isProduction =
      supabaseUrl.includes("supabase.co") && !supabaseUrl.includes("-staging");
    if (isProduction) {
      console.error(
        `ERROR [${scriptName}]: --env=staging specified but SUPABASE_URL appears to be production.\n` +
          `  SUPABASE_URL: ${supabaseUrl}\n` +
          `  Verify you have the staging .env loaded. Refusing to run.`
      );
      process.exit(1);
    }
  }

  console.log(`[${scriptName}] env=${envFlag} | supabase=${supabaseUrl}`);
}
