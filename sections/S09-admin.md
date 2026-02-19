# S09 — Admin Operations

## Status: Done

## Intent

Provide admin-only endpoints for system management: email whitelist CRUD, Google Drive corpus browsing and file organization, audit data export, and evidence packet generation.

**Success criteria:** Admin can manage the email whitelist, browse and organize Drive files within managed roots, and export audit/evidence data. All endpoints enforce admin-only auth.

**Non-goals:** Admin UI (API-only for now). Bulk Drive operations. Scheduled audit exports.

## Contract

**ContractVersion: v1**

### Whitelist — /api/admin/whitelist

Auth: `requireAdmin()`

```typescript
// GET → list all
{ success: true, data: WhitelistEntry[] }

// POST → add
Request: { email: string, name?: string, role?: "admin" | "user" | "viewer" }
Response: { success: true, data: WhitelistEntry }

// PATCH → update
Request: { id: string, name?: string, role?: string, is_active?: boolean }
Response: { success: true, data: WhitelistEntry }

// DELETE → remove
Request: { id: string, hard_delete?: boolean }
// hard_delete=false (default): sets is_active=false
// hard_delete=true: deletes row
```

### Drive corpus — GET /api/admin/drive/corpus

Auth: `requireAdmin()`

```typescript
// Query params
{ limit?: number, onlySupportedTypes?: boolean, includeFolders?: boolean }
// limit: 1-5000, default 500

// Response
{ success: true, data: DriveFile[], options: { ... } }
```

### Drive organize — POST /api/admin/drive/organize

Auth: `requireAdmin()`

```typescript
// Request
{ fileId: string, newName?: string, targetFolderId: string, sourceFolderId?: string, dryRun?: boolean }

// Response (dryRun=true): what would happen
// Response (dryRun=false): move result
```

Enforces managed root boundaries (ADR-003).

### Drive metadata — /api/admin/drive/metadata

Auth: `requireAdmin()`

```typescript
// GET: { fileId: string } → { success: true, data: appProperties }
// POST: { fileId: string, appProperties: Record<string, unknown>, merge?: boolean }
// merge=true (default): merges with existing; merge=false: replaces all
```

### Audit export — GET /api/admin/audit/assistant

Auth: `requireAdmin()`

Returns assistant conversation audit data.

### Evidence packets — GET /api/admin/evidence-packet[/v2]

Auth: `requireAdmin()`

Generates compliance evidence bundle for a document or set of documents.

## Proof

1. Non-admin user calling any /api/admin/* endpoint receives 403.
2. Adding an email to whitelist with POST returns the created entry with assigned role.
3. Drive organize with dryRun=true returns the planned action without moving the file.
4. Drive organize targeting a folder outside managed roots returns an error.
5. Evidence packet v2 includes field-level coordinates and highlight data.

## Depends On

- S01 (requireAdmin)
- ADR-001 (service key for DB)
- ADR-002 (role validation for whitelist entries)
- ADR-003 (managed root enforcement for Drive operations)

## Files

- `app/api/admin/whitelist/route.ts`
- `app/api/admin/drive/corpus/route.ts`
- `app/api/admin/drive/organize/route.ts`
- `app/api/admin/drive/metadata/route.ts`
- `app/api/admin/audit/assistant/route.ts`
- `app/api/admin/evidence-packet/route.ts`
- `app/api/admin/evidence-packet/v2/route.ts`
- `lib/audit/evidence-packet.ts`
- `lib/audit/evidence-packet-v2.ts`
- `lib/audit/assistant-export.ts`
- `lib/google-drive/list-corpus.ts`
- `lib/google-drive/move-file.ts`
- `lib/google-drive/metadata.ts`
- `lib/google-drive/managed-zone.ts`
