'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

interface MicButtonProps {
  isListening: boolean;
  isSupported: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MicButton({
  isListening,
  isSupported,
  onStartListening,
  onStopListening,
  disabled = false,
  size = 'md',
  className = '',
}: MicButtonProps) {
  const [isPressed, setIsPressed] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  // Handle click (toggle)
  const handleClick = useCallback(() => {
    if (disabled || !isSupported) return;

    // If this was a long press, don't toggle on click up
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }

    if (isListening) {
      onStopListening();
    } else {
      onStartListening();
    }
  }, [disabled, isSupported, isListening, onStartListening, onStopListening]);

  // Handle touch/mouse down for push-to-talk
  const handlePointerDown = useCallback(() => {
    if (disabled || !isSupported || isListening) return;

    setIsPressed(true);
    isLongPressRef.current = false;

    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onStartListening();
    }, 300);
  }, [disabled, isSupported, isListening, onStartListening]);

  // Handle touch/mouse up for push-to-talk
  const handlePointerUp = useCallback(() => {
    setIsPressed(false);

    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // If it was a long press, stop listening
    if (isLongPressRef.current && isListening) {
      onStopListening();
    }
  }, [isListening, onStopListening]);

  // Handle pointer leave
  const handlePointerLeave = useCallback(() => {
    if (isPressed) {
      setIsPressed(false);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (isLongPressRef.current && isListening) {
        onStopListening();
      }
    }
  }, [isPressed, isListening, onStopListening]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const title = !isSupported
    ? 'Voice not supported'
    : isListening
      ? 'Stop listening'
      : 'Voice input (hold for push-to-talk)';

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerUp}
      disabled={disabled || !isSupported}
      className={`
        ${sizeClasses[size]}
        rounded-full transition-all select-none touch-none
        ${isListening
          ? 'bg-red-100 text-red-600 animate-orb-pulse'
          : isPressed
            ? 'bg-red-50 text-red-500'
            : 'hover:bg-slate-100 text-slate-400 hover:text-slate-600'
        }
        disabled:opacity-30 disabled:cursor-not-allowed
        ${className}
      `}
      title={title}
      aria-label={title}
    >
      {isListening ? (
        // Stop icon
        <svg className={iconSizes[size]} fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        // Microphone icon
        <svg className={iconSizes[size]} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      )}
    </button>
  );
}
