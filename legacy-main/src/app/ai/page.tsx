"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useDeepgram } from '@/hooks/useDeepgram';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { MicButton } from '@/components/voice/MicButton';
import { VoiceModeButton } from '@/components/voice/VoiceModeButton';
import { VoiceModeOverlay } from '@/components/voice/VoiceModeOverlay';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: string | null;
}

const SUGGESTION_CHIPS = [
  "What's my cash position?",
  "Find CoolAir HVAC invoice",
  "Riverside property expenses",
  "Show outstanding bills",
  "Last month's P&L summary"
];

// Parse markdown-style links, bold text, and lists
function parseMessageContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];

  // Split by lines first to handle line breaks
  const lines = content.split('\n');

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      parts.push(<br key={`br-${lineIndex}`} />);
    }

    // Check if line is a list item
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    const numberMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);

    let lineContent = line;
    let prefix: React.ReactNode = null;

    if (bulletMatch) {
      prefix = <span key={`bullet-${lineIndex}`} className="mr-2">•</span>;
      lineContent = bulletMatch[2];
    } else if (numberMatch) {
      prefix = <span key={`num-${lineIndex}`} className="mr-2">{numberMatch[2]}.</span>;
      lineContent = numberMatch[3];
    }

    if (prefix) {
      parts.push(prefix);
    }

    // Process the line character by character to handle nested markdown
    let i = 0;
    let currentText = '';

    const flushText = () => {
      if (currentText) {
        parts.push(currentText);
        currentText = '';
      }
    };

    while (i < lineContent.length) {
      // Check for bold **text** or **[link](url)**
      if (lineContent.slice(i, i + 2) === '**') {
        flushText();
        const endBold = lineContent.indexOf('**', i + 2);
        if (endBold !== -1) {
          const boldContent = lineContent.slice(i + 2, endBold);

          // Check if bold content contains a link
          const linkMatch = boldContent.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (linkMatch) {
            // It's a bold link **[text](url)**
            const url = linkMatch[2];
            parts.push(
              <a
                key={`boldlink-${lineIndex}-${i}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg font-semibold transition-colors cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(url, '_blank');
                }}
              >
                {linkMatch[1]}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            );
          } else {
            // Regular bold text
            parts.push(
              <strong key={`bold-${lineIndex}-${i}`} className="font-semibold">
                {boldContent}
              </strong>
            );
          }
          i = endBold + 2;
          continue;
        }
      }

      // Check for link [text](url)
      if (lineContent[i] === '[') {
        const closeBracket = lineContent.indexOf(']', i);
        if (closeBracket !== -1 && lineContent[closeBracket + 1] === '(') {
          const closeParen = lineContent.indexOf(')', closeBracket);
          if (closeParen !== -1) {
            flushText();
            const linkText = lineContent.slice(i + 1, closeBracket);
            const url = lineContent.slice(closeBracket + 2, closeParen);
            parts.push(
              <a
                key={`link-${lineIndex}-${i}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md font-medium transition-colors cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(url, '_blank');
                }}
              >
                {linkText}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            );
            i = closeParen + 1;
            continue;
          }
        }
      }

      currentText += lineContent[i];
      i++;
    }

    flushText();
  });

  return parts;
}

