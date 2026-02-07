const MANAGED_ROOTS_ENV = "GOOGLE_DRIVE_AI_MANAGED_ROOT_IDS";

function parseManagedRoots(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function getManagedRootIds(): string[] {
  return parseManagedRoots(process.env[MANAGED_ROOTS_ENV]);
}

export function hasManagedRootsConfigured(): boolean {
  return getManagedRootIds().length > 0;
}

export function isManagedRoot(folderId: string): boolean {
  if (!folderId) return false;
  return getManagedRootIds().includes(folderId);
}
