#!/usr/bin/env npx tsx
/**
 * Test script for Clarification Flow
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  handleAssistantQuery,
  createConversationContext,
  mergeSlots,
} from "../lib/assistant/clarify";
import type { Slots, ConversationContext } from "../lib/assistant/types";

async function testClarificationFlow() {
  console.log("═".repeat(70));
  console.log("Clarification Flow Test Suite");
  console.log("═".repeat(70) + "\n");

  // Test 1: Clarification flow with multiple matches
  console.log("━".repeat(70));
  console.log("Test 1: Clarification flow with multiple matches");
  console.log("━".repeat(70));

  let ctx = createConversationContext();

  // First query - should return clarification
  console.log("\n👤 User: \"what's the total on the Centerpointe invoice?\"");
  let response = await handleAssistantQuery("what's the total on the Centerpointe invoice?", ctx);
  ctx = response.context;

  console.log(`\n🤖 Assistant (${response.type}):`);
  console.log(`   ${response.message}`);
  if (response.candidates) {
    console.log(`   Candidates: ${response.candidates.length}`);
  }

  // Check if we have pending clarification
  if (ctx.pendingClarification) {
    console.log("\n   [Pending clarification state captured]");

    // Follow-up with amount specification
    console.log("\n👤 User: \"the $1690 one\"");
    response = await handleAssistantQuery("the $1690 one", ctx);
    ctx = response.context;

    console.log(`\n🤖 Assistant (${response.type}):`);
    console.log(`   ${response.message.slice(0, 200)}${response.message.length > 200 ? "..." : ""}`);
    if (response.qaResult) {
      console.log(`   Document: ${response.qaResult.documentUsed?.fileName}`);
      console.log(`   Citations verified: ${response.qaResult.allCitationsVerified}`);
    }
  }

  console.log("\n✅ Test 1 complete\n");

  // Test 2: Slot merging
  console.log("━".repeat(70));
  console.log("Test 2: Slot merging");
  console.log("━".repeat(70));

  const originalSlots: Slots = {
    documentType: "invoice",
    semanticText: "show me invoices",
  };

  const followUpSlots: Slots = {
    year: 2012,
    semanticText: "from 2012",
  };

  const merged = mergeSlots(originalSlots, followUpSlots);
  console.log("\n   Original slots:", { type: originalSlots.documentType, text: originalSlots.semanticText });
  console.log("   Follow-up slots:", { year: followUpSlots.year, text: followUpSlots.semanticText });
  console.log("   Merged slots:", { type: merged.documentType, year: merged.year, text: merged.semanticText });

  const expectedMerged = merged.documentType === "invoice" && merged.year === 2012;
  console.log(`\n   ✅ Slot merging ${expectedMerged ? "passed" : "failed"}`);

  console.log("\n✅ Test 2 complete\n");

  // Test 3: Direct selection ("the first one")
  console.log("━".repeat(70));
  console.log("Test 3: Direct selection");
  console.log("━".repeat(70));

  ctx = createConversationContext();

  console.log("\n👤 User: \"what's the date on the Centerpointe invoice?\"");
  response = await handleAssistantQuery("what's the date on the Centerpointe invoice?", ctx);
  ctx = response.context;

  console.log(`\n🤖 Assistant (${response.type}):`);
  console.log(`   ${response.message}`);

  if (ctx.pendingClarification && ctx.pendingClarification.candidates) {
    console.log(`   [${ctx.pendingClarification.candidates.length} candidates available]`);

    // Select first option
    console.log("\n👤 User: \"the first one\"");
    response = await handleAssistantQuery("the first one", ctx);
    ctx = response.context;

    console.log(`\n🤖 Assistant (${response.type}):`);
    console.log(`   ${response.message.slice(0, 200)}${response.message.length > 200 ? "..." : ""}`);
    if (response.qaResult) {
      console.log(`   Document: ${response.qaResult.documentUsed?.fileName}`);
    }
  }

  console.log("\n✅ Test 3 complete\n");

  // Test 4: Search needs clarification
  console.log("━".repeat(70));
  console.log("Test 4: Search needs clarification");
  console.log("━".repeat(70));

  ctx = createConversationContext();

  console.log("\n👤 User: \"invoice\"");
  response = await handleAssistantQuery("invoice", ctx);
  ctx = response.context;

  console.log(`\n🤖 Assistant (${response.type}):`);
  console.log(`   ${response.message}`);

  if (ctx.pendingClarification) {
    console.log("\n👤 User: \"from 2011\"");
    response = await handleAssistantQuery("from 2011", ctx);
    ctx = response.context;

    console.log(`\n🤖 Assistant (${response.type}):`);
    console.log(`   ${response.message}`);
  }

  console.log("\n✅ Test 4 complete\n");

  // Summary
  console.log("═".repeat(70));
  console.log("All clarification flow tests complete");
  console.log("═".repeat(70));
}

testClarificationFlow().catch(console.error);
