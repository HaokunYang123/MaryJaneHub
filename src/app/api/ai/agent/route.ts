import { NextRequest, NextResponse } from 'next/server';
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { supabase } from '@/lib/supabase';
import { DynamicTool } from '@langchain/core/tools';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

export const runtime = 'nodejs';

// 1. Initialize Gemini instead of OpenAI
const model = new ChatGoogleGenerativeAI({
  modelName: 'gemini-2.5-flash',
  temperature: 0,
  apiKey: process.env.GEMINI_API_KEY,
});

// Tool A: Financial DB Query
const financialDbTool = new DynamicTool({
  name: 'financial_db',
  description: 'Use this to query financial data: transactions, expenses, PnL, ghost transactions. Input should be a specific question.',
  func: async (query: string) => {
    try {
      if (query.toLowerCase().includes('ghost')) {
        const { data, error } = await supabase.from('transactions').select('*').eq('is_reconciled', false);
        if (error) return `Database error: ${error.message}`;
        return JSON.stringify(data || []);
      }
      if (query.toLowerCase().includes('pnl') || query.toLowerCase().includes('expenses')) {
        const { data, error } = await supabase.from('transactions').select('category, amount').eq('source', 'quickbooks');
        if (error) return `Database error: ${error.message}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summary = data?.reduce((acc: Record<string, number>, curr: any) => {
          acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
          return acc;
        }, {} as Record<string, number>);
        return JSON.stringify(summary || {});
      }
      return "I couldn't find specific data for that query.";
    } catch (error) {
      return `Error querying database: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
});

// Tool B: Document Search (RAG) - Switched to Gemini Embeddings
const vectorStore = new SupabaseVectorStore(
  new GoogleGenerativeAIEmbeddings({
    modelName: "embedding-001",
    apiKey: process.env.GEMINI_API_KEY
  }), 
  {
    client: supabase,
    tableName: 'documents',
    queryName: 'match_documents',
  }
);

const documentTool = new DynamicTool({
  name: 'document_search',
  description: 'Use this to find specific documents, contracts, invoices, or file contents.',
  func: async (query: string) => {
    try {
      const retriever = vectorStore.asRetriever(3);
      const docs = await retriever.invoke(query);
      if (docs.length === 0) return "No matching documents found.";
      return docs.map(d => d.pageContent).join('\n---\n');
    } catch (error) {
      return `Error searching documents: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
});

const tools = [financialDbTool, documentTool];

// Agent Prompt
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are Mary's financial AI assistant. You help manage her cannabis business, 8 entities, and 20 bank accounts. Use the available tools to answer questions accurately. Be warm, professional, and concise."],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
  new MessagesPlaceholder("agent_scratchpad"),
]);

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 2. Use createToolCallingAgent (Universal) instead of createOpenAIFunctionsAgent
    const agent = await createToolCallingAgent({
      llm: model,
      tools,
      prompt,
    });

    const executor = new AgentExecutor({
      agent,
      tools,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatHistory = (history || []).map((msg: any) => 
      msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
    );

    const result = await executor.invoke({
      input: message,
      chat_history: chatHistory,
    });

    return NextResponse.json({ reply: result.output });

  } catch (error) {
    console.error('AI Agent Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // In development, return detailed error
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ 
        error: errorMessage,
        reply: `Debug Error: ${errorMessage}`
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: 'Failed to process request',
      reply: "I'm having trouble with that request. Please try again."
    }, { status: 500 });
  }
}
