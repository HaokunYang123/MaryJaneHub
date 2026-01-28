import { createAdminClient } from './admin';

/**
 * User Administration Helper
 *
 * Uses service_role client to manage user app_metadata.
 * Only service_role can update user metadata - frontend cannot.
 *
 * This enables:
 * - Setting is_super_admin flag for Mary + accountant (ENT-04)
 * - Assigning users to entities via entity_ids array
 *
 * Security:
 * - Only call from server-side code (API routes, server actions)
 * - Never expose these functions to client components
 */

/**
 * Set super-admin status for a user
 *
 * Super admins can:
 * - See all entities across the system
 * - Manage entities (create, update, delete)
 * - Read audit logs
 *
 * @param userId - The user's UUID from auth.users
 * @param isSuperAdmin - Whether to grant or revoke super admin
 */
export async function setSuperAdmin(
  userId: string,
  isSuperAdmin: boolean
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      is_super_admin: isSuperAdmin
    }
  });

  if (error) {
    throw new Error(`Failed to update super admin status: ${error.message}`);
  }
}

/**
 * Assign a user to one or more entities
 *
 * Entity IDs are stored in app_metadata.entity_ids array.
 * This is checked by auth.has_entity_access() in RLS policies.
 *
 * @param userId - The user's UUID from auth.users
 * @param entityIds - Array of entity UUIDs the user can access
 */
export async function assignUserToEntity(
  userId: string,
  entityIds: string[]
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      entity_ids: entityIds
    }
  });

  if (error) {
    throw new Error(`Failed to assign user to entities: ${error.message}`);
  }
}

/**
 * Get user's current app_metadata
 *
 * Useful for checking current assignments before updates.
 *
 * @param userId - The user's UUID from auth.users
 * @returns The user's app_metadata object
 */
export interface UserAccessMetadata {
  is_super_admin?: boolean;
  entity_ids?: string[];
}

export async function getUserMetadata(
  userId: string
): Promise<UserAccessMetadata> {
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error) {
    throw new Error(`Failed to get user metadata: ${error.message}`);
  }

  // Cast from Supabase's generic UserAppMetadata to our specific type
  return (data.user?.app_metadata || {}) as UserAccessMetadata;
}

/**
 * Update both super admin status and entity assignments atomically
 *
 * Preserves existing app_metadata while updating specified fields.
 *
 * @param userId - The user's UUID from auth.users
 * @param options - Fields to update
 */
export async function updateUserAccess(
  userId: string,
  options: {
    isSuperAdmin?: boolean;
    entityIds?: string[];
  }
): Promise<void> {
  const admin = createAdminClient();

  // Build metadata update object
  const metadataUpdate: Record<string, unknown> = {};

  if (options.isSuperAdmin !== undefined) {
    metadataUpdate.is_super_admin = options.isSuperAdmin;
  }

  if (options.entityIds !== undefined) {
    metadataUpdate.entity_ids = options.entityIds;
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: metadataUpdate
  });

  if (error) {
    throw new Error(`Failed to update user access: ${error.message}`);
  }
}
