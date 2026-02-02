import { createHash } from "crypto";

export type QbIdempotencyRecord = {
  document_id: string;
  qb_object_type: string;
  qb_object_id: string;
  idempotency_key: string;
  created_at?: string;
};

export type IdempotencyKeyInput = {
  documentId: string;
  qbObjectType: string;
  fileHash?: string | null;
  gcsGeneration?: string | null;
  gcsHashValue?: string | null;
  vendor?: string | null;
  total?: number | null;
  date?: string | null;
};

export function buildQbIdempotencyKey(input: IdempotencyKeyInput): string {
  const payload = {
    document_id: input.documentId,
    qb_object_type: input.qbObjectType,
    file_hash: input.fileHash || "",
    gcs_generation: input.gcsGeneration || "",
    gcs_hash_value: input.gcsHashValue || "",
    vendor: input.vendor || "",
    total: input.total ?? null,
    date: input.date ?? null,
  };
  const raw = JSON.stringify(payload);
  return createHash("sha256").update(raw).digest("hex");
}

export async function getQbIdempotencyRecord(
  supabase: {
    from: (table: string) => {
      select: (fields: string) => unknown;
      eq: (column: string, value: string) => unknown;
      maybeSingle: () => Promise<{ data: QbIdempotencyRecord | null; error: { message: string } | null }>;
    };
  },
  idempotencyKey: string
): Promise<QbIdempotencyRecord | null> {
  const { data, error } = await supabase
    .from("qb_idempotency")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch idempotency record: ${error.message}`);
  }

  return data;
}

export async function insertQbIdempotencyRecord(
  supabase: {
    from: (table: string) => {
      insert: (record: QbIdempotencyRecord) => Promise<{ error: { code?: string; message: string } | null }>;
    };
  },
  record: QbIdempotencyRecord
): Promise<{ record: QbIdempotencyRecord; deduped: boolean }> {
  const { error } = await supabase.from("qb_idempotency").insert(record);
  if (!error) {
    return { record, deduped: false };
  }

  if (error.code === "23505") {
    return { record, deduped: true };
  }

  throw new Error(`Failed to insert idempotency record: ${error.message}`);
}
