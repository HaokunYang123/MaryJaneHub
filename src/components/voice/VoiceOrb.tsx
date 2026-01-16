'use client';

import type { VoiceState } from '@/types/voice';

interface VoiceOrbProps {
  state: VoiceState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function VoiceOrb({ state, size = 'lg', className = '' }: VoiceOrbProps) {
  const sizeClasses = {
    sm: 'w-20 h-20',
    md: 'w-32 h-32',
    lg: 'w-48 h-48',
  };

  const innerSizes = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-36 h-36',
  };

  const barHeights = {
    sm: 'h-6',
    md: 'h-10',
    lg: 'h-14',
  };

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Outer glow ring */}
      <div
        className={`
          absolute inset-0 rounded-full
          bg-gradient-to-br from-purple-500/30 to-purple-600/30
          ${state === 'listening' ? 'animate-orb-pulse' : ''}
          ${state === 'speaking' ? 'animate-orb-speak' : ''}
        `}
      />

      {/* Middle ring */}
      <div
        className={`
          absolute inset-2 rounded-full
          bg-gradient-to-br from-purple-500/50 to-purple-600/50
          ${state === 'listening' ? 'animate-orb-pulse' : ''}
          ${state === 'processing' ? 'animate-orb-spin' : ''}
        `}
        style={{ animationDelay: '0.1s' }}
      />

      {/* Inner orb */}
      <div
        className={`
          absolute inset-0 m-auto ${innerSizes[size]} rounded-full
          bg-gradient-to-br from-purple-500 to-purple-700
          flex items-center justify-center
          shadow-lg shadow-purple-500/50
          ${state === 'listening' ? 'animate-orb-pulse' : ''}
        `}
        style={{ animationDelay: '0.2s' }}
      >
        {/* State-specific content */}
        {state === 'idle' && (
          <svg
            className="w-1/3 h-1/3 text-white/80"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        )}

        {state === 'listening' && (
          <div className="flex items-center justify-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`w-1 ${barHeights[size]} bg-white/90 rounded-full animate-voice-bar`}
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        )}

        {state === 'processing' && (
          <div className="relative w-1/2 h-1/2">
            <div className="absolute inset-0 border-4 border-white/30 rounded-full" />
            <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {state === 'speaking' && (
          <div className="flex items-center justify-center gap-0.5">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className={`w-1 bg-white/90 rounded-full animate-voice-wave`}
                style={{
                  animationDelay: `${i * 0.08}s`,
                  height: `${Math.random() * 20 + 20}%`,
                }}
              />
            ))}
          </div>
        )}

        {state === 'error' && (
          <svg
            className="w-1/3 h-1/3 text-white/80"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        )}
      </div>

      {/* State label */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-sm text-white/60 capitalize whitespace-nowrap">
        {state === 'idle' && 'Tap to start'}
        {state === 'listening' && 'Listening...'}
        {state === 'processing' && 'Thinking...'}
        {state === 'speaking' && 'Jane is speaking'}
        {state === 'error' && 'Error occurred'}
      </div>
    </div>
  );
}
