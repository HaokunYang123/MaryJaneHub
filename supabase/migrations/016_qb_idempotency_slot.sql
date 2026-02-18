-- Extend qb_idempotency for reservation pattern to prevent race conditions
-- on concurrent sync attempts for the same document.
--
-- Before this migration, the check (SELECT) and the write (INSERT) happened
-- around the QuickBooks API call, creating a window where two concurrent
-- requests could both create duplicate QB Bills.
--
-- The reservation pattern: INSERT a 'pending' row before calling the QB API;
-- only the first INSERT wins (UNIQUE on idempotency_key). After the API call,
-- UPDATE the row to 'complete' with the real qb_object_id.

ALTER TABLE qb_idempotency
  ALTER COLUMN qb_object_id DROP NOT NULL;

ALTER TABLE qb_idempotency
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete';

COMMENT ON COLUMN qb_idempotency.qb_object_id IS 'QuickBooks object ID — NULL while status=pending';
COMMENT ON COLUMN qb_idempotency.status IS 'Slot status: pending (QB API in progress) | complete (synced)';
