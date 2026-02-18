import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { getSession, type AuthUser } from "./session";

export type AdminAccessResult =
  | { ok: true; user: AuthUser }
  | { ok: false; status: 401 | 403; message: string };

const ADMIN_SECRET_HEADER = "x-admin-secret";

function resolveAdminSecret(): string | null {
  const raw = process.env.ADMIN_SECRET ?? process.env.ADMIN_API_SECRET;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeEqualSecret(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function buildSecretUser(): AuthUser {
  return {
    id: "admin-secret",
    email: "admin-secret@local",
    name: null,
    avatarUrl: null,
    role: "admin",
  };
}

export async function requireAdminAccess(): Promise<AdminAccessResult> {
  const { user } = await getSession();

  if (!user) {
    return {
      ok: false,
      status: 401,
      message: "Authentication required",
    };
  }

  if (user.role !== "admin") {
    return {
      ok: false,
      status: 403,
      message: "Admin role required",
    };
  }

  return { ok: true, user };
}

export async function requireAdminAccessForRequest(
  request: NextRequest
): Promise<AdminAccessResult> {
  const expectedSecret = resolveAdminSecret();
  const providedSecret = request.headers.get(ADMIN_SECRET_HEADER)?.trim() || null;

  if (expectedSecret !== null) {
    // ADMIN_SECRET is configured — enforce secret-only, no session fallback.
    // Mirrors the same pattern in lib/auth/api-middleware.ts requireAdmin().
    if (providedSecret === null) {
      return { ok: false, status: 401, message: "Admin secret required" };
    }
    if (safeEqualSecret(providedSecret, expectedSecret)) {
      return { ok: true, user: buildSecretUser() };
    }
    return { ok: false, status: 401, message: "Invalid admin secret" };
  }

  return requireAdminAccess();
}
