// AI Orchestrator - The "Brain" that processes Mary's requests
// Uses Gemini 2.5 Pro with function calling + Personal Profile (Jarvis Mode)

import { GoogleGenerativeAI, Content, FunctionDeclaration } from "@google/generative-ai";
import { AI_FUNCTIONS, WRITE_OPERATIONS, PROPERTY_KEYWORDS } from "./functions";
import { executeFunction } from "./executor";
import { profileManager } from "./profile-manager";

const SYSTEM_PROMPT = `=== IDENTITY ===
You are Jane, Mary's personal executive assistant. You are warm, sharp, and genuinely care about making her day easier. You've worked with Mary for years and know her well. You address her as "ma'am" naturally, never stiffly.

=== PERSONALITY ===
Friendly but professional. Calm and reassuring. Subtly witty when the moment calls for it. You anticipate needs. You remember details. You never waste her time.

=== MARY'S CONTEXT ===
Mary is 70 years old. She runs 8 businesses: cannabis dispensaries and real estate properties. She is busy, smart, and values efficiency. She appreciates being treated like a person, not a task list. She prefers directness over corporate speak.

=== GREETINGS - DO NOT LEAD WITH DEBT ===
When Mary greets you (hello, hi, good morning, hey Jane, etc.):
- Greet her warmly FIRST as a person, not as a task list
- DO NOT immediately dump bills or overdue amounts on her
- Let her set the pace - she'll ask when she's ready

Good greeting examples:
- "Good morning, ma'am. A few things on your plate today, but nothing we can't handle. Ready when you are."
- "Morning, ma'am. Hope you slept well. Whenever you're ready, I've got your day lined up."
- "Good morning, Mary. Coffee first, or shall we dive in?"
- "Hey, ma'am. Good to see you. What would you like to tackle first?"

BAD greeting (NEVER do this):
- "Good morning, Mary! You have 4 overdue bills totaling $848. How can I help?"
- Leading with debt makes you sound like a bill collector, not a trusted assistant.

Only surface urgent financial items AFTER Mary asks "what's on my plate?" or similar.

=== CONVERSATION CONTEXT - CRITICAL ===
You MUST maintain context across the entire conversation. Every message you receive includes the full conversation history.

1. NEVER lose track of what was just discussed
2. If Mary asks a follow-up, answer using info you already provided
3. If you listed 5 bills and she asks "which one isn't overdue?" - give the SPECIFIC bill name
4. If you're mid-task and she asks about it, reference the current task

NEVER respond with generic fallbacks mid-conversation:
- "What's on your mind?" - BANNED (unless truly no prior context)
- "How can I help you today?" - BANNED mid-conversation
- "Could you clarify?" without referencing what you were discussing - BANNED

If confused, ask a SPECIFIC clarifying question:
- Good: "Just to confirm - you want me to change the category from Marketing to something else?"
- Bad: "What would you like me to help with?"

=== HANDLING CORRECTIONS (NOT CANCELLATIONS) ===
When Mary says "not X" or "change X" or "wrong X", she's CORRECTING a field, not canceling the entire action.

Examples:
- "not marketing" → Change the category field, keep everything else
- "wrong amount" → Ask for the correct amount, don't cancel
- "actually John Smith" → Update the name, continue with the task
- "make it $500 instead" → Update amount to $500, confirm and continue

NEVER interpret a correction as "cancel everything and start over."
Just update the specific field she mentioned and confirm: "Got it, changed to [new value]. Everything else still good?"

=== RESPONSE STYLE ===
Keep responses conversational and warm. Use contractions. Be concise but never curt. Lead with what matters most. If Mary sounds tired or stressed, acknowledge it with care. Never lecture. Never over-explain. One or two sentences is often enough.

=== DATA TERMINOLOGY ===
When discussing bills: "Overdue" means past due date. "Due today" or "Due soon" means not yet overdue. Always distinguish clearly.
When discussing money: Use plain numbers. Say "$848" not "eight hundred and forty eight dollars."
When listing items: Keep it scannable. Use names and key details. Don't pad with unnecessary words.

=== FOLLOW-UP REASONING ===
When you list items with mixed statuses and Mary asks about a subset:

Example scenario:
Jane: "You have 5 bills: 4 overdue, 1 due today."
Mary: "Which one isn't overdue?"
Jane: "Diego's Road Warrior Bodyshop - the $755 is due today, so technically not overdue yet. The other four are past due."

ALWAYS:
- Give the specific item NAME
- Explain WHY it fits her question
- Reference the context naturally

=== EXAMPLE INTERACTIONS ===
Mary: "hello"
Jane: "Good morning, ma'am. Ready when you are."

Mary: "What's on my plate today?"
Jane: "A few bills need attention - 4 overdue totaling about $850. Nothing urgent beyond that. Want me to run through them?"

Mary: "I'm exhausted."
Jane: "Long week. Your financials are in good shape, nothing urgent. Maybe tackle the small stuff tomorrow."

Mary: "Which bill isn't overdue?"
Jane: "Diego's Road Warrior Bodyshop. The $755 is due today, so not overdue yet. The other four are past due."

Mary: "not marketing, change it to inventory"
Jane: "Got it, changed the category to Inventory. Everything else still look right?"

=== NEVER DO THIS ===
- Never sound like a chatbot
- Never say "I'd be happy to assist you with that"
- Never say "Is there anything else I can help you with?"
- Never say "What's on your mind?" when Mary just asked you something
- Never lead with debt/bills when Mary just says hello
- Never forget prior context in the same conversation
- Never interpret corrections as cancellations
- Never over-explain your reasoning
- Never treat Mary like a user. She's a person.

=== CRITICAL: DATA ACCURACY ===
You must NEVER make up financial data:
- Don't fabricate bill amounts, vendor names, or counts
- Don't guess at account balances or cash positions
- If you need data, call the appropriate function first
- If data isn't available, say so naturally: "Let me check on that"
- Only report numbers that come directly from function results

=== WHEN ASKED ABOUT BILLS/FINANCES ===
Call the appropriate function (get_outstanding_bills, get_action_items, etc.), then report conversationally. If something's overdue, mention it. If everything's fine, let her know she's in good shape.

=== FOLLOW-UP HANDLING ===
When Mary says "yes", "list them", "show me", "which one", or any follow-up:
- Reference the specific topic you were just discussing
- If you listed bills and she asks "which one" - give the specific answer
- NEVER repeat your summary - show the actual details
- NEVER reset to generic "how can I help"

=== YOUR CAPABILITIES ===
You have access to all of Mary's financial data:
- QuickBooks accounting (transactions, bills, invoices, reports)
- Google Drive documents (leases, contracts, invoices)
- Property management data (rental properties in CA)
- Cannabis dispensary data (inventory, sales)
- Invoice Generation: You can create professional PDF invoices

=== INVOICE CREATION ===
When Mary asks to create, make, or bill someone an invoice:
- If she gave the name, amount, and description - generate immediately
- Only ask for missing CRITICAL info:
  - Who to bill (required)
  - How much (required)
  - What property (if it sounds property-related: repairs, rent, tenant, pool, maintenance, etc.)
- Don't ask "should I create a PDF?" - of course she wants a PDF
- After generating, show the preview link and ask if it looks good

PROPERTY DETECTION:
If the invoice sounds property-related (repairs, pool, maintenance, tenant, rent, HVAC, plumbing, landscaping, etc.) and Mary didn't specify which property, ASK:
"Which property is this for? (e.g., Riverside, Phoenix, Tucson)"

Example - property-related, no location given:
Mary: "Invoice Max Chung $5000 for swimming pool"
Jane: "Got it - $5,000 to Max Chung for a swimming pool. Which property is this for?"
Mary: "Tucson"
Jane: [calls generate_professional_invoice with property="Tucson"]

Example - not property-related:
Mary: "Invoice John Smith $500 for consulting"
Jane: [calls generate_professional_invoice immediately - no property needed]

=== GOOGLE DRIVE LINKS ===
Every document search result MUST include the clickable Google Drive link.
Format: [View in Drive](https://drive.google.com/file/d/xxx/view)

=== GENERAL CONVERSATION ===
You can discuss ANYTHING - real estate advice, market trends, business strategy, or just chat. You're not limited to financial functions. When Mary asks a general question, just answer naturally.`;

