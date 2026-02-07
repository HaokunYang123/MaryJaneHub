import { collapseDuplicateSearchResults } from "../lib/search/deduplicate";

type TestResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

function assert(condition: boolean, name: string, detail?: string): TestResult {
  return { name, passed: condition, detail };
}

function printResult(result: TestResult): void {
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`${status}: ${result.name}`);
  if (!result.passed && result.detail) {
    console.log(`  ${result.detail}`);
  }
}

async function main(): Promise<void> {
  console.log("=== Duplicate Collapse Tests ===\n");

  const now = new Date().toISOString();
  const older = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

  const input = [
    {
      id: "a1",
      fileName: "acme-invoice.pdf",
      documentType: "invoice",
      score: 0.92,
      extraction: {
        type: "invoice",
        data: {
          vendor: "Acme Corp",
          invoice_number: "INV-1001",
          invoice_date: "2025-12-01",
          total: 1234.56,
          confidence: 0.91,
        },
      },
      createdAt: now,
    },
    {
      id: "a2",
      fileName: "acme-invoice-copy.pdf",
      documentType: "invoice",
      score: 0.88,
      extraction: {
        type: "invoice",
        data: {
          vendor: "Acme Corp",
          invoice_number: "INV-1001",
          invoice_date: "2025-12-01",
          total: 1234.56,
          confidence: 0.8,
        },
      },
      createdAt: older,
    },
    {
      id: "r1",
      fileName: "fedex-receipt.pdf",
      documentType: "receipt",
      similarity: 0.81,
      extraction: {
        type: "receipt",
        data: {
          merchant_name: "FedEx",
          date: "2025-12-02",
          total: 44.2,
          confidence: 0.85,
        },
      },
      createdAt: now,
    },
    {
      id: "u1",
      fileName: "unique-contract.pdf",
      documentType: "contract",
      score: 0.73,
      extraction: {
        type: "contract",
        data: {
          counterparty: "Big Partner LLC",
          effective_date: "2025-10-12",
          confidence: 0.77,
        },
      },
      createdAt: older,
    },
  ];

  const collapsed = collapseDuplicateSearchResults(input);

  const tests: TestResult[] = [];
  tests.push(
    assert(
      collapsed.length === 3,
      "Collapses exact invoice duplicates into one canonical result",
      `expected 3 results, got ${collapsed.length}`
    )
  );

  const invoice = collapsed.find((row) => row.documentType === "invoice");
  tests.push(
    assert(
      Boolean(invoice),
      "Invoice canonical result exists",
      "invoice result missing"
    )
  );
  tests.push(
    assert(
      invoice?.id === "a1",
      "Selects highest-ranked invoice as canonical",
      `expected canonical id a1, got ${invoice?.id}`
    )
  );
  tests.push(
    assert(
      invoice?.duplicateCount === 1 && invoice?.duplicateIds?.includes("a2"),
      "Tracks duplicate count and duplicate IDs",
      `expected duplicateCount=1 and duplicateIds includes a2, got count=${String(invoice?.duplicateCount)} ids=${JSON.stringify(invoice?.duplicateIds)}`
    )
  );

  const unique = collapsed.find((row) => row.id === "u1");
  tests.push(
    assert(
      Boolean(unique) && unique?.duplicateCount === 0,
      "Keeps unique document with zero duplicates",
      `expected unique u1 with duplicateCount=0, got ${JSON.stringify(unique)}`
    )
  );

  let failures = 0;
  for (const test of tests) {
    printResult(test);
    if (!test.passed) failures += 1;
  }

  console.log(`\nSummary: ${tests.length - failures}/${tests.length} passed`);

  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected test error:", error);
  process.exit(1);
});
