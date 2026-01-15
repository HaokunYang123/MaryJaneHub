// AI Orchestrator - The "Brain" that processes Mary's requests
// Uses Gemini 1.5 Pro with function calling

import { GoogleGenerativeAI, Content, FunctionDeclaration } from "@google/generative-ai";
import { AI_FUNCTIONS, WRITE_OPERATIONS, PROPERTY_KEYWORDS } from "./functions";
import { executeFunction } from "./executor";

const SYSTEM_PROMPT = `You are Mary's personal financial assistant. Mary is a 70-year-old entrepreneur who owns 8 businesses including cannabis dispensaries in Arizona and rental properties.

YOUR PERSONALITY:
- Warm, patient, and conversational
- Use simple, clear language (avoid jargon)
- Be concise but thorough
- Address her as "Mary" occasionally
- Sound like a trusted assistant, not a robot

YOUR CAPABILITIES:
You have access to all of Mary's financial data:
- 20 bank accounts (real-time balances)
- QuickBooks accounting (transactions, bills, invoices, reports)
- Google Drive documents (leases, contracts, invoices)
- Property management data (4 rental properties)
- Cannabis dispensary data (inventory, sales)

CRITICAL RULES:
1. ALWAYS CONFIRM before taking any action that creates, modifies, or deletes data
2. When recording expenses, ASK which property or business it's for if unclear
3. When amounts seem unusual, double-check with Mary
4. If you're not sure about something, ask for clarification
5. After completing an action, confirm what was done

CONFIRMATION EXAMPLES:
- "I'll record $400 for AC repair. Is this for one of your rental properties? Which one?"
- "Got it - $400 AC repair for the Phoenix property, categorized as Repairs & Maintenance. Should I save this?"
- "Done! I've recorded the $400 expense. Anything else?"

HANDLING AMBIGUITY:
- If Mary says "paid the rent" - ask which property
- If Mary says "inventory expense" - clarify which dispensary
- If the amount seems high/low for the category - verify

CONVERSATION CONTEXT:
Remember the conversation context. If Mary says "yes" or "that one", refer to what was just discussed.`;

interface PendingAction {
  functionName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  functionArgs: Record<string, any>;
  needsPropertyInfo?: boolean;
}

interface OrchestratorResponse {
  text: string;
  action: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  pendingAction?: PendingAction;
}

export class AIOrchestrator {
  private conversationHistory: Content[] = [];
  private pendingAction: PendingAction | null = null;
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

  async processInput(userMessage: string, pageContext?: string): Promise<OrchestratorResponse> {
    // Add context hint if provided
    const contextHint = pageContext ? `[User is viewing the ${pageContext} page] ` : '';
    const fullMessage = contextHint + userMessage;

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

    try {
      // Check API key before making request
      if (!this.apiKey) {
        console.error('CRITICAL: No Gemini API key configured');
        return { 
          text: "I'm not properly configured yet. Please add your GEMINI_API_KEY to the .env file.", 
          action: 'error' 
        };
      }

      // Get Gemini model with function calling
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SYSTEM_PROMPT,
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
        if (this.requiresConfirmation(functionName)) {
          return await this.requestConfirmation(functionName, functionArgs);
        } else {
          // Execute read-only functions immediately
          return await this.executeAndRespond(functionName, functionArgs);
        }
      }

      // Just a text response
      const responseText = response.text();
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
          confirmationText = `I'll record $${functionArgs.amount} for ${functionArgs.vendor_or_description}. Is this for one of your rental properties? If so, which one? (Phoenix, Tempe, Mesa, or Scottsdale)`;
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

    // Try to match property
    const properties = [
      { id: 'prop_phoenix', name: 'Phoenix', aliases: ['phoenix', 'camelback'] },
      { id: 'prop_tempe', name: 'Tempe', aliases: ['tempe', 'mill ave'] },
      { id: 'prop_mesa', name: 'Mesa', aliases: ['mesa', 'main st'] },
      { id: 'prop_scottsdale', name: 'Scottsdale', aliases: ['scottsdale'] }
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

    const retryText = "I didn't catch which property. Could you say Phoenix, Tempe, Mesa, or Scottsdale? Or say 'no' if it's not for a property.";
    
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
      case 'record_expense':
        return `Done! I've recorded the $${args.amount} expense for ${args.vendor_or_description}${result.expense?.property ? ` under ${result.expense.property}` : ''}. Your total ${args.category_suggestion || ''} expenses this month are now $${result.categoryTotal?.toLocaleString() || args.amount}. Anything else?`;

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
          return `I didn't find any documents matching "${args.query}". Try a different search term?`;
        }
        return `I found ${result.resultCount} document${result.resultCount > 1 ? 's' : ''} matching "${args.query}". The most relevant is "${result.results[0]?.name}". Want me to open it?`;

      case 'get_outstanding_invoices':
        return `You have ${result.count} outstanding invoice${result.count !== 1 ? 's' : ''} totaling $${result.totalOutstanding?.toLocaleString()}. ${result.invoices?.filter((i: { daysOverdue: number }) => i.daysOverdue > 0).length > 0 ? 'Some are overdue - want me to list them?' : ''}`;

      case 'get_outstanding_bills':
        return `You have ${result.count} bill${result.count !== 1 ? 's' : ''} to pay, totaling $${result.totalOwed?.toLocaleString()}. ${result.bills?.[0] ? `The next one due is ${result.bills[0].vendor} for $${result.bills[0].amount?.toLocaleString()}.` : ''}`;

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

      default:
        return `Done! ${result.message || 'Action completed successfully.'}`;
    }
  }

  clearHistory(): void {
    this.conversationHistory = [];
    this.pendingAction = null;
  }
}

// Export singleton instance
export const aiOrchestrator = new AIOrchestrator();
