# Drive Management Strategy (Living Note)

## Status
Draft v0.3 (actively updated during product discussion).

## Linked Owner Checklist
- Product-owner execution checklist: `/docs/ops/founder-todo.md`

## Objective
Design a Google Drive strategy that keeps all content searchable/chat-ready while restricting AI auto-organization to approved folders only.

## Confirmed Requirements (2026-02-06)
- Index all user-accessible content: My Drive + Shared Drives.
- Enforce strong privacy/security for indexing and AI usage.
- Use a two-zone governance model:
  - AI-managed zone: fixed root folders by business entity; AI can organize subfolders/files safely.
  - User-managed zone: all other folders/files remain user-controlled; AI can read/index/interact but does not auto-sort.
- AI-managed organization must be human-oriented (not dataset-oriented): professional, clear, simple, neat.
- Metadata enrichment is allowed for interaction and semantic search.
- Initial behavior-learning from user file interactions is optional and currently deferred unless proven low-risk and cost-effective.
- Duplicate policy:
  - AI-managed zone: avoid duplicate files in managed folders.
  - User-managed zone: duplicates are allowed.
  - Semantic search/chat: collapse duplicates and show one canonical result.
- Global metadata policy:
  - AI can write private metadata for both AI-managed and user-managed files to support indexing/search/interaction.
  - Outside AI-managed roots, metadata writes must not alter user-visible organization.
- Access scope for current pilot:
  - Integration access is limited to Mary test parent folder (including Inbox/Processed subfolders).
  - Full-drive access (all My Drive + Shared Drives) is deferred to a later rollout phase.

## Product Intent (Current Interpretation)
- Users can upload via:
  - Directly into Google Drive (any folder).
  - Website upload flow connected to the AI-managed intake area.
- AI should provide intelligent structure inside entity roots and keep outputs suitable for customer-facing sharing.

## Implementation Status (2026-02-07)
- Implemented backend-first foundation (no frontend dependency):
  - Corpus listing across My Drive + Shared Drives (`/api/admin/drive/corpus`).
  - Private metadata read/write API for Drive `appProperties` (`/api/admin/drive/metadata`).
  - Managed-zone organization API with write guard (`/api/admin/drive/organize`).
  - Duplicate-collapse in search output (`/api/documents/search`, `smartSearch`) with canonical result metadata.
  - Shared-drive-safe Drive API calls (`supportsAllDrives`, `includeItemsFromAllDrives` where applicable).
- Current write-guard behavior:
  - If `GOOGLE_DRIVE_AI_MANAGED_ROOT_IDS` is configured, managed organize actions are allowed only within those roots/subtrees.
  - If roots are not configured, guard falls back to permissive mode (for backward compatibility during rollout).
- Frontend requirement:
  - Not required for initial implementation.
  - Frontend is optional for visibility/controls (settings, approvals, review UX).
- Current blocker:
  - Live admin API validation is pending until a regular Google Drive environment is provisioned.

## Recommended Baseline Architecture (v0.2)
1. Corpus indexing:
- Crawl + incremental sync over My Drive and each Shared Drive.
- Maintain semantic index and retrieval metadata for all readable files.

2. Write safety boundary:
- Hard backend policy: rename/move/create operations only allowed under approved AI-managed entity roots.
- Outside those roots, no auto-organization actions.

3. Metadata model:
- Store internal AI state in app-private metadata and product DB.
- Keep user-facing folder naming simple and professional.

4. Organization strategy in AI-managed roots:
- Entity root (fixed) -> AI-generated subfolders by document purpose/type/time horizon.
- Favor predictable folder semantics over aggressive automation.

5. Human control:
- Mary can provide explicit management suggestions.
- AI follows explicit suggestions first; autonomous optimizations stay conservative.

6. AI model strategy:
- Keep current cloud-first approach for now:
  - Document AI for OCR/layout where files lack reliable text layers.
  - Gemini for classification, extraction, naming, and conversational retrieval.
- Use deterministic policy engine for folder moves/renames; use AI scoring as input, not sole controller.
- Defer local training/behavior-learning until enough labeled actions exist (quality/cost risk is currently high).

