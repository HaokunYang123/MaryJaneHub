#!/usr/bin/env npx tsx
/**
 * Add Admin User Script
 *
 * Adds an email to the whitelist with admin role.
 * This is needed to bootstrap the first admin user.
 *
 * Usage:
 *   npm run add:admin user@example.com
 *   npm run add:admin user@example.com "John Doe"
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: npm run add:admin <email> [name]");
    console.log("Example: npm run add:admin admin@company.com 'Admin User'");
    process.exit(1);
  }

  const email = args[0];
  const name = args[1] || null;

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error("Error: Invalid email format");
    process.exit(1);
  }

  console.log(`Adding admin user: ${email}`);
  if (name) {
    console.log(`Name: ${name}`);
  }

  const supabase = getSupabase();

  // Check if user already exists
  const { data: existing, error: checkError } = await supabase
    .from("auth_whitelist")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();

  if (existing) {
    console.log("\nUser already exists in whitelist:");
    console.log(`  Email: ${existing.email}`);
    console.log(`  Role: ${existing.role}`);
    console.log(`  Active: ${existing.is_active}`);

    if (existing.role !== "admin") {
      console.log("\nUpgrading to admin role...");

      const { error: updateError } = await supabase
        .from("auth_whitelist")
        .update({ role: "admin", is_active: true })
        .eq("id", existing.id);

      if (updateError) {
        console.error("Error upgrading user:", updateError.message);
        process.exit(1);
      }

      console.log("User upgraded to admin successfully!");
    } else {
      console.log("\nUser is already an admin.");
    }

    process.exit(0);
  }

  // Add new admin user
  const { data, error } = await supabase
    .from("auth_whitelist")
    .insert({
      email: email.toLowerCase(),
      name,
      role: "admin",
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("Error adding admin:", error.message);
    process.exit(1);
  }

  console.log("\nAdmin user added successfully!");
  console.log(`  ID: ${data.id}`);
  console.log(`  Email: ${data.email}`);
  console.log(`  Role: ${data.role}`);
  console.log(`  Created: ${data.created_at}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
