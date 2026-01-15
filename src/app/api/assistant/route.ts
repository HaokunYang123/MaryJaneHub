import { NextRequest, NextResponse } from 'next/server';
import { chatModel } from '@/lib/gemini';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase (The Memory)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Store conversation history per session
const conversationHistories = new Map<string, Array<{ role: string; parts: Array<{ text: string }> }>>();

export async function POST(req: NextRequest) {
  try {
    const { message, sessionId = 'default' } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 1. SEARCH: Look for relevant files in Supabase
    let context = "No specific files found in database.";
    
    try {
      const { data: docs } = await supabase
        .from('documents')
        .select('content, category, metadata, created_at')
        .limit(5);

      if (docs && docs.length > 0) {
        context = docs.map(d => {
          const meta = d.metadata as { data?: { vendorName?: string; amount?: number } } | null;
          return `[${d.category || 'Document'}${meta?.data?.vendorName ? ` from ${meta.data.vendorName}` : ''}${meta?.data?.amount ? ` - $${meta.data.amount}` : ''}]: ${(d.content || '').substring(0, 150)}...`;
        }).join('\n');
      }
    } catch (dbError) {
      console.log('Supabase not configured or error:', dbError);
      // Continue without database context
    }

    // 2. Get or create conversation history
    if (!conversationHistories.has(sessionId)) {
      conversationHistories.set(sessionId, [
        {
          role: "user",
          parts: [{ text: "You are Mary's Financial Assistant. You help manage her cannabis business, 8 entities, and 20 bank accounts. Keep answers short, professional, and helpful." }],
        },
        {
          role: "model",
          parts: [{ text: "Understood. I'm ready to assist Mary with her finances. How can I help?" }],
        }
      ]);
    }

    const history = conversationHistories.get(sessionId)!;

    // 3. Build prompt with context
    const enrichedMessage = `
USER QUESTION: "${message}"

RELEVANT FILES/DOCUMENTS:
${context}

Answer based on the files if relevant, otherwise help with the general question.`;

    // 4. Start chat session
    const chat = chatModel.startChat({ history });
    const result = await chat.sendMessage(enrichedMessage);
    const response = result.response.text();

    // 5. Update history
    history.push({ role: "user", parts: [{ text: message }] });
    history.push({ role: "model", parts: [{ text: response }] });

    // Keep history manageable
    if (history.length > 22) {
      history.splice(2, 2);
    }

    return NextResponse.json({ 
      role: 'assistant', 
      content: response,
      reply: response
    });

  } catch (error) {
    console.error('Assistant Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({ 
        error: errorMessage,
        content: `Debug Error: ${errorMessage}`,
        reply: `Debug Error: ${errorMessage}`
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: 'Failed to process message',
      content: "I'm having trouble right now. Please try again.",
      reply: "I'm having trouble right now. Please try again."
    }, { status: 500 });
  }
}

// Clear conversation history
export async function DELETE(req: NextRequest) {
  try {
    const { sessionId = 'default' } = await req.json();
    conversationHistories.delete(sessionId);
    return NextResponse.json({ success: true, message: 'Conversation cleared' });
  } catch {
    return NextResponse.json({ error: 'Failed to clear conversation' }, { status: 500 });
  }
}
