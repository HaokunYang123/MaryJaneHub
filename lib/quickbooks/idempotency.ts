import { createHash } from "crypto";

export type QbIdempotencyRecord = {
  document_id: string;
  qb_object_type: string;
  qb_object_id: string | null;
  idempotency_key: string;
  /** "pending" while QB API is in flight; "complete" once fulfilled. Added in migration 016. */
  status?: "pending" | "complete";
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
    from: (table: string) => any;
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
    from: (table: string) => any;
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

/**
 * Atomically claim an idempotency slot before calling the QB API.
 *
 * Returns { claimed: true } if this caller won the race (should proceed),
 * or { claimed: false, existingRecord } if another caller got there first.
 *
 * The slot is inserted with status='pending' and qb_object_id=null.
 * Call fulfillIdempotencySlot() after a successful QB API response,
 * or abandonIdempotencySlot() if the call fails and should be retried.
 */
export async function tryClaimIdempotencySlot(
  supabase: { from: (table: string) => any },
  idempotencyKey: string,
  documentId: string,
  qbObjectType: string
): Promise<{ claimed: boolean; existingRecord: QbIdempotencyRecord | null }> {
  const { error } = await supabase.from("qb_idempotency").insert({
    document_id: documentId,
    qb_object_type: qbObjectType,
    qb_object_id: null,
    idempotency_key: idempotencyKey,
    status: "pending",
  });

  if (!error) {
    return { claimed: true, existingRecord: null };
  }

  if (error.code === "23505") {
    const existing = await getQbIdempotencyRecord(supabase, idempotencyKey).catch(() => null);
    return { claimed: false, existingRecord: existing };
  }

  throw new Error(`Failed to claim idempotency slot: ${error.message}`);
}

/**
 * Fulfill a previously claimed idempotency slot with the real QB object ID.
 * Must be called after a successful QB API response.
 */
export async function fulfillIdempotencySlot(
  supabase: { from: (table: string) => any },
  idempotencyKey: string,
  qbObjectId: string
): Promise<void> {
  const { error } = await supabase
    .from("qb_idempotency")
    .update({ qb_object_id: qbObjectId, status: "complete" })
    .eq("idempotency_key", idempotencyKey);

  if (error) {
    throw new Error(`Failed to fulfill idempotency slot: ${error.message}`);
  }
}

/**
 * Release (delete) a pending idempotency slot on QB API failure.
 * Allows a future sync attempt to claim the slot and retry.
 */
export async function abandonIdempotencySlot(
  supabase: { from: (table: string) => any },
  idempotencyKey: string
): Promise<void> {
  await supabase
    .from("qb_idempotency")
    .delete()
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "pending");
}
