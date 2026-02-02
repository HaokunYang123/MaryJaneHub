#!/usr/bin/env npx tsx
/**
 * Deterministic Document AI timeout tests (no network).
 */

import { extractWithDocumentAI, setDocumentAIClientOverride } from "../lib/document-ai/ocr";

type DocAIClientStub = {
  processDocument: () => Promise<[unknown]>;
};

function withClientOverride<T>(client: DocAIClientStub, fn: () => Promise<T>): Promise<T> {
  setDocumentAIClientOverride(client as Parameters<typeof setDocumentAIClientOverride>[0]);
  return fn().finally(() => setDocumentAIClientOverride(null));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  const failures: string[] = [];
  const previousTimeout = process.env.DOCUMENT_AI_TIMEOUT_MS;
  const previousProject = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const previousProcessor = process.env.DOCUMENT_AI_PROCESSOR_ID;
  const previousLocation = process.env.DOCUMENT_AI_LOCATION;

  process.env.GOOGLE_CLOUD_PROJECT_ID = "test-project";
  process.env.DOCUMENT_AI_PROCESSOR_ID = "test-processor";
  process.env.DOCUMENT_AI_LOCATION = "us";

  try {
    // 1) Timeout triggers on never-resolving promise
    process.env.DOCUMENT_AI_TIMEOUT_MS = "30";
    const neverClient: DocAIClientStub = {
      processDocument: async () => new Promise<[unknown]>(() => {}),
    };

    const timeoutResult = await withClientOverride(neverClient, () =>
      extractWithDocumentAI(Buffer.from("test"), "application/pdf")
    );

    if (timeoutResult.success) {
      failures.push("expected timeout to return success=false");
    } else if (timeoutResult.error.code !== "TIMEOUT") {
      failures.push(`expected TIMEOUT code, got ${timeoutResult.error.code}`);
    }

    // 2) Resolves before timeout -> success
    process.env.DOCUMENT_AI_TIMEOUT_MS = "50";
    const okClient: DocAIClientStub = {
      processDocument: async () => {
        await delay(10);
        return [
          {
            document: {
              text: "ok",
              pages: [],
            },
          },
        ];
      },
    };

    const okResult = await withClientOverride(okClient, () =>
      extractWithDocumentAI(Buffer.from("test"), "application/pdf")
    );
    if (!okResult.success || okResult.rawText !== "ok") {
      failures.push("expected success with rawText=ok before timeout");
    }

    // 3) Default timeout value applied when env missing (should not timeout at 0)
    delete process.env.DOCUMENT_AI_TIMEOUT_MS;
    const defaultClient: DocAIClientStub = {
      processDocument: async () => [
        {
          document: {
            text: "default",
            pages: [],
          },
        },
      ],
    };
    const defaultResult = await withClientOverride(defaultClient, () =>
      extractWithDocumentAI(Buffer.from("test"), "application/pdf")
    );
    if (!defaultResult.success || defaultResult.rawText !== "default") {
      failures.push("expected success with default timeout when env unset");
    }
  } finally {
    if (previousTimeout === undefined) {
      delete process.env.DOCUMENT_AI_TIMEOUT_MS;
    } else {
      process.env.DOCUMENT_AI_TIMEOUT_MS = previousTimeout;
    }
    if (previousProject === undefined) {
      delete process.env.GOOGLE_CLOUD_PROJECT_ID;
    } else {
      process.env.GOOGLE_CLOUD_PROJECT_ID = previousProject;
    }
    if (previousProcessor === undefined) {
      delete process.env.DOCUMENT_AI_PROCESSOR_ID;
    } else {
      process.env.DOCUMENT_AI_PROCESSOR_ID = previousProcessor;
    }
    if (previousLocation === undefined) {
      delete process.env.DOCUMENT_AI_LOCATION;
    } else {
      process.env.DOCUMENT_AI_LOCATION = previousLocation;
    }
  }

  if (failures.length > 0) {
    console.error("Document AI timeout test FAILED:");
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log("Document AI timeout test PASSED");
}

run().catch((error) => {
  console.error("Document AI timeout test failed:", error);
  process.exit(1);
});
