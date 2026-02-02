# Retention Questions (Internal)

## 8 Lawyer Questions
1) What retention policy/hold applies to the archive bucket, and is it locked (WORM)?
2) What is the retention duration (days/years), and how is it enforced (bucket vs object)?
3) Can any actor delete or overwrite archived objects during retention?
4) How do we prove immutability of a specific record (generation + hash)?
5) What audit trail exists for access/read of archived objects?
6) What is the legal hold process (who can place/remove holds)?
7) What is the disaster recovery plan for archived evidence?
8) How do we export evidence packets for litigation without exposing raw OCR text?

## Current Implementation Notes
- Stored fields: `gcs_bucket`, `gcs_object`, `gcs_generation`, `gcs_hash_type`, `gcs_hash_value`, `gcs_retention_status`.
- Best-effort: retention enforcement is attempted via per-object metadata if `GCS_ARCHIVE_RETENTION_DAYS` is set.
- Guaranteed: object immutability is only guaranteed if the bucket has retention policy/object lock configured at the bucket level.
- Evidence packets include archive fingerprint + retention status; OCR/raw text is scrubbed.

## Retention Configuration
- Env placeholder: `GCS_ARCHIVE_RETENTION_DAYS` (optional; used to set per-object retain-until time).
- Preferred: configure bucket-level retention/lock directly in GCS (not enforced in app code).
