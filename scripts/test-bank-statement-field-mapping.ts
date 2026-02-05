import assert from "node:assert/strict";
import { getAmountField, getDateField } from "../lib/assistant/sum-handler.js";
import { __test__ as exportTest } from "../lib/export/index.js";

function main(): void {
  assert.equal(
    getDateField("bank_statement"),
    "statement_period_end",
    "bank_statement date field should use statement_period_end"
  );
  assert.equal(
    getAmountField("bank_statement"),
    "closing_balance",
    "bank_statement amount field should use closing_balance"
  );

  const mockDoc = {
    document_type: "bank_statement",
    extraction: {
      data: {
        statement_period_end: "2024-12-31",
        closing_balance: 1234.56,
      },
    },
  };

  assert.equal(
    exportTest.extractDate(mockDoc as Parameters<typeof exportTest.extractDate>[0]),
    "2024-12-31",
    "export extractDate should use statement_period_end"
  );
  assert.equal(
    exportTest.extractAmount(mockDoc as Parameters<typeof exportTest.extractAmount>[0]),
    1234.56,
    "export extractAmount should use closing_balance"
  );

  console.log("bank_statement field mapping: OK");
}

main();
