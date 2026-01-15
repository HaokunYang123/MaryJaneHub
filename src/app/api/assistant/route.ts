// AI Assistant API Route - Powered by Gemini with Function Calling
import { NextRequest, NextResponse } from 'next/server';
import { AIOrchestrator } from '@/lib/ai/orchestrator';

// Create orchestrator per request (in production, use session-based instances)
const orchestrators = new Map<string, AIOrchestrator>();

function getOrchestrator(sessionId: string): AIOrchestrator {
  if (!orchestrators.has(sessionId)) {
    orchestrators.set(sessionId, new AIOrchestrator());
  }
  return orchestrators.get(sessionId)!;
}

export async function POST(req: NextRequest) {
  try {
    const { message, context, sessionId = 'default' } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get or create orchestrator for this session
    const orchestrator = getOrchestrator(sessionId);

    // Process the message through the AI orchestrator
    const result = await orchestrator.processInput(message, context);

    return NextResponse.json({
      role: 'assistant',
      content: result.text,
      reply: result.text, // Alias for compatibility
      action: result.action,
      result: result.result,
      pendingAction: result.pendingAction
    });

  } catch (error) {
    console.error('Assistant API Error:', error);
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
    
    if (orchestrators.has(sessionId)) {
      orchestrators.get(sessionId)!.clearHistory();
    }

    return NextResponse.json({ success: true, message: 'Conversation cleared' });
  } catch {
    return NextResponse.json({ error: 'Failed to clear conversation' }, { status: 500 });
  }
}
