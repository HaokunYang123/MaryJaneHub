#!/usr/bin/env npx tsx
/**
 * Interactive Terminal Assistant
 *
 * A REPL-based assistant for querying documents with natural language.
 * Maintains conversation context across turns for multi-turn interactions.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as readline from "readline";
import { handleAssistantQuery, createConversationContext } from "../lib/assistant/clarify";
import type { ConversationContext, AssistantResponse, AssistantMode } from "../lib/assistant/types";

// ANSI colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

function printBanner() {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════╗
║  ${colors.bright}Document Assistant${colors.reset}${colors.cyan}                                       ║
║  Ask questions about your invoices, receipts & documents  ║
║  Type ${colors.yellow}/help${colors.cyan} for commands, ${colors.yellow}/exit${colors.cyan} to quit               ║
╚══════════════════════════════════════════════════════════╝${colors.reset}
`);
}

function printHelp() {
  console.log(`
${colors.bright}Commands:${colors.reset}
  ${colors.yellow}/clear${colors.reset}   - Reset conversation context (start fresh)
  ${colors.yellow}/history${colors.reset} - Show conversation history
  ${colors.yellow}/exit${colors.reset}    - Exit the assistant
  ${colors.yellow}/help${colors.reset}    - Show this help

${colors.bright}Example queries:${colors.reset}
  ${colors.dim}"find all FedEx invoices"${colors.reset}
  ${colors.dim}"what is the total for 2024 receipts"${colors.reset}
  ${colors.dim}"what's the total on the Centerpointe invoice?"${colors.reset}
  ${colors.dim}"show me invoices over $500"${colors.reset}
  ${colors.dim}"tell me about our relationship with Bega"${colors.reset}

${colors.bright}Multi-turn conversations:${colors.reset}
  When asked to clarify, you can respond with:
  - A number: ${colors.dim}"1"${colors.reset} or ${colors.dim}"option 2"${colors.reset}
  - More details: ${colors.dim}"the one from January"${colors.reset} or ${colors.dim}"the $500 one"${colors.reset}
`);
}

function printHistory(context: ConversationContext) {
  if (context.history.length === 0) {
    console.log(`\n${colors.dim}No conversation history.${colors.reset}\n`);
    return;
  }

  console.log(`\n${colors.bright}Conversation History:${colors.reset}`);
  for (const msg of context.history) {
    const prefix = msg.role === "user" ? `${colors.green}You:${colors.reset}` : `${colors.cyan}Assistant:${colors.reset}`;
    const content = msg.content.length > 100 ? msg.content.slice(0, 100) + "..." : msg.content;
    console.log(`  ${prefix} ${content}`);
  }
  console.log();
}

function formatResponse(response: AssistantResponse) {
  // Main message
  let output = `\n${colors.cyan}${colors.bright}Assistant:${colors.reset} `;

  // Format based on response type
  if (response.type === "clarification") {
    output += `${colors.yellow}${response.message}${colors.reset}`;
  } else if (response.type === "error") {
    output += `${colors.red}${response.message}${colors.reset}`;
  } else {
    output += response.message;
  }

  console.log(output);

  // Show citations if available
  if (response.qaResult?.citations && response.qaResult.citations.length > 0) {
    console.log(`\n${colors.dim}📎 Citations:${colors.reset}`);
    for (const cite of response.qaResult.citations) {
      const status = cite.verified ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      const excerpt = cite.excerpt.length > 60 ? cite.excerpt.slice(0, 60) + "..." : cite.excerpt;
      console.log(`   [${status}] "${excerpt}"`);
    }
  }

  // Show source document
  if (response.qaResult?.documentUsed) {
    console.log(`\n${colors.dim}📄 Source: ${response.qaResult.documentUsed.fileName}${colors.reset}`);
  }

  // Show confidence
  if (response.qaResult?.confidence) {
    const confidenceColor =
      response.qaResult.confidence === "high" ? colors.green :
      response.qaResult.confidence === "medium" ? colors.yellow : colors.red;
    console.log(`${colors.dim}   Confidence: ${confidenceColor}${response.qaResult.confidence}${colors.reset}`);
  }

  console.log();
}

async function main() {
  printBanner();
  const mode: AssistantMode = process.env.ASSISTANT_MODE === "lawyer" ? "lawyer" : "owner";

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let context: ConversationContext = createConversationContext();
  let isProcessing = false;

  const promptUser = () => {
    const promptText = context.pendingClarification
      ? `${colors.yellow}You (clarify): ${colors.reset}`
      : `${colors.green}You: ${colors.reset}`;

    rl.question(promptText, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        promptUser();
        return;
      }

      // Handle commands
      if (trimmed.startsWith("/")) {
        const cmd = trimmed.toLowerCase();

        if (cmd === "/exit" || cmd === "/quit" || cmd === "/q") {
          console.log(`\n${colors.cyan}Goodbye!${colors.reset}\n`);
          rl.close();
          process.exit(0);
        }

        if (cmd === "/clear" || cmd === "/reset") {
          context = createConversationContext();
          console.log(`\n${colors.green}Context cleared. Starting fresh.${colors.reset}\n`);
          promptUser();
          return;
        }

        if (cmd === "/help" || cmd === "/?") {
          printHelp();
          promptUser();
          return;
        }

        if (cmd === "/history" || cmd === "/h") {
          printHistory(context);
          promptUser();
          return;
        }

        console.log(`\n${colors.red}Unknown command: ${trimmed}${colors.reset}`);
        console.log(`${colors.dim}Type /help for available commands.${colors.reset}\n`);
        promptUser();
        return;
      }

      // Process query
      if (isProcessing) {
        console.log(`${colors.dim}Please wait...${colors.reset}`);
        promptUser();
        return;
      }

      isProcessing = true;
      console.log(`${colors.dim}Thinking...${colors.reset}`);

      try {
        const response = await handleAssistantQuery(trimmed, context, undefined, { mode });
        context = response.context;

        // Clear the "Thinking..." line and print response
        process.stdout.write("\x1b[1A\x1b[2K"); // Move up and clear line
        formatResponse(response);
      } catch (error) {
        console.error(`\n${colors.red}Error: ${error instanceof Error ? error.message : "Unknown error"}${colors.reset}\n`);
      }

      isProcessing = false;
      promptUser();
    });
  };

  // Handle Ctrl+C gracefully
  rl.on("close", () => {
    console.log(`\n${colors.cyan}Goodbye!${colors.reset}\n`);
    process.exit(0);
  });

  promptUser();
}

main().catch((error) => {
  console.error(`${colors.red}Failed to start assistant: ${error.message}${colors.reset}`);
  process.exit(1);
});
