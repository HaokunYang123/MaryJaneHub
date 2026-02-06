'use client';

import { useEffect, useCallback, useState, useMemo } from 'react';
import { MeshGradient } from '@paper-design/shaders-react';
import type { VoiceState } from '@/types/voice';

interface VoiceModeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  state: VoiceState;
  transcript: string;
  interimTranscript: string;
  janeText: string;
  contextLabel: string;
  isMuted: boolean;
  error: string | null;
  onToggleMute: () => void;
  onInterrupt: () => void;
}

export function VoiceModeOverlay({
  isOpen,
  onClose,
  state,
  transcript,
  interimTranscript,
  janeText,
  contextLabel,
  isMuted,
  error,
  onToggleMute,
  onInterrupt,
}: VoiceModeOverlayProps) {
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });
  const [mounted, setMounted] = useState(false);
  const [displayedJaneText, setDisplayedJaneText] = useState('');

  // Handle window resize for shader dimensions
  useEffect(() => {
    setMounted(true);
    const update = () =>
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Typewriter effect for Jane's text
  useEffect(() => {
    if (!janeText) {
      setDisplayedJaneText('');
      return;
    }

    // Reset and start typewriter
    const words = janeText.split(' ').filter(w => w.length > 0);
    let currentIndex = 0;
    setDisplayedJaneText(words[0] || '');
    currentIndex = 1;

    if (words.length <= 1) return;

    const interval = setInterval(() => {
      if (currentIndex < words.length) {
        const wordToAdd = words[currentIndex];
        currentIndex++;
        setDisplayedJaneText(prev => prev + ' ' + wordToAdd);
      } else {
        clearInterval(interval);
      }
    }, 150); // 150ms per word for slower, natural pacing

    return () => clearInterval(interval);
  }, [janeText]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Handle tap to interrupt when Jane is speaking
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && (state === 'speaking' || state === 'intro')) {
      onInterrupt();
    }
  }, [state, onInterrupt]);

  // Shader settings based on voice state
  const shaderSettings = useMemo(() => {
    switch (state) {
      case 'listening':
        return { speed: 0.5, distortion: 0.8, swirl: 0.5 };
      case 'processing':
        return { speed: 0.4, distortion: 0.7, swirl: 0.45 };
      case 'speaking':
      case 'intro':
        return { speed: 0.3, distortion: 0.6, swirl: 0.4 };
      default:
        return { speed: 0.3, distortion: 0.6, swirl: 0.4 };
    }
  }, [state]);

  // Determine mic button state
  const isMicActive = state === 'listening';
  const isMicDisabled = state === 'intro' || state === 'speaking' || state === 'processing';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-fadeIn">
      {/* Mesh Gradient Background */}
      <div className="fixed inset-0 w-screen h-screen">
        {mounted && (
          <>
            <MeshGradient
              width={dimensions.width}
              height={dimensions.height}
              colors={['#1a0a2e', '#2d1b4e', '#4a2c7a', '#1a0a2e', '#0f0a19', '#3d1f6d']}
              distortion={shaderSettings.distortion}
              swirl={shaderSettings.swirl}
              grainMixer={0}
              grainOverlay={0}
              speed={shaderSettings.speed}
              offsetX={0.08}
            />
            <div className="absolute inset-0 pointer-events-none bg-black/40" />
          </>
        )}
      </div>

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col h-full" onClick={handleOverlayClick}>
        {/* Top bar */}
        <div className="flex items-center justify-between p-4">
          <div /> {/* Spacer */}

          {/* Context pill - top center */}
          <div className="absolute left-1/2 transform -translate-x-1/2 top-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/10">
              {state === 'listening' && (
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              )}
              {state === 'processing' && (
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              )}
              {(state === 'speaking' || state === 'intro') && (
                <div className="w-2 h-2 bg-purple-400 rounded-full" />
              )}
              <span className="text-sm text-white/80 font-medium">{contextLabel}</span>
            </div>
          </div>

          {/* Exit button - top right */}
          <button
            onClick={onClose}
            className="p-2 rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
            aria-label="Exit voice mode"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {/* Jane's response text - center, large, white */}
          {displayedJaneText && (
            <div className="max-w-2xl text-center mb-8 animate-fadeIn">
              <p className="text-white text-2xl md:text-3xl leading-relaxed font-medium">
                {displayedJaneText}
              </p>
            </div>
          )}

          {/* Processing indicator */}
          {state === 'processing' && !displayedJaneText && (
            <div className="flex items-center gap-2 animate-fadeIn">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* Error display */}
          {state === 'error' && (
            <div className="flex items-center gap-2 text-red-400 animate-fadeIn">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm">{error || 'Something went wrong'}</span>
            </div>
          )}

          {/* Tap to interrupt hint */}
          {(state === 'speaking' || state === 'intro') && (
            <p className="text-white/30 text-sm mt-4">
              Tap anywhere to interrupt
            </p>
          )}
        </div>

        {/* Bottom area - User transcript and controls */}
        <div className="p-6 pb-8">
          {/* User's current speech - bottom center, gray, smaller */}
          {(transcript || interimTranscript) && state === 'listening' && (
            <div className="text-center mb-6 animate-slideUp">
              <p className="text-gray-400 text-lg max-w-xl mx-auto">
                {transcript}
                {interimTranscript && (
                  <span className="text-gray-500"> {interimTranscript}</span>
                )}
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-6">
            {/* Mute toggle - left side */}
            <button
              onClick={onToggleMute}
              className={`
                p-3 rounded-full transition-all
                ${isMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white border border-white/10'
                }
              `}
              aria-label={isMuted ? 'Unmute Jane' : 'Mute Jane'}
            >
              {isMuted ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>

            {/* Mic button - center */}
            <button
              onClick={onInterrupt}
              disabled={isMicDisabled && state !== 'speaking' && state !== 'intro'}
              className={`
                relative p-6 rounded-full transition-all
                ${isMicActive
                  ? 'bg-green-500/20 text-green-400 border-2 border-green-400/50 shadow-[0_0_20px_rgba(74,222,128,0.3)]'
                  : isMicDisabled
                    ? 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed'
                    : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white border border-white/20'
                }
              `}
              aria-label={isMicActive ? 'Listening...' : 'Microphone'}
            >
              {/* Pulse animation when listening */}
              {isMicActive && (
                <>
                  <div className="absolute inset-0 rounded-full bg-green-400/20 animate-ping" />
                  <div className="absolute inset-0 rounded-full bg-green-400/10 animate-pulse" />
                </>
              )}
              <svg className="w-8 h-8 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {/* Spacer to balance layout */}
            <div className="w-11" />
          </div>
        </div>
      </div>
    </div>
  );
}
