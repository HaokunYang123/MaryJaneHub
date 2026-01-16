'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseElevenLabsTTSReturn } from '@/types/voice';

export function useElevenLabsTTS(onSpeakingEnd?: () => void): UseElevenLabsTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const onSpeakingEndRef = useRef(onSpeakingEnd);
  const isMountedRef = useRef(true);

  useEffect(() => {
    onSpeakingEndRef.current = onSpeakingEnd;
  }, [onSpeakingEnd]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const speak = useCallback(async (text: string) => {
    console.log('[TTS] speak() called with text:', text.slice(0, 50) + '...');
    if (!text.trim()) {
      console.log('[TTS] Empty text, skipping');
      return;
    }

    // Stop any current audio
    if (audioRef.current) {
      console.log('[TTS] Stopping previous audio');
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    setError(null);
    setIsLoading(true);

    try {
      // Fetch audio from ElevenLabs API
      console.log('[TTS] Fetching from /api/voice/tts...');
      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      console.log('[TTS] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      // Get audio as blob
      const blob = await response.blob();
      console.log('[TTS] Got audio blob:', blob.size, 'bytes, type:', blob.type);

      if (blob.size < 100) {
        throw new Error('Audio blob too small');
      }

      // Check if still mounted
      if (!isMountedRef.current) {
        console.log('[TTS] Component unmounted, aborting');
        return;
      }

      // Create object URL and audio element
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio();
      audioRef.current = audio;
      audio.preload = 'auto';

      // Set up event handlers BEFORE setting src
      const cleanup = () => {
        if (audioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          audioUrlRef.current = null;
        }
      };

      audio.oncanplaythrough = () => {
        console.log('[TTS] Audio ready to play');
      };

      audio.onplay = () => {
        console.log('[TTS] Audio started playing');
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsSpeaking(true);
        }
      };

      audio.onended = () => {
        console.log('[TTS] Audio playback ended naturally');
        cleanup();
        if (isMountedRef.current) {
          setIsSpeaking(false);
          onSpeakingEndRef.current?.();
        }
      };

      audio.onerror = (e) => {
        const mediaError = audio.error;
        console.error('[TTS] Audio error:', {
          event: e,
          code: mediaError?.code,
          message: mediaError?.message,
        });
        cleanup();
        if (isMountedRef.current) {
          setIsSpeaking(false);
          setIsLoading(false);
          // Try browser fallback
          fallbackToBrowserTTS(text);
        }
      };

      // Now set the source and play
      audio.src = url;
      console.log('[TTS] Set audio src, attempting to play...');

      try {
        await audio.play();
        console.log('[TTS] audio.play() resolved successfully');
      } catch (playError) {
        console.error('[TTS] play() error:', playError);
        cleanup();

        // AbortError usually means user hasn't interacted with page yet
        if ((playError as Error).name === 'AbortError') {
          console.log('[TTS] AbortError - trying browser TTS fallback');
          fallbackToBrowserTTS(text);
        } else if ((playError as Error).name === 'NotAllowedError') {
          console.log('[TTS] NotAllowedError - autoplay blocked, trying browser TTS');
          fallbackToBrowserTTS(text);
        } else {
          throw playError;
        }
      }

    } catch (err) {
      console.error('[TTS] Error in speak():', err);
      if (isMountedRef.current) {
        setIsLoading(false);
        fallbackToBrowserTTS(text);
      }
    }

    function fallbackToBrowserTTS(text: string) {
      console.log('[TTS] Attempting browser speechSynthesis fallback');

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        console.error('[TTS] Browser speechSynthesis not available');
        setError('No TTS available');
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onstart = () => {
        console.log('[TTS] Browser TTS started');
        if (isMountedRef.current) {
          setIsSpeaking(true);
          setIsLoading(false);
          setError(null);
        }
      };

      utterance.onend = () => {
        console.log('[TTS] Browser TTS ended');
        if (isMountedRef.current) {
          setIsSpeaking(false);
          onSpeakingEndRef.current?.();
        }
      };

      utterance.onerror = (event) => {
        console.error('[TTS] Browser TTS error:', event.error);
        if (isMountedRef.current) {
          setIsSpeaking(false);
          setError('Speech synthesis failed');
        }
      };

      // Small delay to ensure any previous speech is fully cancelled
      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
          console.log('[TTS] Browser TTS speak() called');
        } catch (e) {
          console.error('[TTS] Browser TTS speak() threw:', e);
          if (isMountedRef.current) {
            setError('Speech synthesis not supported');
          }
        }
      }, 100);
    }
  }, []);

  const stop = useCallback(() => {
    console.log('[TTS] stop() called');

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
  }, []);

  return { isSpeaking, isLoading, error, speak, stop, pause, resume };
}
