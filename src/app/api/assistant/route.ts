// AI Assistant API Route - Powered by Gemini
import { NextRequest, NextResponse } from 'next/server';
import { chatModel } from '@/lib/gemini';

// Store conversation history per session
const conversationHistories = new Map<string, Array<{ role: string; parts: Array<{ text: string }> }>>();

export async function POST(req: NextRequest) {
  try {
    const { message, context, sessionId = 'default' } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get or create conversation history
    if (!conversationHistories.has(sessionId)) {
      conversationHistories.set(sessionId, [
        {
          role: "user",
          parts: [{ text: "You are Mary's Financial Assistant. You help manage her cannabis business, 8 entities, and 20 bank accounts. Keep answers short, professional, and helpful. You can help with expense tracking, P&L reports, cash position, inventory, and document search." }],
        },
        {
          role: "model",
          parts: [{ text: "Understood. I'm ready to assist Mary with her finances, P&L reports, cash management, and documents. How can I help today?" }],
        }
      ]);
    }

    const history = conversationHistories.get(sessionId)!;

    // Add context hint if provided
    const contextHint = context ? `[User is on ${context} page] ` : '';
    const fullMessage = contextHint + message;

    // Start a chat session with history
    const chat = chatModel.startChat({ history });

    // Send message and get response
    const result = await chat.sendMessage(fullMessage);
    const response = result.response;
    const text = response.text();

    // Update history with this exchange
    history.push({ role: "user", parts: [{ text: fullMessage }] });
    history.push({ role: "model", parts: [{ text }] });

    // Keep history manageable (last 20 exchanges)
    if (history.length > 42) { // 2 system + 20 exchanges * 2
      history.splice(2, 2); // Remove oldest exchange (keep system prompt)
    }

    return NextResponse.json({
      role: 'assistant',
      content: text,
      reply: text
    });

  } catch (error) {
    console.error('Assistant API Error:', error);
    
    // Return actual error in development
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
