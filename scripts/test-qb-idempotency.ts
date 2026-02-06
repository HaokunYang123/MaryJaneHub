#!/usr/bin/env npx tsx
/**
 * Deterministic QuickBooks idempotency tests (no network).
 */

import { syncDocumentWithDeps } from "../lib/workflow/sync-to-quickbooks";

type DocumentRow = {
  id: string;
  sync_status: string;
  document_type: string;
  extraction: { type: string; data: Record<string, unknown> };
  human_overrides?: Record<string, unknown> | null;
  review_flags?: string[] | null;
  confidence_score?: number | null;
  qb_vendor_id: string | null;
  qb_bill_id: string | null;
  file_hash: string;
  gcs_generation?: string | null;
  gcs_hash_value?: string | null;
};

type SupabaseStub = {
  data: {
    documents: Map<string, DocumentRow>;
    qbIdempotency: Map<string, {
      document_id: string;
      qb_object_type: string;
      qb_object_id: string;
      idempotency_key: string;
    }>;
    auditLogs: Array<Record<string, unknown>>;
  };
  from: (table: string) => {
    select: (fields: string) => unknown;
    eq: (column: string, value: string) => unknown;
    single: () => Promise<{ data: DocumentRow | null; error: { message: string } | null }>;
    maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
    update: (data: Record<string, unknown>) => unknown;
    insert: (record: Record<string, unknown>) => Promise<{ error: { code?: string; message: string } | null }>;
  };
};

function buildInvoiceEvidence(
  vendor: string,
  total: number,
  date: string
): Record<string, unknown> {
  return {
    vendor: {
      value: vendor,
      confidence: 0.99,
      evidence: { page: 1, quote: vendor, coords: null },
    },
    total: {
      value: total,
      confidence: 0.99,
      evidence: { page: 1, quote: String(total), coords: null },
    },
    invoice_date: {
      value: date,
      confidence: 0.99,
      evidence: { page: 1, quote: date, coords: null },
    },
  };
}

function createSupabaseStub(options?: { forceDuplicateInsert?: boolean; forcedQbId?: string }): SupabaseStub {
  const documents = new Map<string, DocumentRow>();
  const qbIdempotency = new Map<string, {
    document_id: string;
    qb_object_type: string;
    qb_object_id: string;
    idempotency_key: string;
  }>();
  const auditLogs: Array<Record<string, unknown>> = [];

  const forceDuplicateInsert = options?.forceDuplicateInsert ?? false;
  const forcedQbId = options?.forcedQbId ?? "QB-RACE";

  return {
    data: { documents, qbIdempotency, auditLogs },
    from(table: string) {
      const state = {
        table,
        filters: [] as Array<{ column: string; value: string }>,
        updateData: null as Record<string, unknown> | null,
      };

      const builder = {
        select(_fields: string) {
          return builder;
        },
        update(data: Record<string, unknown>) {
          state.updateData = data;
          return builder;
        },
        eq(column: string, value: string) {
          state.filters.push({ column, value });
          if (state.updateData) {
            if (state.table === "documents") {
              const docId = state.filters.find((f) => f.column === "id")?.value;
              if (docId && documents.has(docId)) {
                const doc = documents.get(docId)!;
                documents.set(docId, { ...doc, ...state.updateData } as DocumentRow);
              }
            }
            return Promise.resolve({ error: null });
          }
          return builder;
        },
        async single() {
          if (state.table === "documents") {
            const docId = state.filters.find((f) => f.column === "id")?.value;
            const doc = docId ? documents.get(docId) || null : null;
            if (!doc) {
              return { data: null, error: { message: "not found" } };
            }
            return { data: doc, error: null };
          }
          return { data: null, error: { message: "unsupported" } };
        },
        async maybeSingle() {
          if (state.table === "qb_idempotency") {
            const key = state.filters.find((f) => f.column === "idempotency_key")?.value;
            const record = key ? qbIdempotency.get(key) || null : null;
            return { data: record, error: null };
          }
          return { data: null, error: { message: "unsupported" } };
        },
        async insert(record: Record<string, unknown>) {
          if (state.table === "audit_logs") {
            auditLogs.push(record);
            return { error: null };
          }
          if (state.table === "qb_idempotency") {
            const key = String(record.idempotency_key || "");
            if (qbIdempotency.has(key)) {
              return { error: { code: "23505", message: "duplicate key" } };
            }
            if (forceDuplicateInsert) {
              qbIdempotency.set(key, {
                document_id: String(record.document_id),
                qb_object_type: String(record.qb_object_type),
                qb_object_id: forcedQbId,
                idempotency_key: key,
              });
              return { error: { code: "23505", message: "duplicate key" } };
            }
            qbIdempotency.set(key, {
              document_id: String(record.document_id),
              qb_object_type: String(record.qb_object_type),
              qb_object_id: String(record.qb_object_id),
              idempotency_key: key,
            });
            return { error: null };
          }
          return { error: { message: "unsupported" } };
        },
      };

      return builder;
    },
  };
}

