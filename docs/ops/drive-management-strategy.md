# Drive Management Strategy (Living Note)

## Status
Draft (actively updated during product discussion).

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

## Product Intent (Current Interpretation)
- Users can upload via:
  - Directly into Google Drive (any folder).
  - Website upload flow connected to the AI-managed intake area.
- AI should provide intelligent structure inside entity roots and keep outputs suitable for customer-facing sharing.

## Recommended Baseline Architecture (v0.1)
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

## Open Design Questions
- Outside AI-managed roots, should AI be allowed metadata-only writes or strict read-only behavior?
- In AI-managed roots, should move/rename be fully automatic or confidence-threshold gated?
- For client-sharing workflows, should "pack folders" contain moved originals or shortcuts?
- Should each business entity root share a common template, or allow per-entity subfolder strategy?

## Next Research/Design Work
- Define permission model and audit controls for privacy-by-default operation.
- Define folder taxonomy algorithm (simple deterministic rules first, ML ranking later).
- Define rollback/recovery policy for mistaken file organization actions.
- Define customer-facing "professional packaging" flow for share-ready deliverables.
