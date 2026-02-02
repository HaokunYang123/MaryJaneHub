#!/usr/bin/env npx tsx
/**
 * Deterministic Gemini timeout tests (no network).
 */

import { generateContentWithTimeout } from "../lib/gemini/call";

type StubModel = {
  generateContent: (prompt: string) => Promise<{ response: { text: () => string } }>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const failures: string[] = [];
  const previousTimeout = process.env.GEMINI_TIMEOUT_MS;

  try {
    // 1) Timeout triggers on never-resolving promise
    process.env.GEMINI_TIMEOUT_MS = "20";
    const hangingModel: StubModel = {
      generateContent: async () => new Promise(() => {}),
    };

    try {
      await generateContentWithTimeout(hangingModel as never, "test");
      failures.push("expected GEMINI_TIMEOUT error");
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "GEMINI_TIMEOUT") {
        failures.push(`expected GEMINI_TIMEOUT, got ${code || "unknown"}`);
      }
    }

    // 2) Resolves before timeout -> success
    process.env.GEMINI_TIMEOUT_MS = "50";
    const okModel: StubModel = {
      generateContent: async () => {
        await delay(10);
        return { response: { text: () => "ok" } };
      },
    };

    const result = await generateContentWithTimeout(okModel as never, "test");
    const text = (result as { response: { text: () => string } }).response.text();
    if (text !== "ok") {
      failures.push(`expected response text "ok", got "${text}"`);
    }
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.GEMINI_TIMEOUT_MS;
    } else {
      process.env.GEMINI_TIMEOUT_MS = previousTimeout;
    }
  }

  if (failures.length > 0) {
    console.error("Gemini timeout test FAILED:");
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log("Gemini timeout test PASSED");
}

run().catch((error) => {
  console.error("Gemini timeout test failed:", error);
  process.exit(1);
});
