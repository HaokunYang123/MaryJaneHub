import { NextResponse } from 'next/server';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export async function GET() {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      );
    }

    // Generate a single-use token for client-side STT WebSocket connection
    const response = await fetch(
      'https://api.elevenlabs.io/v1/speech-to-text/token',
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ttl_secs: 600, // 10 minutes validity
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs token generation error:', errorText);
      return NextResponse.json(
        { error: 'Failed to generate STT token' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ token: data.token });
  } catch (error) {
    console.error('STT token API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
