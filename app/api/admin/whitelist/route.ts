/**
 * Whitelist Management API
 *
 * Admin-only endpoints for managing the email whitelist
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/api-middleware";
import {
  getWhitelist,
  addToWhitelist,
  updateWhitelistEntry,
  deleteWhitelistEntry,
  type WhitelistEntry,
} from "@/lib/auth/whitelist";
import { AUTH_CONFIG, type UserRole } from "@/lib/auth/config";

/**
 * GET /api/admin/whitelist
 * List all whitelisted emails
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return authResult.response;
  }

  const result = await getWhitelist();

  if (!result.success) {
    return NextResponse.json(
      { error: "Failed to fetch whitelist", message: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    count: (result.data as WhitelistEntry[]).length,
  });
}

/**
 * POST /api/admin/whitelist
 * Add an email to the whitelist
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const body = await request.json();
    const { email, name, role } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Validation error", message: "Email is required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Validation error", message: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate role if provided
    const validRoles = Object.values(AUTH_CONFIG.roles);
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Validation error", message: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await addToWhitelist(email, name, role as UserRole);

    if (!result.success) {
      const status = result.error?.includes("already exists") ? 409 : 500;
      return NextResponse.json(
        { error: "Failed to add email", message: result.error },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      message: `${email} added to whitelist`,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", message: "Invalid JSON body" },
      { status: 400 }
    );
  }
}

/**
 * PATCH /api/admin/whitelist
 * Update a whitelist entry
 */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const body = await request.json();
    const { id, name, role, is_active } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Validation error", message: "ID is required" },
        { status: 400 }
      );
    }

    // Validate role if provided
    const validRoles = Object.values(AUTH_CONFIG.roles);
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Validation error", message: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    const updates: Partial<Pick<WhitelistEntry, "name" | "role" | "is_active">> = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Validation error", message: "No updates provided" },
        { status: 400 }
      );
    }

    const result = await updateWhitelistEntry(id, updates);

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to update entry", message: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      message: "Whitelist entry updated",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", message: "Invalid JSON body" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/admin/whitelist
 * Delete a whitelist entry
 */
export async function DELETE(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!authResult.authenticated) {
    return authResult.response;
  }

  try {
    const body = await request.json();
    const { id, hard_delete } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Validation error", message: "ID is required" },
        { status: 400 }
      );
    }

    let result;
    if (hard_delete) {
      result = await deleteWhitelistEntry(id);
    } else {
      result = await updateWhitelistEntry(id, { is_active: false });
    }

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to delete entry", message: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: hard_delete ? "Entry permanently deleted" : "Entry deactivated",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request", message: "Invalid JSON body" },
      { status: 400 }
    );
  }
}
