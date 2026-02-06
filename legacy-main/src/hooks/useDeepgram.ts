'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseDeepgramReturn } from '@/types/voice';

// Simple STT using Web Speech API (works without external API)
export function useDeepgram(onFinalTranscript?: (text: string) => void): UseDeepgramReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const onFinalTranscriptRef = useRef(onFinalTranscript);

  // Keep callback ref in sync
  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  // Check browser support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      setIsSupported(!!SpeechRecognition);
    }
  }, []);

  const startListening = useCallback(async () => {
    console.log('[STT] Starting Web Speech API...');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition not supported');
      return;
    }

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[STT] Microphone permission granted');
    } catch (err) {
      console.error('[STT] Microphone permission denied:', err);
      setError('Microphone permission denied');
      return;
    }

    setError(null);
    setInterimTranscript('');
    finalTranscriptRef.current = '';
    setTranscript('');

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('[STT] Recognition started');
      setIsListening(true);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + final.trim();
        setTranscript(finalTranscriptRef.current);
        console.log('[STT] Final:', finalTranscriptRef.current);
      }
      setInterimTranscript(interim);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('[STT] Error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Speech error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log('[STT] Recognition ended');
      setIsListening(false);

      // Trigger callback with final transcript
      if (finalTranscriptRef.current.trim() && onFinalTranscriptRef.current) {
        console.log('[STT] Calling callback with:', finalTranscriptRef.current);
        onFinalTranscriptRef.current(finalTranscriptRef.current.trim());
      }
    };

    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    console.log('[STT] Stopping...');
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    finalTranscriptRef.current = '';
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}

// Type declarations for Web Speech API
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}