interface PendingAction {
  functionName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functionArgs: Record<string, any>;
  needsPropertyInfo?: boolean;
}

interface PendingInvoice {
  invoiceNumber: string;
  documentId: string | null;
  customerName: string;
  amount: number;
  description: string;
  property: string | null;
  pdfDataUrl: string;
  awaitingChanges?: boolean;
}

interface OrchestratorResponse {
  text: string;
  action: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  pendingAction?: PendingAction;
}

// Store last search results for follow-up questions
interface SearchResult {
  name: string;
  amount: number;
  category: string;
  driveLink: string | null;
  description: string;
}

export class AIOrchestrator {
  private conversationHistory: Content[] = [];
  private pendingAction: PendingAction | null = null;
  private lastSearchResults: SearchResult[] = [];
  private pendingInvoice: PendingInvoice | null = null;
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  constructor() {
    // Check for API key - support both variable names
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('WARNING: No Gemini API key found. Set GEMINI_API_KEY in your .env file.');
    }
    
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  // Convert our function definitions to Gemini tool format
  private getGeminiTools(): FunctionDeclaration[] {
    return AI_FUNCTIONS.map(f => ({
      name: f.name,
      description: f.description,
      parameters: f.parameters as FunctionDeclaration['parameters']
    }));
  }

  async processInput(userMessage: string, _pageContext?: string): Promise<OrchestratorResponse> {
    // Don't add page context - Jane should be a general assistant, not page-specific
    // User can ask about anything regardless of what tab they're on
    const fullMessage = userMessage;

    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      parts: [{ text: fullMessage }]
    });

    // Check if this is a confirmation of pending action
    if (this.pendingAction && this.isConfirmation(userMessage)) {
      return await this.executePendingAction();
    }

    if (this.pendingAction && this.isDenial(userMessage)) {
      this.pendingAction = null;
      const response = "No problem, I won't do that. What else can I help with?";
      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: response }]
      });
      return { text: response, action: null };
    }

    // Check if this is property info for a pending action
    if (this.pendingAction?.needsPropertyInfo) {
      return await this.handlePropertySelection(userMessage);
    }

    // Check if user is asking about a specific document from last search
    const docSelection = this.checkForDocumentSelection(userMessage);
    if (docSelection) {
      return docSelection;
    }

    // Check if user is responding to a pending invoice review
    if (this.pendingInvoice?.awaitingChanges) {
      const invoiceResponse = await this.handleInvoiceReview(userMessage);
      if (invoiceResponse) {
        return invoiceResponse;
      }
    }

    try {
      // Check API key before making request
      if (!this.apiKey) {
        console.error('CRITICAL: No Gemini API key configured');
        return {
          text: "I'm not properly configured yet. Please add your GEMINI_API_KEY to the .env file.",
          action: 'error'
        };
      }

      // === JARVIS MODE: Load Mary's personal profile ===
      let profileContext = '';
      try {
        profileContext = await profileManager.getProfileSummary();
        // Track what Mary is asking about
        await profileManager.trackTopic(userMessage.slice(0, 100));
      } catch (profileError) {
        console.error('Failed to load profile:', profileError);
        profileContext = '(Profile not available)';
      }

      // Combine system prompt with personal profile
      const fullSystemPrompt = `${SYSTEM_PROMPT}

${profileContext}

IMPORTANT - USE THIS PROFILE:
- Reference Mary's stored memories and preferences in your responses
- When Mary shares new info about herself, use remember_fact to save it
- When she mentions people, use add_contact to save them
- Proactively learn and remember things about Mary
- Be like Jarvis - anticipate needs based on what you know about her`;

      // Get Gemini model with function calling
      // Use GEMINI_MODEL env var to switch models - Jane uses 2.5 Pro for best reasoning
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: fullSystemPrompt,
        tools: [{ functionDeclarations: this.getGeminiTools() }]
      });

      // Start chat with history
      const chat = model.startChat({
        history: this.conversationHistory.slice(0, -1) // Exclude current message
      });

      // Send message and get response
      const result = await chat.sendMessage(fullMessage);
      const response = result.response;

      // Check for function calls
      const functionCalls = response.functionCalls();
      
      if (functionCalls && functionCalls.length > 0) {
        const functionCall = functionCalls[0];
        const functionName = functionCall.name;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const functionArgs = functionCall.args as Record<string, any>;

        // Check if this is a write operation that needs confirmation
        // Note: generate_professional_invoice executes immediately (has its own review flow)
        if (functionName === 'generate_professional_invoice') {
          return await this.executeAndRespond(functionName, functionArgs);
        } else if (this.requiresConfirmation(functionName)) {
          return await this.requestConfirmation(functionName, functionArgs);
        } else {
          // Execute read-only functions immediately
          return await this.executeAndRespond(functionName, functionArgs);
        }
      }

      // Just a text response
      let responseText = '';
      try {
        responseText = response.text();
      } catch {
        // Model may have blocked or returned empty
        responseText = '';
      }

      // Fallback for empty responses - reference context if available
      if (!responseText || responseText.trim() === '') {
        // Check if we have conversation context
        if (this.conversationHistory.length > 2) {
          responseText = "Sorry, I lost my train of thought there. What were we working on?";
        } else {
          responseText = "Good morning, ma'am. Ready when you are.";
        }
      }

      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: responseText }]
      });

      return { text: responseText, action: null };
    } catch (error) {
      // ENHANCED LOGGING - Log full error details
      console.error('CRITICAL AI ORCHESTRATOR ERROR:', error);
      
      // Get detailed error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // In development, return the actual error for debugging
      if (process.env.NODE_ENV === 'development') {
        return { 
          text: `Debug Error: ${errorMessage}`, 
          action: 'error' 
        };
      }
      
      // In production, return friendly message
      return { 
        text: "I'm having trouble processing that right now. Could you try again?", 
        action: 'error' 
      };
    }
  }

  private requiresConfirmation(functionName: string): boolean {
    return WRITE_OPERATIONS.includes(functionName);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requestConfirmation(functionName: string, functionArgs: Record<string, any>): Promise<OrchestratorResponse> {
    // Store pending action
    this.pendingAction = { functionName, functionArgs };

    let confirmationText = '';
    
    switch (functionName) {
      case 'record_expense':
        // Check if we need to ask about property
        if (!functionArgs.property_id && this.mightBePropertyRelated(functionArgs)) {
          confirmationText = `I'll record $${functionArgs.amount} for ${functionArgs.vendor_or_description}. Is this for one of your rental properties? If so, which one? (Riverside, Corona, Anaheim, or Ontario)`;
          this.pendingAction.needsPropertyInfo = true;
        } else {
          confirmationText = `Got it - $${functionArgs.amount} for ${functionArgs.vendor_or_description}, categorized as ${functionArgs.category_suggestion || 'Other'}. Should I save this?`;
        }
        break;
        
      case 'create_bill':
        confirmationText = `I'll create a bill for $${functionArgs.amount} from ${functionArgs.vendor_name}, due ${functionArgs.due_date || 'in 30 days'}. Does that look right?`;
        break;
        
      case 'create_invoice':
        confirmationText = `I'll create an invoice for $${functionArgs.amount} to ${functionArgs.customer_name} for "${functionArgs.description}". Should I create it?`;
        break;
        
      default:
        confirmationText = `I'll proceed with ${functionName}. Confirm?`;
    }

    this.conversationHistory.push({
      role: 'model',
      parts: [{ text: confirmationText }]
    });

    return {
      text: confirmationText,
      action: 'awaiting_confirmation',
      pendingAction: this.pendingAction
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mightBePropertyRelated(args: Record<string, any>): boolean {
    const desc = (args.vendor_or_description || '').toLowerCase();
    return PROPERTY_KEYWORDS.some(kw => desc.includes(kw));
  }

  private isConfirmation(message: string): boolean {
    const confirmWords = ['yes', 'yeah', 'yep', 'correct', 'right', 'do it', 'go ahead', 'confirm', 'save it', "that's right", 'ok', 'okay', 'sure', 'please'];
    const msgLower = message.toLowerCase().trim();
    return confirmWords.some(w => msgLower.includes(w) || msgLower === w);
  }

  private isDenial(message: string): boolean {
    const denyWords = ['no', 'nope', 'cancel', "don't", 'stop', 'wait', 'hold on', 'never mind', 'nevermind'];
    const msgLower = message.toLowerCase().trim();
    return denyWords.some(w => msgLower.includes(w));
  }

  private async handlePropertySelection(propertyInput: string): Promise<OrchestratorResponse> {
    if (!this.pendingAction) {
      return { text: "I lost track of what we were doing. Can you start over?", action: null };
    }

    // Try to match property (California locations)
    const properties = [
      { id: 'prop_riverside', name: 'Riverside', aliases: ['riverside', '8-unit', '8 unit', 'apartments'] },
      { id: 'prop_corona', name: 'Corona', aliases: ['corona', '12-unit', '12 unit'] },
      { id: 'prop_anaheim', name: 'Anaheim', aliases: ['anaheim', 'single family'] },
      { id: 'prop_ontario', name: 'Ontario', aliases: ['ontario', 'commercial', 'retail'] }
    ];

    const inputLower = propertyInput.toLowerCase();
    const matchedProperty = properties.find(p => 
      p.aliases.some(alias => inputLower.includes(alias))
    );

    if (matchedProperty) {
      this.pendingAction.functionArgs.property_id = matchedProperty.id;
      this.pendingAction.needsPropertyInfo = false;
      
      const confirmText = `Perfect, I'll put this under the ${matchedProperty.name} property. Recording $${this.pendingAction.functionArgs.amount} for ${this.pendingAction.functionArgs.vendor_or_description}. Confirm?`;
      
      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: confirmText }]
      });

      return {
        text: confirmText,
        action: 'awaiting_confirmation',
        pendingAction: this.pendingAction
      };
    }

    // Check if they said it's not property-related
    if (inputLower.includes('no') || inputLower.includes('not') || inputLower.includes("isn't")) {
      this.pendingAction.needsPropertyInfo = false;
      const confirmText = `Okay, not property-related. Recording $${this.pendingAction.functionArgs.amount} for ${this.pendingAction.functionArgs.vendor_or_description}. Should I save this?`;
      
      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: confirmText }]
      });

      return {
        text: confirmText,
        action: 'awaiting_confirmation',
        pendingAction: this.pendingAction
      };
    }

    const retryText = "I didn't catch which property. Could you say Riverside, Corona, Anaheim, or Ontario? Or say 'no' if it's not for a property.";
    
    this.conversationHistory.push({
      role: 'model',
      parts: [{ text: retryText }]
    });

    return {
      text: retryText,
      action: 'awaiting_property',
      pendingAction: this.pendingAction
    };
  }

  private async executePendingAction(): Promise<OrchestratorResponse> {
    if (!this.pendingAction) {
      return { text: "I don't have anything pending.", action: null };
    }

    const { functionName, functionArgs } = this.pendingAction;
    this.pendingAction = null;
    
    return await this.executeAndRespond(functionName, functionArgs);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async executeAndRespond(functionName: string, functionArgs: Record<string, any>): Promise<OrchestratorResponse> {
    try {
      // Execute the actual function
      const result = await executeFunction(functionName, functionArgs);

      // Store search results for follow-up questions
      if (functionName === 'search_documents' && result.results) {
        this.lastSearchResults = result.results.map((r: SearchResult) => ({
          name: r.name,
          amount: r.amount,
          category: r.category,
          driveLink: r.driveLink,
          description: r.description || ''
        }));
      }

      // Generate natural language response
      const responseText = this.generateFunctionResponse(functionName, functionArgs, result);

      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: responseText }]
      });

      return {
        text: responseText,
        action: functionName,
        result
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const errorText = `Sorry, I ran into an issue: ${errorMsg}. Want me to try again?`;

      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: errorText }]
      });

      return { text: errorText, action: 'error' };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateFunctionResponse(functionName: string, args: Record<string, any>, result: any): string {
    switch (functionName) {
      case 'record_expense': {
        const propertyInfo = result.expense?.property ? ` under **${result.expense.property}**` : '';
        const qbInfo = result.quickbooksSync ? '\n\n✅ Synced to QuickBooks' : '';
        const categoryInfo = result.categoryTotal ? `\n\nYour ${args.category_suggestion || 'total'} expenses this month: **$${result.categoryTotal.toLocaleString()}**` : '';

        return `Done! I've recorded **$${args.amount}** for ${args.vendor_or_description}${propertyInfo}.${qbInfo}${categoryInfo}\n\nAnything else?`;
      }

      case 'get_cash_position':
        return `Your total cash position is $${result.total?.toLocaleString()}. You have ${result.accounts?.length || 0} accounts across your businesses. Want me to break it down by account type?`;

      case 'get_account_balance':
        if (result.error) {
          return `I couldn't find an account matching "${args.account_name}". Could you be more specific?`;
        }
        return `The ${result.name} account has a balance of $${result.balance?.toLocaleString()}. ${result.balance < result.lowThreshold ? "That's below your threshold - might want to transfer some funds." : ''}`;

      case 'generate_pl_summary':
        return `For ${args.period.replace('_', ' ')}: Total revenue was $${result.totalRevenue?.toLocaleString()}, expenses were $${result.totalExpenses?.toLocaleString()}, giving you a net profit of $${result.netProfit?.toLocaleString()} (${result.profitMargin}% margin). Want the detailed breakdown?`;

      case 'get_spending_breakdown':
        const categories = Object.keys(result.breakdown || {});
        const topCategory = categories.length > 0 ? categories.reduce((a, b) => 
          (result.breakdown[a]?.total || 0) > (result.breakdown[b]?.total || 0) ? a : b
        ) : null;
        return `For ${args.period.replace('_', ' ')}, I found spending across ${categories.length} categories. ${topCategory ? `Your highest category is ${topCategory} at $${result.breakdown[topCategory]?.total?.toLocaleString()}.` : ''} Want me to list them all?`;

      case 'search_documents':
        if (result.resultCount === 0) {
          return `I didn't find any documents matching "${args.query}". Could you be more specific about what you're looking for?`;
        }

        // Single result - give detailed response
        if (result.resultCount === 1) {
          const doc = result.results[0];
          const amountStr = doc.amount > 0 ? ` for **$${doc.amount.toLocaleString()}**` : '';
          const linkStr = doc.driveLink
            ? `\n\n📄 [View in Google Drive](${doc.driveLink})`
            : '';
          return `Found it! Here's the **${doc.name}** invoice${amountStr}:${linkStr}\n\nIs this what you were looking for?`;
        }

        // Multiple results - list them concisely with clickable links
        const docList = result.results.map((doc: { name: string; amount: number; category: string; driveLink: string | null }, index: number) => {
          const num = index + 1;
          const amountStr = doc.amount > 0 ? `$${doc.amount.toLocaleString()}` : '';
          const linkStr = doc.driveLink
            ? ` → [View](${doc.driveLink})`
            : '';
          return `${num}. **${doc.name}** ${amountStr}${linkStr}`;
        }).join('\n');

        return `I found ${result.resultCount} documents matching "${args.query}":\n\n${docList}\n\nWhich one would you like to see?`;

      case 'get_outstanding_invoices': {
        if (result.count === 0) {
          return `No outstanding invoices - everyone's paid up!`;
        }

        // Always show the list with details
        let response = `Here are your ${result.count} outstanding invoices (total: $${result.totalOutstanding?.toLocaleString()}):\n\n`;

        result.invoices?.forEach((inv: { customer: string; amount: number; dueDate: string; daysOverdue: number }, idx: number) => {
          const status = inv.daysOverdue > 0
            ? `⚠️ ${inv.daysOverdue} days overdue`
            : inv.daysOverdue === 0
              ? '📅 Due today'
              : `Due ${inv.dueDate}`;
          response += `${idx + 1}. **${inv.customer}** - $${inv.amount.toLocaleString()} (${status})\n`;
        });

        const overdueCount = result.invoices?.filter((i: { daysOverdue: number }) => i.daysOverdue > 0).length || 0;
        if (overdueCount > 0) {
          response += `\n${overdueCount} of these are overdue. Want me to help you follow up?`;
        }

        return response;
      }

      case 'get_outstanding_bills': {
        // Use the message from the function result - never make up data
        if (result.error) {
          return result.message || 'I couldn\'t retrieve your bills right now. Please try again.';
        }

        if (result.count === 0) {
          return `No outstanding bills - you're all caught up!`;
        }

        // Show the actual list of bills with details
        let response = `Here are your ${result.count} outstanding bills (total: $${result.totalOwed?.toLocaleString()}):\n\n`;

        result.bills?.forEach((bill: { vendor: string; amount: number; dueDate: string; daysTilDue: number | null; isOverdue: boolean }, idx: number) => {
          let status = '';
          if (bill.isOverdue && bill.daysTilDue !== null) {
            status = `⚠️ ${Math.abs(bill.daysTilDue)} days overdue`;
          } else if (bill.daysTilDue === 0) {
            status = '📅 Due today';
          } else if (bill.daysTilDue !== null && bill.daysTilDue <= 7) {
            status = `Due in ${bill.daysTilDue} days`;
          } else {
            status = `Due ${bill.dueDate}`;
          }
          response += `${idx + 1}. **${bill.vendor}** - $${bill.amount.toLocaleString()} (${status})\n`;
        });

        if (result.overdueCount > 0) {
          response += `\n${result.overdueCount} of these are overdue. Want me to help prioritize?`;
        }

        return response;
      }

      case 'get_properties':
        return `You have ${result.count} properties: ${result.properties?.map((p: { name: string }) => p.name).join(', ')}. Need details on any of them?`;

      case 'get_dispensary_sales':
        return `${args.location || 'All locations'} ${args.period.replace('_', ' ')}: $${result.revenue?.toLocaleString()} in sales from ${result.transactions} transactions. Average ticket was $${result.avgTicket?.toFixed(2)}. Your top seller is ${result.topProducts?.[0]?.name}.`;

      case 'get_inventory_status':
        return `Inventory check: ${result.itemCount} items total, ${result.lowStockCount} running low. ${result.lowStockCount > 0 ? `Low stock items: ${result.inventory?.filter((i: { lowStock: boolean }) => i.lowStock).map((i: { product: string }) => i.product).join(', ')}.` : 'Everything looks well-stocked!'}`;

      case 'get_alerts':
        return `You have ${result.totalAlerts} alert${result.totalAlerts !== 1 ? 's' : ''}${result.highPriority > 0 ? ` (${result.highPriority} high priority)` : ''}. ${result.alerts?.[0]?.message || 'Everything looks good!'}`;

      case 'create_bill':
        return `Created! Bill for $${args.amount} from ${args.vendor_name} is now in your accounts payable. Need anything else?`;

      case 'create_invoice':
        return `Done! Invoice for $${args.amount} to ${args.customer_name} is ready. Want me to send it?`;

      case 'generate_professional_invoice':
        if (!result.success) {
          return `Sorry, I couldn't generate the invoice: ${result.error || 'Unknown error'}. Want me to try again?`;
        }

        // Store the pending invoice for review flow
        this.pendingInvoice = {
          invoiceNumber: result.invoiceNumber,
          documentId: result.documentId,
          customerName: result.customerName,
          amount: result.amount,
          description: result.description,
          property: result.property,
          pdfDataUrl: result.pdfDataUrl,
          awaitingChanges: true,
        };

        // Use proper preview URL instead of data URL
        const previewUrl = result.documentId
          ? `/api/invoice/preview/${result.documentId}`
          : result.pdfDataUrl;

        const propertyInfo = result.property ? ` for **${result.property}**` : '';
        const invoicePreview = `
I've created invoice **${result.invoiceNumber}**${propertyInfo}:

- **Customer:** ${result.customerName}
- **Amount:** $${result.amount.toLocaleString()}
- **Description:** ${result.description}
- **Due Date:** ${result.dueDate}
- **Category:** ${result.category}

📄 **[View Invoice PDF](${previewUrl})** (opens in new tab)

Would you like to make any changes? If it looks good, I can:
1. Save it to Google Drive
2. Send to QuickBooks

Just say "looks good" or tell me what to change!`;

        return invoicePreview.trim();

      // ===== JARVIS FUNCTIONS =====
      case 'get_daily_briefing': {
        // Warm greeting first - DON'T lead with debt
        const greeting = result.greeting || 'Good morning';

        // Vary the greeting naturally - don't dump bills on her
        const greetingOptions = [
          `${greeting}, ma'am. A few things on your plate today, but nothing we can't handle. Ready when you are.`,
          `${greeting}, ma'am. Hope you're doing well. Whenever you're ready, I've got everything lined up.`,
          `${greeting}, Mary. What would you like to tackle first?`,
          `Hey, ma'am. Good to see you. Ready when you are.`,
        ];

        // Pick a greeting based on time or random for variety
        const greetingIndex = Math.floor(Date.now() / 60000) % greetingOptions.length;
        let response = greetingOptions[greetingIndex];

        // Only hint at urgency if there's something truly urgent (overdue bills)
        // But even then, don't lead with it - just hint gently
        if (result.overdueCount !== undefined && result.overdueCount > 3) {
          response = `${greeting}, ma'am. A few things need attention when you have a moment. Ready when you are.`;
        }

        return response;
      }

      case 'get_action_items':
        // Use the pre-formatted action items directly
        return result.formattedMessage || result.message || 'Here are your action items for today.';

      case 'remember_fact':
        return result.message || `Got it! I'll remember that.`;

      case 'add_contact':
        return result.message || `Added to your contacts.`;

      case 'add_reminder':
        return result.message || `Reminder set!`;

      case 'add_event':
        return result.message || `Event added to your schedule.`;

      case 'get_reminders':
        if (result.reminderCount === 0 && result.eventCount === 0) {
          return `You're all clear! No pending reminders or upcoming events.`;
        }
        let reminderResponse = '';
        if (result.reminderCount > 0) {
          reminderResponse += `**Reminders (${result.reminderCount}):**\n`;
          result.reminders?.forEach((r: { content: string; dueDate?: string; priority: string }) => {
            reminderResponse += `• ${r.content}${r.dueDate ? ` (due: ${r.dueDate})` : ''} [${r.priority}]\n`;
          });
        }
        if (result.eventCount > 0) {
          reminderResponse += `\n**Upcoming Events (${result.eventCount}):**\n`;
          result.upcomingEvents?.forEach((e: { title: string; date: string; time?: string }) => {
            reminderResponse += `• ${e.title} on ${e.date}${e.time ? ` at ${e.time}` : ''}\n`;
          });
        }
        return reminderResponse.trim();

      case 'update_preference':
        return result.message || `Preference updated!`;

      default:
        return `Done! ${result.message || 'Action completed successfully.'}`;
    }
  }

  // Check if user is asking about a specific document from the last search
  private checkForDocumentSelection(message: string): OrchestratorResponse | null {
    if (this.lastSearchResults.length === 0) return null;

    const msgLower = message.toLowerCase().trim();

    // Patterns for selecting a document
    const firstPatterns = ['first', 'first one', '#1', 'number 1', 'the 1st', '1st one', 'that one', 'that file', 'show me', 'pull it up', 'pull up', 'open it', 'view it', 'the file', 'the document', 'yes'];
    const secondPatterns = ['second', 'second one', '#2', 'number 2', 'the 2nd', '2nd one'];
    const thirdPatterns = ['third', 'third one', '#3', 'number 3', 'the 3rd', '3rd one'];

    let selectedIndex = -1;

    if (firstPatterns.some(p => msgLower.includes(p))) {
      selectedIndex = 0;
    } else if (secondPatterns.some(p => msgLower.includes(p))) {
      selectedIndex = 1;
    } else if (thirdPatterns.some(p => msgLower.includes(p))) {
      selectedIndex = 2;
    }

    // Check if they're asking for a link specifically
    const wantsLink = msgLower.includes('link') || msgLower.includes('drive') || msgLower.includes('url') || msgLower.includes('open') || msgLower.includes('view') || msgLower.includes('pull');

    if (selectedIndex >= 0 && selectedIndex < this.lastSearchResults.length) {
      const doc = this.lastSearchResults[selectedIndex];
      const amountStr = doc.amount > 0 ? ` for **$${doc.amount.toLocaleString()}**` : '';
      const linkStr = doc.driveLink
        ? `\n\n📄 [View in Google Drive](${doc.driveLink})`
        : '';

      const responseText = `Here's the **${doc.name}** invoice${amountStr}:${linkStr}`;

      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: responseText }]
      });

      return { text: responseText, action: 'document_selection' };
    }

    // If they just want a link for the only result we have
    if (wantsLink && this.lastSearchResults.length === 1) {
      const doc = this.lastSearchResults[0];
      const linkStr = doc.driveLink
        ? `Here's the link for **${doc.name}**:\n\n📄 [View in Google Drive](${doc.driveLink})`
        : `Sorry, no Drive link is available for ${doc.name}.`;

      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: linkStr }]
      });

      return { text: linkStr, action: 'document_link' };
    }

    return null;
  }

  // Handle invoice review flow (approval, changes, save to Drive/QB)
  private async handleInvoiceReview(message: string): Promise<OrchestratorResponse | null> {
    if (!this.pendingInvoice) return null;

    const msgLower = message.toLowerCase().trim();

    // Check if user approves the invoice
    const approvalWords = ['looks good', 'perfect', 'great', 'approve', 'save it', 'yes', 'good', 'ok', 'okay', 'send it', 'confirm'];
    const isApproval = approvalWords.some(w => msgLower.includes(w));

    // Check if user wants specific actions
    const wantsDrive = msgLower.includes('drive') || msgLower.includes('save');
    const wantsQuickBooks = msgLower.includes('quickbooks') || msgLower.includes('qb');

    if (isApproval || wantsDrive || wantsQuickBooks) {
      // User approved - save to Supabase and optionally upload to Google Drive
      const invoice = this.pendingInvoice;
      this.pendingInvoice = null;

      let responseText = '';
      let driveFileId: string | null = null;

      // Upload to Google Drive if requested or if sending to QuickBooks
      if (wantsDrive || wantsQuickBooks) {
        try {
          const { uploadBufferToDrive } = await import('@/lib/google-drive');

          // Extract PDF buffer from data URL
          const base64Data = invoice.pdfDataUrl?.split(',')[1];
          if (base64Data) {
            const pdfBuffer = Buffer.from(base64Data, 'base64');
            const fileName = `Invoice_${invoice.invoiceNumber}_${invoice.customerName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

            // Determine folder path based on property or category
            const folderPath = invoice.property
              ? `All Files/Invoices/Properties/${invoice.property}`
              : 'All Files/Invoices/Generated';

            driveFileId = await uploadBufferToDrive(pdfBuffer, fileName, 'application/pdf', folderPath);
            console.log(`✅ Invoice uploaded to Google Drive: ${driveFileId}`);
          }
        } catch (driveErr) {
          console.error('⚠️ Failed to upload to Google Drive:', driveErr);
          // Continue - we'll still save to Supabase
        }
      }

      // Save to Supabase (or update if already exists)
      const { supabase } = await import('@/lib/supabase');

      if (!invoice.documentId) {
        // Initial save
        try {
          console.log('📄 Saving invoice to Supabase...');

          const { data: savedDoc, error: saveError } = await supabase
            .from('documents')
            .insert({
              drive_id: driveFileId || `generated_${invoice.invoiceNumber}`,
              content: `Invoice for ${invoice.customerName}: ${invoice.description}`,
              category: invoice.property ? `Properties - ${invoice.property}` : 'Properties',
              status: 'needs_review',
              is_duplicate: false,
              metadata: {
                type: 'generated_invoice',
                invoiceNumber: invoice.invoiceNumber,
                data: {
                  vendorName: invoice.customerName,
                  amount: invoice.amount,
                  date: new Date().toISOString().split('T')[0],
                  description: invoice.description,
                  property: invoice.property,
                },
                pdfDataUrl: invoice.pdfDataUrl,
                pdfBuffer: invoice.pdfDataUrl?.split(',')[1],
              },
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (saveError) {
            console.error('❌ Failed to save invoice:', saveError);
            responseText = `I had trouble saving the invoice. The PDF was generated but couldn't be saved. Would you like me to try again?`;
          } else {
            console.log(`✅ Invoice saved with ID: ${savedDoc?.id}`);
            if (driveFileId) {
              responseText = `Done! Invoice **${invoice.invoiceNumber}** has been saved to [Google Drive](https://drive.google.com/file/d/${driveFileId}/view) and is ready in [Files & Docs](/files) for review. Anything else?`;
            } else {
              responseText = `Done! Invoice **${invoice.invoiceNumber}** is now in [Files & Docs](/files) for review. Anything else?`;
            }
          }
        } catch (err) {
          console.error('Error saving invoice:', err);
          responseText = `I had trouble saving the invoice. Would you like me to try again?`;
        }
      } else {
        // Update existing record with drive_id if we uploaded
        if (driveFileId) {
          try {
            await supabase
              .from('documents')
              .update({ drive_id: driveFileId })
              .eq('id', invoice.documentId);

            responseText = `Done! Invoice **${invoice.invoiceNumber}** has been saved to [Google Drive](https://drive.google.com/file/d/${driveFileId}/view) and is ready in [Files & Docs](/files) for review. Anything else?`;
          } catch (err) {
            console.error('Error updating drive_id:', err);
            responseText = `Invoice **${invoice.invoiceNumber}** was uploaded to Google Drive but I couldn't update the record. It's still available in [Files & Docs](/files).`;
          }
        } else {
          responseText = `Done! Invoice **${invoice.invoiceNumber}** is now in [Files & Docs](/files) for review. Anything else?`;
        }
      }

      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: responseText }]
      });

      return {
        text: responseText,
        action: 'invoice_saved',
        result: { invoiceNumber: invoice.invoiceNumber, driveFileId }
      };
    }

    // Check if user wants to cancel
    const cancelWords = ['cancel', 'nevermind', 'never mind', 'forget it', 'no'];
    if (cancelWords.some(w => msgLower.includes(w))) {
      const invoiceNumber = this.pendingInvoice.invoiceNumber;
      this.pendingInvoice = null;

      const responseText = `No problem, I've cancelled invoice ${invoiceNumber}. What else can I help with?`;

      this.conversationHistory.push({
        role: 'model',
        parts: [{ text: responseText }]
      });

      return {
        text: responseText,
        action: 'invoice_cancelled'
      };
    }

    // If they're asking for changes, let the AI handle it naturally
    // (return null to let the regular processInput flow handle it)
    return null;
  }

  clearHistory(): void {
    this.conversationHistory = [];
    this.pendingAction = null;
    this.lastSearchResults = [];
    this.pendingInvoice = null;
  }
}

// Export singleton instance
export const aiOrchestrator = new AIOrchestrator();
