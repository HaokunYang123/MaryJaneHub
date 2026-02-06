# Founder TODO (Drive AI Rollout)

## Purpose
Track the product-owner actions needed to launch secure, professional AI file management.

## Usage
- Keep this as a reminder list only: short, clear, actionable lines.
- Check off items when done; do not expand into long notes here.

## Immediate (This Week)
- [ ] Confirm AI-managed root folders for each business entity (final names + Drive IDs).
- [ ] Confirm policy: outside AI-managed roots = read + private metadata only (no auto-move/rename).
- [ ] Confirm duplicate canonical rule for search: highest confidence, then newest, then AI-root priority.
- [ ] Approve initial AI auto-organization confidence threshold (recommended start: high threshold only).

## Customer Alignment
- [ ] Ask customer the top naming/governance questions in `/docs/ops/customer-alignment-note.md`.
- [ ] Confirm whether client-share "pack folders" should use shortcuts or moved originals.
- [ ] Confirm any privacy-sensitive fields that must never appear in file names.
- [ ] Confirm one common entity template vs per-entity custom subfolder templates.

## Security + Compliance
- [ ] Decide production AI platform mode (recommended: Gemini on Vertex AI for enterprise governance).
- [ ] Plan OAuth restricted-scope verification for full Drive indexing/write boundaries.
- [ ] Define retention and deletion policy for AI metadata in app DB.
- [ ] Confirm audit-log requirements for every AI write action.

## Build Readiness
- [ ] Approve phased rollout: index-only -> metadata-only -> AI-managed roots auto-organize.
- [ ] Approve safe rollback rule for mistaken organization actions.
- [ ] Define acceptance metrics (organization precision, duplicate error rate, manual correction rate).
- [ ] Define "go/no-go" thresholds before expanding automation scope.

## Later (After Stable Usage)
- [ ] Reassess whether custom model training is needed based on measured error patterns.
- [ ] Consider user-pinned canonical documents for duplicate groups.
- [ ] Consider behavior-learning only after enough high-quality labeled corrections exist.
