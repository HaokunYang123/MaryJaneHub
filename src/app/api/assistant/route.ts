import { NextRequest, NextResponse } from 'next/server';
import { aiOrchestrator } from '@/lib/ai/orchestrator';

export async function POST(req: NextRequest) {
  try {
    const { message, context: pageContext } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Use the AI Orchestrator with function calling (search_documents, etc.)
    const result = await aiOrchestrator.processInput(message, pageContext);

    return NextResponse.json({
      role: 'assistant',
      content: result.text,
      reply: result.text,
      action: result.action,
      result: result.result
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
export async function DELETE() {
  try {
    aiOrchestrator.clearHistory();
    return NextResponse.json({ success: true, message: 'Conversation cleared' });
  } catch {
    return NextResponse.json({ error: 'Failed to clear conversation' }, { status: 500 });
  }
}
