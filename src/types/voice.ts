// Voice state for UI display
export type VoiceState = 'intro' | 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

// ElevenLabs Scribe STT configuration
export interface ElevenLabsSTTConfig {
  model: string;
  language: string;
  sample_rate: number;
  encoding: string;
}

// ElevenLabs configuration
export interface ElevenLabsConfig {
  voiceId: string;
  stability: number;
  similarity_boost: number;
  style: number;
  model_id: string;
}

// Transcript segment from STT
export interface TranscriptSegment {
  text: string;
  isFinal: boolean;
  timestamp: number;
}

// Voice mode conversation state
export interface VoiceModeState {
  isActive: boolean;
  state: VoiceState;
  transcript: string;
  interimTranscript: string;
  isMuted: boolean;
  error: string | null;
}

// Message for voice conversation
export interface VoiceMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ElevenLabs Scribe WebSocket message types
export interface ScribeResponse {
  type: 'transcript' | 'speech_started' | 'speech_ended' | 'error';
  transcript?: {
    text: string;
    is_final: boolean;
  };
  error?: {
    message: string;
    code: string;
  };
}

// Hook return types
export interface UseDeepgramReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  isSupported: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  resetTranscript: () => void;
}

export interface UseElevenLabsTTSReturn {
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

export interface UseVoiceModeReturn {
  isActive: boolean;
  state: VoiceState;
  transcript: string;
  interimTranscript: string;
  conversationHistory: VoiceMessage[];
  isMuted: boolean;
  error: string | null;
  janeText: string; // Current text Jane is speaking
  contextLabel: string; // Current context pill label
  start: () => Promise<void>;
  stop: () => void;
  toggleMute: () => void;
  interrupt: () => void;
}