7. Organization execution model:
- AI-managed roots:
  - Allow move/rename/folder-create actions under policy + confidence gates.
  - Enforce duplicate prevention before write actions.
- User-managed zone:
  - Read/index + private metadata writes only.
  - No auto-sort, no auto-move, no auto-rename.

## Security + Privacy Direction (Proposed)
- Use least-privilege OAuth scopes possible while still supporting full indexing + managed-zone writes.
- Treat broad Drive scopes as restricted and complete required verification/compliance steps for production.
- Prefer enterprise mode with no model-training reuse of customer content and strict retention posture.
- Add audit trail for every write action (who/what/why/source signal/confidence).
- Add hard deny rules to block writes outside approved AI-managed roots.
- Do not opt in to external dataset-sharing workflows for sensitive customer content.
- Production privacy baseline:
  - Prefer Gemini via Vertex AI (enterprise governance path) for business-sensitive workloads.
  - Keep Drive private metadata compact; store rich AI state and evidence in product DB keyed by Drive file id.

## Duplicate Handling Policy (Proposed)
1. Exact duplicate detection:
- Compute file fingerprints (binary hash and/or normalized text fingerprint).
- In AI-managed zone, do not create a second managed copy when exact duplicate is detected.

2. Near-duplicate detection:
- Detect high-similarity variants with field-aware + embedding/text similarity checks.
- Mark as `related_duplicate` but avoid aggressive auto-merge without high confidence.

3. Search-time dedupe:
- Retrieval layer groups results by canonical document id.
- UI shows one result with duplicate count and optional "show duplicates" expansion.

4. Canonical tie-breaker (initial):
- Prefer highest extraction confidence.
- If tied, prefer latest modified timestamp.
- If still tied, prefer file already inside AI-managed entity root.

## Robustness Recommendation (Current)
1. Best current path:
- Keep Document AI + Gemini + deterministic policy engine.
- This is robust enough for current stage if guarded by confidence thresholds, idempotent operations, and audit logs.

2. 20k file scale:
- 20k files is within expected operational range without custom model training if indexing/sync is incremental and OCR is selective.
- Run OCR only when needed (scans/images/no reliable text); skip OCR for text-native docs.
- Use queueing, adaptive throughput, and retry policies to control cost and latency.

3. Custom model training decision:
- Do not train immediately.
- Re-evaluate only if both conditions are met:
  - High-volume recurring errors remain after rule/prompt/policy tuning.
  - Labeled ground truth is sufficient for objective evaluation.
- If needed later, train a narrow classifier/ranker for folder placement suggestions, not full end-to-end autonomous organization.

## Scale Triggers For Future Training
- Trigger investigation when sustained metrics exceed thresholds (example):
  - Auto-organization precision below 95% in AI-managed roots.
  - Duplicate false-positive or false-negative rates materially impact user trust.
  - Manual correction rate remains high after policy refinements.
- Require offline benchmark + shadow mode pass before production rollout of any trained model.

## Open Design Questions
- In AI-managed roots, should move/rename be fully automatic or confidence-threshold gated?
- For client-sharing workflows, should "pack folders" contain moved originals or shortcuts?
- Should each business entity root share a common template, or allow per-entity subfolder strategy?
- Should duplicate collapse allow user-pinned canonical override in addition to default tie-breakers?

## Next Research/Design Work
- Define permission model and audit controls for privacy-by-default operation.
- Define folder taxonomy algorithm (simple deterministic rules first, ML ranking later).
- Define rollback/recovery policy for mistaken file organization actions.
- Define customer-facing "professional packaging" flow for share-ready deliverables.
- Define exact canonicalization policy and tie-breakers for duplicate collapse.
- Define metadata schema split: compact Drive `appProperties` keys + rich DB state keyed by file id.
- Define production environment split:
  - Development/testing may use Gemini Developer API with non-sensitive data only.
  - Production should use Vertex AI project controls and retention settings.
- Add change-log incremental sync (user + each shared drive) to replace full-crawl-only indexing.
- Add duplicate-collapse layer in search response shape (canonical + duplicate_count + expansion hooks).
