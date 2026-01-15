import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { createSupabaseRetriever } from '@langchain/community/retrievers/supabase';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { OpenAIEmbeddings } from '@langchain/openai';
import { supabase } from '@/lib/supabase';
import { DynamicTool } from '@langchain/core/tools';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

export const runtime = 'nodejs';

// Initialize LLM
const model = new ChatOpenAI({
  modelName: 'gpt-4-turbo-preview',
  temperature: 0,
});

// Tool A: Financial DB Query
const financialDbTool = new DynamicTool({
  name: 'financial_db',
  description: 'Use this to query financial data: transactions, expenses, PnL, ghost transactions. Input should be a specific question.',
  func: async (query: string) => {
    // In a real agent, we'd use a SQLChain here. For now, we mock basic intent mapping.
    if (query.toLowerCase().includes('ghost')) {
      const { data } = await supabase.from('transactions').select('*').eq('is_reconciled', false);
      return JSON.stringify(data);
    }
    if (query.toLowerCase().includes('pnl') || query.toLowerCase().includes('expenses')) {
      const { data } = await supabase.from('transactions').select('category, amount').eq('source', 'quickbooks');
      // Simple aggregation
      const summary = data?.reduce((acc: any, curr: any) => {
        acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
        return acc;
      }, {});
      return JSON.stringify(summary);
    }
    return "I couldn't find specific data for that query.";
  },
});

// Tool B: Document Search (RAG)
const vectorStore = new SupabaseVectorStore(new OpenAIEmbeddings(), {
  client: supabase,
  tableName: 'documents',
  queryName: 'match_documents',
});

const documentTool = new DynamicTool({
  name: 'document_search',
  description: 'Use this to find specific documents, contracts, invoices, or file contents.',
  func: async (query: string) => {
    const retriever = vectorStore.asRetriever(3);
    const docs = await retriever.getRelevantDocuments(query);
    return docs.map(d => d.pageContent).join('\n---\n');
  },
});

const tools = [financialDbTool, documentTool];

// Agent Prompt
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a financial AI assistant. You have access to a database of transactions and a library of documents. Use the available tools to answer the user's question accurately."],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
  new MessagesPlaceholder("agent_scratchpad"),
]);

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();

    const agent = await createOpenAIFunctionsAgent({
      llm: model,
      tools,
      prompt,
    });

    const executor = new AgentExecutor({
      agent,
      tools,
    });

    const chatHistory = (history || []).map((msg: any) => 
      msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
    );

    const result = await executor.invoke({
      input: message,
      chat_history: chatHistory,
    });

    return NextResponse.json({ reply: result.output });

  } catch (error: any) {
    console.error('AI Agent Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
