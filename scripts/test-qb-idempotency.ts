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
        data: { vendor: "Acme", total: 123.45, invoice_date: "2024-01-19" },
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
        data: { vendor: "Globex", total: 88.0, invoice_date: "2024-02-01" },
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