export default function AIFullPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendMessageRef = useRef<(text: string) => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize with session messages (persist during navigation)
  useEffect(() => {
    // Load messages from sessionStorage
    const savedMessages = sessionStorage.getItem('ai-chat-messages');
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch {
        setMessages([]);
      }
    }
    setIsHydrated(true);

    // Clear chat history when page unloads (close tab or refresh - NOT navigation)
    const handleBeforeUnload = () => {
      // Clear server-side conversation history
      fetch('/api/assistant', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'default' }),
        keepalive: true // Ensure request completes even during unload
      }).catch(() => {});
      // Clear sessionStorage on actual page unload
      sessionStorage.removeItem('ai-chat-messages');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save messages to sessionStorage for persistence during navigation
  useEffect(() => {
    if (isHydrated && messages.length > 0) {
      sessionStorage.setItem('ai-chat-messages', JSON.stringify(messages));
    }
  }, [messages, isHydrated]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  };

  // Send message function (memoized)
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMessage = text.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputValue('');
    setIsProcessing(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context: 'full'
        })
      });

      const data = await response.json();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content || data.reply || "I couldn't process that.",
        action: data.action
      }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Keep ref updated with latest sendMessage
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Voice dictation (ElevenLabs Scribe STT)
  const handleDictationTranscript = useCallback((text: string) => {
    if (text.trim()) {
      sendMessageRef.current(text);
    }
  }, []);

  const dictation = useDeepgram(handleDictationTranscript);

  // Full voice mode (STT + TTS conversation)
  const voiceMode = useVoiceMode({
    onMessage: (userMsg, assistantMsg) => {
      // Add messages to chat history when in voice mode
      setMessages(prev => [
        ...prev,
        { role: 'user', content: userMsg },
        { role: 'assistant', content: assistantMsg }
      ]);
    },
  });

  // Update input value with interim transcript during dictation
  useEffect(() => {
    if (dictation.isListening) {
      setInputValue(dictation.transcript + (dictation.interimTranscript ? ' ' + dictation.interimTranscript : ''));
    }
  }, [dictation.transcript, dictation.interimTranscript, dictation.isListening]);

  // Handle starting voice mode
  const handleStartVoiceMode = useCallback(async () => {
    setVoiceModeOpen(true);
    await voiceMode.start();
  }, [voiceMode]);

  // Handle closing voice mode
  const handleCloseVoiceMode = useCallback(() => {
    voiceMode.stop();
    setVoiceModeOpen(false);
  }, [voiceMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProcessing && inputValue.trim()) {
      sendMessage(inputValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isProcessing && inputValue.trim()) {
        sendMessage(inputValue);
      }
    }
  };

  const clearChat = async () => {
    try {
      await fetch('/api/assistant', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'default' })
      });
      setMessages([]);
      sessionStorage.removeItem('ai-chat-messages');
    } catch (error) {
      console.error('Error clearing chat:', error);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const fileArray = Array.from(files);
    let successCount = 0;

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `📄 Uploading ${fileArray.length} file${fileArray.length > 1 ? 's' : ''}...`
    }]);

    for (const file of fileArray) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
        if (res.ok) successCount++;
      } catch (error) {
        console.error(`Upload Error for ${file.name}:`, error);
      }
    }

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: successCount === fileArray.length
        ? `✅ Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}! Go to [Files & Docs](/files) to review and confirm.`
        : `⚠️ Uploaded ${successCount} of ${fileArray.length} files. Go to [Files & Docs](/files) to review.`
    }]);

    setIsUploading(false);
    e.target.value = '';
  };

  return (
    <div className="h-screen flex flex-col bg-[#f8faf9]">
      {/* Hidden file input for document upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        multiple
        className="hidden"
      />

      {/* Minimal Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            title="Back to Dashboard"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="12" cy="12" r="3" fill="currentColor" />
                <path d="M12 5v2M12 17v2M5 12h2M17 12h2" strokeLinecap="round" />
                <path d="M7.05 7.05l1.41 1.41M15.54 15.54l1.41 1.41M7.05 16.95l1.41-1.41M15.54 8.46l1.41-1.41" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Jane AI</h1>
              <p className="text-xs text-slate-500">Financial Assistant</p>
            </div>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Clear chat
          </button>
        )}
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-hidden flex justify-center">
        <div className="w-full max-w-4xl flex flex-col px-4">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-6">
            {messages.length === 0 && (
              <div className="text-center py-16 animate-fadeIn">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3 hover:rotate-0 transition-transform">
                  <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="12" cy="12" r="4" fill="currentColor" />
                    <path d="M12 4v3M12 17v3M4 12h3M17 12h3" strokeLinecap="round" strokeWidth={2} />
                    <path d="M6.34 6.34l2.12 2.12M15.54 15.54l2.12 2.12M6.34 17.66l2.12-2.12M15.54 8.46l2.12-2.12" strokeLinecap="round" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-slate-800 mb-2">Hi Mary, how can I help?</h2>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">
                  Ask me about your finances, find documents, check balances, or get reports.
                </p>

                {/* Suggestion chips */}
                <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                  {SUGGESTION_CHIPS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => sendMessage(suggestion)}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm text-slate-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all shadow-sm hover:shadow"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-6">
              {messages.map((msg, idx) => {
                // Calculate dynamic width based on content length
                const contentLength = msg.content.length;
                const hasMultipleLines = msg.content.includes('\n');

                let widthClass = 'max-w-fit'; // Default: fit content
                if (msg.role === 'assistant') {
                  if (contentLength > 300 || hasMultipleLines) {
                    widthClass = 'max-w-[90%] min-w-[300px]'; // Long messages: wider
                  } else if (contentLength > 100) {
                    widthClass = 'max-w-[70%] min-w-[250px]'; // Medium messages
                  } else {
                    widthClass = 'max-w-[50%]'; // Short messages: compact
                  }
                } else {
                  // User messages
                  if (contentLength > 100) {
                    widthClass = 'max-w-[70%]';
                  } else {
                    widthClass = 'max-w-fit';
                  }
                }

                return (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slideUp`}
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    <div className={`${widthClass} ${msg.role === 'user' ? 'order-2' : ''}`}>
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center shadow-sm">
                            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                              <path d="M12 6v2M12 16v2M6 12h2M16 12h2" strokeLinecap="round" />
                            </svg>
                          </div>
                          <span className="text-xs text-slate-500 font-medium">Jane AI</span>
                        </div>
                      )}
                      <div className={`px-4 py-3 rounded-2xl ${msg.role === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-md'
                        : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'
                        }`}
                      >
                        <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
                          {msg.role === 'assistant'
                            ? parseMessageContent(msg.content)
                            : msg.content
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {isProcessing && (
                <div className="flex justify-start animate-slideUp">
                  <div className="max-w-[85%]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center shadow-sm animate-pulse">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <span className="text-xs text-slate-500 font-medium">Jane AI</span>
                    </div>
                    <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
                      <div className="flex gap-1.5 items-center">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area - Gemini Style */}
          <div className="p-4 pb-6">
            <form onSubmit={handleSubmit} className="relative">
              <div className="flex items-start gap-2 bg-white rounded-3xl border border-slate-200 shadow-lg hover:shadow-xl transition-shadow px-4 py-3">
                {/* Left buttons - Upload and Voice */}
                <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                  {/* Upload button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className={`p-2 rounded-full transition-all hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed`}
                    title="Upload documents"
                  >
                    {isUploading ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </button>

                  {/* Voice dictation button */}
                  <MicButton
                    isListening={dictation.isListening}
                    isSupported={dictation.isSupported}
                    onStartListening={() => {
                      dictation.resetTranscript();
                      dictation.startListening();
                    }}
                    onStopListening={dictation.stopListening}
                    disabled={isProcessing}
                    size="md"
                  />
                </div>

                {/* Text input */}
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder={dictation.isListening ? "Listening..." : "Ask Jane AI anything..."}
                  rows={1}
                  className="flex-1 py-2 text-[15px] text-slate-700 placeholder-slate-400 bg-transparent resize-none outline-none max-h-[200px] min-h-[36px]"
                  disabled={isProcessing || dictation.isListening}
                />

                {/* Right buttons - Voice mode and Send */}
                <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                  {/* Voice mode button */}
                  <VoiceModeButton
                    onClick={handleStartVoiceMode}
                    disabled={isProcessing}
                    size="md"
                  />

                  {/* Send button */}
                  <button
                    type="submit"
                    disabled={isProcessing || !inputValue.trim()}
                    className={`p-2 rounded-full transition-all ${
                      inputValue.trim()
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md'
                        : 'bg-slate-100 text-slate-400'
                    } disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
                  >
                    {isProcessing ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </form>
            <p className="text-center text-xs text-slate-400 mt-3">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </main>

      {/* Voice Mode Overlay */}
      <VoiceModeOverlay
        isOpen={voiceModeOpen}
        onClose={handleCloseVoiceMode}
        state={voiceMode.state}
        transcript={voiceMode.transcript}
        interimTranscript={voiceMode.interimTranscript}
        janeText={voiceMode.janeText}
        contextLabel={voiceMode.contextLabel}
        isMuted={voiceMode.isMuted}
        error={voiceMode.error}
        onToggleMute={voiceMode.toggleMute}
        onInterrupt={voiceMode.interrupt}
      />

      {/* Custom animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out forwards;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
