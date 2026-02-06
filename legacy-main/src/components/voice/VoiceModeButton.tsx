'use client';

interface VoiceModeButtonProps {
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function VoiceModeButton({
  onClick,
  disabled = false,
  size = 'md',
  className = '',
}: VoiceModeButtonProps) {
  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        ${sizeClasses[size]}
        rounded-full transition-all
        text-slate-400 hover:text-purple-600 hover:bg-purple-50
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      title="Voice mode"
      aria-label="Start voice conversation with Jane"
    >
      {/* Waveform/soundwave icon (ChatGPT style) */}
      <svg
        className={iconSizes[size]}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M16 8a6 6 0 010 8" />
        <path d="M19 5a10 10 0 010 14" />
      </svg>
    </button>
  );
}