async function run(): Promise<void> {
  const failures: string[] = [];

  // Test 1: second sync reuses idempotency mapping (no duplicate create)
  {
    const supabase = createSupabaseStub();
    const documentId = "doc-1";
    supabase.data.documents.set(documentId, {
      id: documentId,
      sync_status: "approved",
      document_type: "invoice",
      extraction: {
        type: "invoice",
        data: {
          vendor: "Acme",
          total: 123.45,
          invoice_date: "2024-01-19",
          field_evidence: buildInvoiceEvidence("Acme", 123.45, "2024-01-19"),
        },
      },
      qb_vendor_id: null,
      qb_bill_id: null,
      file_hash: "hash-1",
      gcs_generation: "111",
      gcs_hash_value: "hash-gcs",
    });

    let createCalls = 0;
    const deps = {
      supabase,
      getExpenseAccounts: async () => [{ Id: "acct-1", Name: "Expenses", AccountType: "Expense" }],
      findOrCreateVendor: async () => ({ Id: "ven-1", DisplayName: "Acme" }),
      findPotentialDuplicateBill: async () => null,
      getBill: async (billId: string) => ({
        Id: billId,
        VendorRef: { value: "ven-1" },
        DocNumber: undefined,
        TxnDate: "2024-01-19",
        TotalAmt: 123.45,
        Line: [],
      }),
      createBill: async () => {
        createCalls += 1;
        return { Id: "QB-1", TotalAmt: 123.45 };
      },
    };

    const first = await syncDocumentWithDeps(documentId, undefined, deps);
    const second = await syncDocumentWithDeps(documentId, undefined, deps);

    if (createCalls !== 1) {
      failures.push(`expected createBill to be called once, got ${createCalls}`);
    }
    if (!first.success || !second.success) {
      failures.push("expected both sync runs to succeed");
    }
    if (second.qbBillId !== "QB-1") {
      failures.push(`expected second run qbBillId QB-1, got ${second.qbBillId}`);
    }
  }

  // Test 2: handle duplicate insert race (use existing qb id)
  {
    const supabase = createSupabaseStub({ forceDuplicateInsert: true, forcedQbId: "QB-RACE" });
    const documentId = "doc-2";
    supabase.data.documents.set(documentId, {
      id: documentId,
      sync_status: "approved",
      document_type: "invoice",
      extraction: {
        type: "invoice",
        data: {
          vendor: "Globex",
          total: 88.0,
          invoice_date: "2024-02-01",
          field_evidence: buildInvoiceEvidence("Globex", 88.0, "2024-02-01"),
        },
      },
      qb_vendor_id: null,
      qb_bill_id: null,
      file_hash: "hash-2",
      gcs_generation: "222",
      gcs_hash_value: "hash-gcs-2",
    });

    let createCalls = 0;
    const deps = {
      supabase,
      getExpenseAccounts: async () => [{ Id: "acct-1", Name: "Expenses", AccountType: "Expense" }],
      findOrCreateVendor: async () => ({ Id: "ven-2", DisplayName: "Globex" }),
      findPotentialDuplicateBill: async () => null,
      getBill: async (billId: string) => ({
        Id: billId,
        VendorRef: { value: "ven-2" },
        DocNumber: undefined,
        TxnDate: "2024-02-01",
        TotalAmt: billId === "QB-NEW" ? 88.0 : 88.0,
        Line: [],
      }),
      createBill: async () => {
        createCalls += 1;
        return { Id: "QB-NEW", TotalAmt: 88.0 };
      },
    };

    const result = await syncDocumentWithDeps(documentId, undefined, deps);

    if (!result.success) {
      failures.push("expected race sync to succeed");
    }
    if (result.qbBillId !== "QB-RACE") {
      failures.push(`expected race sync qbBillId QB-RACE, got ${result.qbBillId}`);
    }
    if (createCalls !== 1) {
      failures.push(`expected createBill to be called once in race, got ${createCalls}`);
    }
  }

  // Test 3: pre-sync checklist blocks documents with review flags
  {
    const supabase = createSupabaseStub();
    const documentId = "doc-3";
    supabase.data.documents.set(documentId, {
      id: documentId,
      sync_status: "approved",
      document_type: "invoice",
      review_flags: ["low_confidence"],
      extraction: {
        type: "invoice",
        data: {
          vendor: "Umbrella Corp",
          total: 200,
          invoice_date: "2024-03-02",
          field_evidence: buildInvoiceEvidence("Umbrella Corp", 200, "2024-03-02"),
          line_items: [{ amount: 200 }],
        },
      },
      qb_vendor_id: null,
      qb_bill_id: null,
      file_hash: "hash-3",
      gcs_generation: "333",
      gcs_hash_value: "hash-gcs-3",
    });

    let createCalls = 0;
    const deps = {
      supabase,
      getExpenseAccounts: async () => [{ Id: "acct-1", Name: "Expenses", AccountType: "Expense" }],
      findOrCreateVendor: async () => ({ Id: "ven-3", DisplayName: "Umbrella Corp" }),
      findPotentialDuplicateBill: async () => null,
      getBill: async (billId: string) => ({
        Id: billId,
        VendorRef: { value: "ven-3" },
        DocNumber: undefined,
        TxnDate: "2024-03-02",
        TotalAmt: 200,
        Line: [],
      }),
      createBill: async () => {
        createCalls += 1;
        return { Id: "QB-3", TotalAmt: 200 };
      },
    };

    const result = await syncDocumentWithDeps(documentId, undefined, deps);

    if (result.success) {
      failures.push("expected flagged document sync to fail");
    }
    if (createCalls !== 0) {
      failures.push(`expected createBill not to be called for flagged doc, got ${createCalls}`);
    }
  }

  // Test 4: pre-sync checklist blocks inconsistent line-total math
  {
    const supabase = createSupabaseStub();
    const documentId = "doc-4";
    supabase.data.documents.set(documentId, {
      id: documentId,
      sync_status: "approved",
      document_type: "invoice",
      extraction: {
        type: "invoice",
        data: {
          vendor: "Wayne Enterprises",
          total: 100,
          invoice_date: "2024-03-10",
          field_evidence: buildInvoiceEvidence("Wayne Enterprises", 100, "2024-03-10"),
          line_items: [{ amount: 60 }, { amount: 20 }],
        },
      },
      qb_vendor_id: null,
      qb_bill_id: null,
      file_hash: "hash-4",
      gcs_generation: "444",
      gcs_hash_value: "hash-gcs-4",
    });

    let createCalls = 0;
    const deps = {
      supabase,
      getExpenseAccounts: async () => [{ Id: "acct-1", Name: "Expenses", AccountType: "Expense" }],
      findOrCreateVendor: async () => ({ Id: "ven-4", DisplayName: "Wayne Enterprises" }),
      findPotentialDuplicateBill: async () => null,
      getBill: async (billId: string) => ({
        Id: billId,
        VendorRef: { value: "ven-4" },
        DocNumber: undefined,
        TxnDate: "2024-03-10",
        TotalAmt: 100,
        Line: [],
      }),
      createBill: async () => {
        createCalls += 1;
        return { Id: "QB-4", TotalAmt: 100 };
      },
    };

    const result = await syncDocumentWithDeps(documentId, undefined, deps);

    if (result.success) {
      failures.push("expected inconsistent invoice math sync to fail");
    }
    if (createCalls !== 0) {
      failures.push(`expected createBill not to be called for inconsistent totals, got ${createCalls}`);
    }
  }

  // Test 5: QuickBooks preflight dedupe reuses existing bill
  {
    const supabase = createSupabaseStub();
    const documentId = "doc-5";
    supabase.data.documents.set(documentId, {
      id: documentId,
      sync_status: "approved",
      document_type: "invoice",
      extraction: {
        type: "invoice",
        data: {
          vendor: "LexCorp",
          invoice_number: "INV-500",
          total: 500,
          invoice_date: "2024-03-12",
          field_evidence: buildInvoiceEvidence("LexCorp", 500, "2024-03-12"),
          line_items: [{ amount: 500 }],
        },
      },
      qb_vendor_id: null,
      qb_bill_id: null,
      file_hash: "hash-5",
      gcs_generation: "555",
      gcs_hash_value: "hash-gcs-5",
    });

    let createCalls = 0;
    const deps = {
      supabase,
      getExpenseAccounts: async () => [{ Id: "acct-1", Name: "Expenses", AccountType: "Expense" }],
      findOrCreateVendor: async () => ({ Id: "ven-5", DisplayName: "LexCorp" }),
      findPotentialDuplicateBill: async () => ({ Id: "QB-EXISTING", TotalAmt: 500 }),
      getBill: async (billId: string) => ({
        Id: billId,
        VendorRef: { value: "ven-5" },
        DocNumber: "INV-500",
        TxnDate: "2024-03-12",
        TotalAmt: 500,
        Line: [],
      }),
      createBill: async () => {
        createCalls += 1;
        return { Id: "QB-5", TotalAmt: 500 };
      },
    };

    const result = await syncDocumentWithDeps(documentId, undefined, deps);

    if (!result.success) {
      failures.push("expected preflight dedupe sync to succeed");
    }
    if (result.qbBillId !== "QB-EXISTING") {
      failures.push(`expected preflight dedupe to return QB-EXISTING, got ${result.qbBillId}`);
    }
    if (createCalls !== 0) {
      failures.push(`expected createBill not to be called for preflight duplicate, got ${createCalls}`);
    }
  }

  // Test 6: sync snapshot lock uses approved snapshot instead of edited extraction
  {
    const supabase = createSupabaseStub();
    const documentId = "doc-6";
    supabase.data.documents.set(documentId, {
      id: documentId,
      sync_status: "approved",
      document_type: "invoice",
      human_overrides: {
        sync_snapshot: {
          version: 1,
          captured_at: "2024-03-20T00:00:00.000Z",
          source_status: "approved",
          vendor: "Snapshot Vendor",
          invoice_number: "INV-SNAP-6",
          invoice_date: "2024-03-20",
          due_date: null,
          subtotal: null,
          tax: null,
          total: 111,
          line_items: [{ description: "Locked item", quantity: null, unit_price: null, amount: 111 }],
          confidence: 0.95,
          field_evidence: buildInvoiceEvidence("Snapshot Vendor", 111, "2024-03-20"),
        },
      },
      extraction: {
        type: "invoice",
        data: {
          vendor: "Edited Vendor",
          invoice_number: "INV-EDITED",
          total: 999,
          invoice_date: "2024-03-21",
          field_evidence: buildInvoiceEvidence("Edited Vendor", 999, "2024-03-21"),
          line_items: [{ amount: 999 }],
        },
      },
      qb_vendor_id: null,
      qb_bill_id: null,
      file_hash: "hash-6",
      gcs_generation: "666",
      gcs_hash_value: "hash-gcs-6",
    });

    let createCalls = 0;
    let vendorLookupName = "";
    let postedAmount: number | null = null;
    const deps = {
      supabase,
      getExpenseAccounts: async () => [{ Id: "acct-1", Name: "Expenses", AccountType: "Expense" }],
      findOrCreateVendor: async ({ displayName }: { displayName: string }) => {
        vendorLookupName = displayName;
        return { Id: "ven-6", DisplayName: displayName };
      },
      findPotentialDuplicateBill: async () => null,
      getBill: async (billId: string) => ({
        Id: billId,
        VendorRef: { value: "ven-6" },
        DocNumber: "INV-SNAP-6",
        TxnDate: "2024-03-20",
        TotalAmt: 111,
        Line: [],
      }),
      createBill: async (input: { lines: Array<{ amount: number }> }) => {
        createCalls += 1;
        postedAmount = input.lines.reduce((sum, line) => sum + line.amount, 0);
        return { Id: "QB-6", TotalAmt: postedAmount };
      },
    };

    const result = await syncDocumentWithDeps(documentId, undefined, deps);

    if (!result.success) {
      failures.push("expected snapshot-lock sync to succeed");
    }
    if (vendorLookupName !== "Snapshot Vendor") {
      failures.push(`expected vendor lookup to use snapshot vendor, got ${vendorLookupName}`);
    }
    if (postedAmount !== 111) {
      failures.push(`expected created bill amount 111 from snapshot, got ${postedAmount}`);
    }
    if (createCalls !== 1) {
      failures.push(`expected one createBill call for snapshot-lock test, got ${createCalls}`);
    }
  }

  // Test 7: strict evidence requirement blocks sync when evidence is missing
  {
    const supabase = createSupabaseStub();
    const documentId = "doc-7";
    supabase.data.documents.set(documentId, {
      id: documentId,
      sync_status: "approved",
      document_type: "invoice",
      extraction: {
        type: "invoice",
        data: {
          vendor: "No Evidence Vendor",
          total: 77,
          invoice_date: "2024-03-25",
          line_items: [{ amount: 77 }],
        },
      },
      qb_vendor_id: null,
      qb_bill_id: null,
      file_hash: "hash-7",
      gcs_generation: "777",
      gcs_hash_value: "hash-gcs-7",
    });

    let createCalls = 0;
    const deps = {
      supabase,
      getExpenseAccounts: async () => [{ Id: "acct-1", Name: "Expenses", AccountType: "Expense" }],
      findOrCreateVendor: async () => ({ Id: "ven-7", DisplayName: "No Evidence Vendor" }),
      findPotentialDuplicateBill: async () => null,
      getBill: async (billId: string) => ({
        Id: billId,
        VendorRef: { value: "ven-7" },
        DocNumber: undefined,
        TxnDate: "2024-03-25",
        TotalAmt: 77,
        Line: [],
      }),
      createBill: async () => {
        createCalls += 1;
        return { Id: "QB-7", TotalAmt: 77 };
      },
    };

    const result = await syncDocumentWithDeps(documentId, undefined, deps);

    if (result.success) {
      failures.push("expected strict evidence gate to block sync");
    }
    if (createCalls !== 0) {
      failures.push(`expected createBill not to run when evidence is missing, got ${createCalls}`);
    }
  }

  // Test 8: reconciliation failure marks sync as error after create
  {
    const supabase = createSupabaseStub();
    const documentId = "doc-8";
    supabase.data.documents.set(documentId, {
      id: documentId,
      sync_status: "approved",
      document_type: "invoice",
      extraction: {
        type: "invoice",
        data: {
          vendor: "Recon Vendor",
          invoice_number: "INV-RECON-8",
          total: 120,
          invoice_date: "2024-03-30",
          field_evidence: buildInvoiceEvidence("Recon Vendor", 120, "2024-03-30"),
          line_items: [{ amount: 120 }],
        },
      },
      qb_vendor_id: null,
      qb_bill_id: null,
      file_hash: "hash-8",
      gcs_generation: "888",
      gcs_hash_value: "hash-gcs-8",
    });

    let createCalls = 0;
    const deps = {
      supabase,
      getExpenseAccounts: async () => [{ Id: "acct-1", Name: "Expenses", AccountType: "Expense" }],
      findOrCreateVendor: async () => ({ Id: "ven-8", DisplayName: "Recon Vendor" }),
      findPotentialDuplicateBill: async () => null,
      getBill: async (billId: string) => ({
        Id: billId,
        VendorRef: { value: "ven-8" },
        DocNumber: "INV-RECON-8",
        TxnDate: "2024-03-30",
        TotalAmt: 999,
        Line: [],
      }),
      createBill: async () => {
        createCalls += 1;
        return { Id: "QB-8", TotalAmt: 120 };
      },
    };

    const result = await syncDocumentWithDeps(documentId, undefined, deps);
    const updated = supabase.data.documents.get(documentId);

    if (result.success) {
      failures.push("expected reconciliation mismatch to fail sync");
    }
    if (createCalls !== 1) {
      failures.push(`expected createBill to run once before reconciliation fail, got ${createCalls}`);
    }
    if (updated?.sync_status !== "error") {
      failures.push(`expected document status error after reconciliation fail, got ${updated?.sync_status}`);
    }
  }

  if (failures.length > 0) {
    console.error("QuickBooks idempotency test FAILED:");
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log("QuickBooks idempotency test PASSED");
}

run().catch((error) => {
  console.error("QuickBooks idempotency test failed:", error);
  process.exit(1);
});
