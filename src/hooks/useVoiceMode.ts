'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDeepgram } from './useDeepgram';
import { useElevenLabsTTS } from './useElevenLabsTTS';
import type { VoiceState, VoiceMessage, UseVoiceModeReturn } from '@/types/voice';

interface UseVoiceModeOptions {
  onMessage?: (userMessage: string, assistantResponse: string) => void;
  autoListen?: boolean;
}

// Get time-based greeting
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return "Good morning, ma'am. How can I help you today?";
  } else if (hour < 17) {
    return "Good afternoon, ma'am. What can I do for you?";
  } else {
    return "Good evening, ma'am. How can I assist you?";
  }
}

// Get context label based on conversation
function getContextLabel(state: VoiceState, lastMessage?: VoiceMessage): string {
  if (state === 'intro') return 'Jane AI';
  if (state === 'listening') return 'Listening...';
  if (state === 'processing') return 'Processing...';
  if (state === 'speaking' && lastMessage) {
    const content = lastMessage.content.toLowerCase();
    if (content.includes('bill') || content.includes('invoice')) return 'Discussing invoices';
    if (content.includes('expense') || content.includes('payment')) return 'Managing expenses';
    if (content.includes('cash') || content.includes('balance')) return 'Checking cash position';
    if (content.includes('report') || content.includes('p&l')) return 'Reviewing reports';
    if (content.includes('payroll')) return 'Discussing payroll';
    if (content.includes('inventory')) return 'Checking inventory';
    return 'Jane AI';
  }
  return 'Jane AI';
}

