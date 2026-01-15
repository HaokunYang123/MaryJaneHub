// src/app/api/assistant/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { chatModel } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Start a chat session
    const chat = chatModel.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: "You are Mary's Financial Assistant. You help manage her cannabis business, 8 entities, and 20 bank accounts. Keep answers short, professional, and helpful." }],
        },
        {
          role: "model",
          parts: [{ text: "Understood. I am ready to assist Mary with her finances, P&L, and documents." }],
        }
      ],
    });

    const result = await chat.sendMessage(message);
    const response = result.response;
    const text = response.text();

    return NextResponse.json({ 
      role: 'assistant', 
      content: text,
      reply: text // Also include as 'reply' for compatibility with the UI
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
