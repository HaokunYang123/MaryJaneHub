#!/usr/bin/env tsx
/**
 * M3 - Backend Validation: API Security Audit
 *
 * Enumerates all API routes and verifies authentication coverage.
 * Checks for:
 * 1. Session/whitelist auth
 * 2. Admin secret auth
 * 3. Cron secret auth
 * 4. Public endpoints (intentional)
 * 5. Data leak risks (OCR text, bulk exports, evidence links)
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { globSync } from "glob";

interface RouteAudit {
  path: string;
  file_path: string;
  auth_method: "session" | "admin_secret" | "cron_secret" | "none" | "unknown";
  uses_with_auth: boolean;
  uses_with_admin: boolean;
  uses_verify_auth: boolean;
  uses_cron_secret: boolean;
  has_rate_limit: boolean;
  potential_leaks: string[];
  notes: string[];
}

function analyzeRoute(filePath: string): RouteAudit {
  const content = readFileSync(filePath, "utf-8");

  // Determine route path from file path
  const routePath = filePath
    .replace(/.*\/app\/api/, "/api")
    .replace(/\/route\.(ts|tsx|js|jsx)$/, "")
    .replace(/\[(\w+)\]/g, ":$1");

  const audit: RouteAudit = {
    path: routePath,
    file_path: filePath,
    auth_method: "unknown",
    uses_with_auth: false,
    uses_with_admin: false,
    uses_verify_auth: false,
    uses_cron_secret: false,
    has_rate_limit: false,
    potential_leaks: [],
    notes: []
  };

  // Check for authentication methods
  if (content.includes("withAuth(") || content.includes("withAuth ")) {
    audit.uses_with_auth = true;
    audit.auth_method = "session";
  }

  if (content.includes("withAdmin(") || content.includes("withAdmin ")) {
    audit.uses_with_admin = true;
    audit.auth_method = "admin_secret";
  }

  if (content.includes("verifyAuth(") || content.includes("verifyAuth ")) {
    audit.uses_verify_auth = true;
    if (audit.auth_method === "unknown") {
      audit.auth_method = "session";
    }
  }

  // Check for admin access helpers
  if (content.includes("requireAdmin(") || content.includes("requireAdminAccess")) {
    audit.auth_method = "admin_secret";
    audit.notes.push("Uses requireAdmin/requireAdminAccess");
  }

  // Check for helper functions that wrap auth
  if (content.includes("createEvidencePacketHandler") ||
      content.includes("createEvidencePacketV2Handler") ||
      content.includes("createAssistantAuditHandler")) {
    audit.auth_method = "admin_secret";
    audit.notes.push("Uses auth-wrapped helper function");
  }

  if (content.includes("CRON_SECRET") || content.includes("cron_secret")) {
    audit.uses_cron_secret = true;
    audit.auth_method = "cron_secret";
  }

  // Check for intentional public routes
  const publicPaths = ["/api/auth/callback", "/api/auth/signout"];
  if (publicPaths.some(p => routePath.startsWith(p))) {
    audit.auth_method = "none";
    audit.notes.push("Intentionally public (auth flow)");
  }

  // Check for rate limiting
  if (content.includes("rate-limit") || content.includes("rateLimit") || content.includes("RateLimit")) {
    audit.has_rate_limit = true;
  }

  // Check for potential data leaks
  if (content.includes("raw_text") || content.includes("rawText") || content.includes("ocr_text")) {
    audit.potential_leaks.push("raw_text/ocr_text exposure");
  }

  if (content.includes(".map(") && content.includes("documents")) {
    // Bulk document export
    if (!content.includes("sanitize") && !content.includes("redact")) {
      audit.potential_leaks.push("bulk export without sanitization");
    }
  }

  if (content.includes("storage.bucket") || content.includes("getSignedUrl")) {
    audit.potential_leaks.push("signed URLs (check expiration)");
  }

  if (content.includes("field_evidence") && content.includes("map")) {
    // This is actually good - field evidence
    audit.notes.push("includes field_evidence");
  }

  // Determine final auth method if still unknown
  if (audit.auth_method === "unknown") {
    // Check middleware protection
    const protectedPrefixes = ["/api/documents", "/api/quickbooks", "/api/cron", "/api/export"];
    if (protectedPrefixes.some(p => routePath.startsWith(p))) {
      audit.auth_method = "session";
      audit.notes.push("Protected by middleware");
    } else {
      audit.auth_method = "none";
      audit.notes.push("⚠️ UNPROTECTED - no auth detected");
    }
  }

  return audit;
}

async function main() {
  console.log("M3 Backend Validation - API Security Audit");
  console.log("==========================================");
  console.log();

  // Find all route files
  const routeFiles = globSync("app/api/**/route.{ts,tsx,js,jsx}", {
    cwd: process.cwd()
  });

  console.log(`Found ${routeFiles.length} API routes`);
  console.log();

  const audits: RouteAudit[] = [];

  for (const routeFile of routeFiles) {
    const fullPath = join(process.cwd(), routeFile);
    if (!existsSync(fullPath)) continue;

    const audit = analyzeRoute(fullPath);
    audits.push(audit);
  }

  // Sort by auth method
  audits.sort((a, b) => {
    const order = { "none": 0, "unknown": 1, "session": 2, "admin_secret": 3, "cron_secret": 4 };
    return order[a.auth_method] - order[b.auth_method];
  });

  // Report
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("ROUTE AUTHENTICATION COVERAGE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  const byAuthMethod = new Map<string, RouteAudit[]>();
  for (const audit of audits) {
    if (!byAuthMethod.has(audit.auth_method)) {
      byAuthMethod.set(audit.auth_method, []);
    }
    byAuthMethod.get(audit.auth_method)!.push(audit);
  }

  for (const [method, routes] of byAuthMethod) {
    const icon = method === "none" ? "⚠️" : method === "unknown" ? "❌" : "✓";
    console.log(`${icon} ${method.toUpperCase()} (${routes.length} routes)`);
    console.log("─────────────────────────────────────────────────────────────");

    for (const route of routes) {
      console.log(`  ${route.path}`);
      console.log(`    File: ${route.file_path}`);

      if (route.uses_with_auth) console.log(`    ✓ Uses withAuth`);
      if (route.uses_with_admin) console.log(`    ✓ Uses withAdmin`);
      if (route.uses_verify_auth) console.log(`    ✓ Uses verifyAuth`);
      if (route.uses_cron_secret) console.log(`    ✓ Checks CRON_SECRET`);
      if (route.has_rate_limit) console.log(`    ✓ Has rate limiting`);

      if (route.potential_leaks.length > 0) {
        console.log(`    ⚠️  Potential leaks: ${route.potential_leaks.join(", ")}`);
      }

      if (route.notes.length > 0) {
        console.log(`    Notes: ${route.notes.join("; ")}`);
      }

      console.log();
    }
  }

  // Security issues
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("SECURITY ISSUES");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  const unprotected = audits.filter(a => a.auth_method === "none" || a.auth_method === "unknown");
  const withLeaks = audits.filter(a => a.potential_leaks.length > 0);
  const needsRateLimit = audits.filter(a =>
    !a.has_rate_limit &&
    (a.path.includes("search") || a.path.includes("assistant") || a.path.includes("export"))
  );

  if (unprotected.length > 0) {
    console.log(`⚠️  ${unprotected.length} unprotected routes (excluding auth flows):`);
    for (const route of unprotected) {
      if (!route.notes.some(n => n.includes("Intentionally public"))) {
        console.log(`    - ${route.path} (${route.file_path})`);
      }
    }
    console.log();
  }

  if (withLeaks.length > 0) {
    console.log(`⚠️  ${withLeaks.length} routes with potential data leaks:`);
    for (const route of withLeaks) {
      console.log(`    - ${route.path}: ${route.potential_leaks.join(", ")}`);
    }
    console.log();
  }

  if (needsRateLimit.length > 0) {
    console.log(`⚠️  ${needsRateLimit.length} heavy endpoints missing rate limiting:`);
    for (const route of needsRateLimit) {
      console.log(`    - ${route.path}`);
    }
    console.log();
  }

  // Summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();
  console.log(`Total routes:           ${audits.length}`);
  console.log(`Session auth:           ${byAuthMethod.get("session")?.length || 0}`);
  console.log(`Admin secret:           ${byAuthMethod.get("admin_secret")?.length || 0}`);
  console.log(`Cron secret:            ${byAuthMethod.get("cron_secret")?.length || 0}`);
  console.log(`Public (intentional):   ${audits.filter(a => a.notes.some(n => n.includes("Intentionally public"))).length}`);
  console.log(`Unprotected:            ${unprotected.filter(a => !a.notes.some(n => n.includes("Intentionally public"))).length}`);
  console.log(`With rate limiting:     ${audits.filter(a => a.has_rate_limit).length}`);
  console.log(`Potential leaks:        ${withLeaks.length}`);
  console.log();

  const criticalIssues = unprotected.filter(a => !a.notes.some(n => n.includes("Intentionally public"))).length;

  if (criticalIssues > 0) {
    console.error("✗ FAILED: Critical security issues found");
    process.exit(1);
  } else if (withLeaks.length > 0 || needsRateLimit.length > 0) {
    console.warn("⚠ WARNING: Non-critical security concerns found");
    process.exit(0);
  } else {
    console.log("✓ PASSED: All routes properly protected");
    process.exit(0);
  }
}

main().catch(console.error);