export function useVoiceMode(options: UseVoiceModeOptions = {}): UseVoiceModeReturn {
  const { onMessage, autoListen = true } = options;

  const [isActive, setIsActive] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [conversationHistory, setConversationHistory] = useState<VoiceMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [janeText, setJaneText] = useState('');
  const [contextLabel, setContextLabel] = useState('Jane AI');

  // Use refs to avoid stale closures
  const isProcessingRef = useRef(false);
  const shouldAutoListenRef = useRef(autoListen);
  const isActiveRef = useRef(false);
  const isMutedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  const sttRef = useRef<ReturnType<typeof useDeepgram> | null>(null);
  const ttsRef = useRef<ReturnType<typeof useElevenLabsTTS> | null>(null);

  // Keep refs in sync
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    shouldAutoListenRef.current = autoListen;
  }, [autoListen]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Handle when TTS finishes speaking
  const handleSpeakingEnd = useCallback(() => {
    console.log('[VoiceMode] TTS finished speaking');
    if (isActiveRef.current && shouldAutoListenRef.current && !isMutedRef.current) {
      // Auto-start listening after Jane finishes speaking
      setTimeout(() => {
        if (isActiveRef.current && !isMutedRef.current && sttRef.current) {
          console.log('[VoiceMode] Auto-starting listening');
          setState('listening');
          setContextLabel('Listening...');
          sttRef.current.startListening();
        }
      }, 300);
    } else {
      setState('idle');
    }
  }, []);

  // Handle final transcript from STT
  const handleFinalTranscript = useCallback(async (text: string) => {
    console.log('[VoiceMode] Final transcript received:', text);
    if (!text.trim() || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setState('processing');
    setContextLabel('Processing...');

    if (sttRef.current) {
      sttRef.current.resetTranscript();
    }

    // Add user message to history
    const userMessage: VoiceMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };
    setConversationHistory(prev => [...prev, userMessage]);

    try {
      // Call the assistant API
      console.log('[VoiceMode] Calling assistant API');
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          context: 'voice',
        }),
      });

      const data = await response.json();
      const assistantContent = data.content || data.reply || "I couldn't process that.";
      console.log('[VoiceMode] Assistant response:', assistantContent.slice(0, 50) + '...');

      // Add assistant message to history
      const assistantMessage: VoiceMessage = {
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
      };
      setConversationHistory(prev => [...prev, assistantMessage]);
      setContextLabel(getContextLabel('speaking', userMessage));

      // Notify callback
      onMessageRef.current?.(text.trim(), assistantContent);

      // Speak the response
      if (isActiveRef.current && !isMutedRef.current && ttsRef.current) {
        console.log('[VoiceMode] Starting TTS');
        setState('speaking');
        setJaneText(assistantContent);
        await ttsRef.current.speak(assistantContent);
      }
    } catch (error) {
      console.error('[VoiceMode] Error:', error);
      setVoiceError('Failed to get response');
      setState('error');

      // Recover after a delay
      setTimeout(() => {
        if (isActiveRef.current) {
          setVoiceError(null);
          setState('idle');
        }
      }, 2000);
    } finally {
      isProcessingRef.current = false;
    }
  }, []);

  // Initialize hooks
  const stt = useDeepgram(handleFinalTranscript);
  const tts = useElevenLabsTTS(handleSpeakingEnd);

  // Store refs for use in callbacks
  useEffect(() => {
    sttRef.current = stt;
  }, [stt]);

  useEffect(() => {
    ttsRef.current = tts;
  }, [tts]);

  // Start voice mode with intro
  const start = useCallback(async () => {
    console.log('[VoiceMode] Starting voice mode with intro');

    // IMPORTANT: Prime audio context immediately within user gesture
    // This allows audio to play later even after async operations
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        console.log('[VoiceMode] Audio context primed:', ctx.state);
        // Create and play a tiny silent buffer to fully unlock audio
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }
    } catch (e) {
      console.log('[VoiceMode] Could not prime audio context:', e);
    }

    setIsActive(true);
    isActiveRef.current = true;
    setVoiceError(null);
    setConversationHistory([]);
    setState('intro');
    setContextLabel('Jane AI');

    // Get and set the greeting
    const greeting = getGreeting();
    setJaneText(greeting);

    // Wait for background animation to fade in
    await new Promise(resolve => setTimeout(resolve, 500));

    // Play the intro greeting via TTS (if not muted)
    if (!isMutedRef.current && tts) {
      try {
        console.log('[VoiceMode] Playing intro greeting');
        await tts.speak(greeting);
        // handleSpeakingEnd will auto-start listening
      } catch (error) {
        console.error('[VoiceMode] Failed to play intro:', error);
        // Fall back to starting listening directly
        setState('listening');
        setContextLabel('Listening...');
        try {
          await stt.startListening();
          console.log('[VoiceMode] STT started successfully');
        } catch (sttError) {
          console.error('[VoiceMode] Failed to start STT:', sttError);
          setVoiceError('Failed to start microphone');
          setState('error');
        }
      }
    } else {
      // If muted, skip intro TTS and go to listening after a pause
      await new Promise(resolve => setTimeout(resolve, 2000));
      setState('listening');
      setContextLabel('Listening...');
      try {
        await stt.startListening();
      } catch (error) {
        console.error('[VoiceMode] Failed to start:', error);
        setVoiceError('Failed to start microphone');
        setState('error');
      }
    }
  }, [stt, tts]);

  // Stop voice mode
  const stop = useCallback(() => {
    console.log('[VoiceMode] Stopping voice mode');
    setIsActive(false);
    isActiveRef.current = false;
    setState('idle');
    setJaneText('');
    setContextLabel('Jane AI');
    stt.stopListening();
    stt.resetTranscript();
    tts.stop();
    isProcessingRef.current = false;
  }, [stt, tts]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      isMutedRef.current = newMuted;
      console.log('[VoiceMode] Mute toggled:', newMuted);
      if (newMuted) {
        tts.stop(); // Stop Jane if muting
      }
      return newMuted;
    });
  }, [tts]);

  // Interrupt Jane while speaking
  const interrupt = useCallback(() => {
    console.log('[VoiceMode] Interrupt triggered');
    if (tts.isSpeaking) {
      tts.stop();
      setState('listening');
      setContextLabel('Listening...');
      if (isActiveRef.current && !isMutedRef.current) {
        stt.startListening();
      }
    }
  }, [tts, stt]);

  // Update state based on STT and TTS states
  useEffect(() => {
    if (!isActive) return;

    if (tts.isSpeaking && state !== 'intro') {
      setState('speaking');
    } else if (tts.isLoading || isProcessingRef.current) {
      setState('processing');
      setContextLabel('Processing...');
    } else if (stt.isListening && state !== 'intro') {
      setState('listening');
      setContextLabel('Listening...');
    }
  }, [isActive, tts.isSpeaking, tts.isLoading, stt.isListening, state]);

  // Handle errors
  useEffect(() => {
    if (stt.error) {
      console.error('[VoiceMode] STT error:', stt.error);
      setVoiceError(stt.error);
    } else if (tts.error) {
      console.error('[VoiceMode] TTS error:', tts.error);
      setVoiceError(tts.error);
    }
  }, [stt.error, tts.error]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stt.stopListening();
      tts.stop();
    };
  }, [stt, tts]);

  return {
    isActive,
    state,
    transcript: stt.transcript,
    interimTranscript: stt.interimTranscript,
    conversationHistory,
    isMuted,
    error: voiceError,
    janeText,
    contextLabel,
    start,
    stop,
    toggleMute,
    interrupt,
  };
}
