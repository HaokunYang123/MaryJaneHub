import { NextRequest, NextResponse } from 'next/server';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Default: Sarah

export async function POST(request: NextRequest) {
  try {
    console.log('[TTS API] Request received');
    console.log('[TTS API] API Key configured:', !!ELEVENLABS_API_KEY);
    console.log('[TTS API] Voice ID:', ELEVENLABS_VOICE_ID);

    if (!ELEVENLABS_API_KEY) {
      console.error('[TTS API] No API key configured');
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      );
    }

    const { text } = await request.json();
    console.log('[TTS API] Text to speak:', text?.slice(0, 50) + '...');

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Limit text length to prevent abuse
    const truncatedText = text.slice(0, 5000);

    console.log('[TTS API] Calling ElevenLabs API...');
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: truncatedText,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    console.log('[TTS API] ElevenLabs response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS API] ElevenLabs API error:', errorText);

      // Parse error for quota info
      let errorMessage = 'Failed to generate speech';
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail?.status === 'quota_exceeded') {
          errorMessage = 'ElevenLabs quota exceeded - using browser voice instead';
        } else if (errorJson.detail?.message) {
          errorMessage = errorJson.detail.message;
        }
      } catch {
        errorMessage = errorText;
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    console.log('[TTS API] Success! Streaming audio back...');
    // Stream the audio response
    const audioStream = response.body;
    if (!audioStream) {
      return NextResponse.json(
        { error: 'No audio stream received' },
        { status: 500 }
      );
    }

    return new NextResponse(audioStream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
