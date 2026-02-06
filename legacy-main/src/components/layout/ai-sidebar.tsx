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

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 350;

interface AiSidebarProps {
  pageContext?: string;
}

// Parse markdown-style links, bold text, and lists
function parseMessageContent(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
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
      prefix = <span key={`bullet-${lineIndex}`} className="mr-1">•</span>;
      lineContent = bulletMatch[2];
    } else if (numberMatch) {
      prefix = <span key={`num-${lineIndex}`} className="mr-1">{numberMatch[2]}.</span>;
      lineContent = numberMatch[3];
    }

    if (prefix) {
      parts.push(prefix);
    }

    // Process the line to handle nested markdown
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
            const url = linkMatch[2];
            parts.push(
              <a
                key={`boldlink-${lineIndex}-${i}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded font-semibold transition-colors cursor-pointer text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(url, '_blank');
                }}
              >
                {linkMatch[1]}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            );
          } else {
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
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-medium transition-colors cursor-pointer text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(url, '_blank');
                }}
              >
                {linkText}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

export function AiSidebar({ pageContext = 'dashboard' }: AiSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendMessageRef = useRef<(text: string) => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const fileArray = Array.from(files);
    let successCount = 0;

    // Add message about uploading
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `📄 Uploading ${fileArray.length} file${fileArray.length > 1 ? 's' : ''}...`
    }]);

    for (const file of fileArray) {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          successCount++;
        }
      } catch (error) {
        console.error(`Upload Error for ${file.name}:`, error);
      }
    }

    // Add completion message
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: successCount === fileArray.length
        ? `✅ Successfully uploaded ${successCount} file${successCount > 1 ? 's' : ''}! Go to [Files & Docs](/files) to review and confirm.`
        : `⚠️ Uploaded ${successCount} of ${fileArray.length} files. Go to [Files & Docs](/files) to review.`
    }]);

    setIsUploading(false);
    e.target.value = ''; // Reset input
  };

  // Load UI preferences and session messages on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem('ai-sidebar-width');
    const savedCollapsed = localStorage.getItem('ai-sidebar-collapsed');

    if (savedWidth) setWidth(parseInt(savedWidth));
    if (savedCollapsed) setIsCollapsed(savedCollapsed === 'true');

    // Load messages from sessionStorage (persists during navigation, clears on tab close)
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

  // Save UI preferences to localStorage
  useEffect(() => {
    if (isHydrated) localStorage.setItem('ai-sidebar-width', width.toString());
  }, [width, isHydrated]);

  useEffect(() => {
    if (isHydrated) localStorage.setItem('ai-sidebar-collapsed', isCollapsed.toString());
  }, [isCollapsed, isHydrated]);

  // Save messages to sessionStorage for persistence during navigation
  useEffect(() => {
    if (isHydrated && messages.length > 0) {
      sessionStorage.setItem('ai-chat-messages', JSON.stringify(messages));
    }
  }, [messages, isHydrated]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  };

  // Send message function
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const userMessage = text.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputValue('');
    setIsProcessing(true);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context: pageContext
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
  }, [pageContext]);

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

  // Handle drag resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;

    if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
      setWidth(newWidth);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

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

  const getPlaceholder = () => {
    switch (pageContext) {
      case 'banking': return 'Ask about accounts, balances...';
      case 'reports': return 'Ask about P&L, expenses...';
      case 'documents': return 'Search for files, invoices...';
      case 'inventory': return 'Ask about stock levels...';
      case 'payroll': return 'Ask about payroll...';
      default: return 'Ask me anything...';
    }
  };

  // Collapsed state
  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="w-12 bg-white border-l border-slate-200 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center mb-2">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
            <path d="M12 6v2M12 16v2M6 12h2M16 12h2" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-xs text-slate-500 font-bold">AI</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full">
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 hover:bg-emerald-500 cursor-col-resize transition-colors flex items-center justify-center group ${isDragging ? 'bg-emerald-500' : 'bg-slate-200'}`}
      >
        <div className="w-1 h-8 bg-slate-400 group-hover:bg-emerald-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Sidebar content */}
      <aside
        style={{ width }}
        className="bg-[#f8faf9] border-l border-slate-200 flex flex-col transition-all duration-75"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-800">Jane AI</h3>
              <p className="text-xs text-slate-500 capitalize">{pageContext}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/ai"
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
              title="Open full screen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </Link>
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
              title="Collapse"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-8">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="12" cy="12" r="3" fill="currentColor" />
                  <path d="M12 5v2M12 17v2M5 12h2M17 12h2" strokeLinecap="round" />
                </svg>
              </div>
              <p className="font-medium text-slate-700">How can I help?</p>
              <p className="text-xs mt-1 text-slate-400">
                Try: &quot;{pageContext === 'banking' ? "What's my cash?" : "Find CoolAir invoice"}&quot;
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{
                animation: 'slideUp 0.2s ease-out forwards',
                animationDelay: `${idx * 0.03}s`
              }}
            >
              <div className={`max-w-[90%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-emerald-600 text-white rounded-br-md'
                : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'
                }`}>
                {msg.role === 'assistant'
                  ? parseMessageContent(msg.content)
                  : msg.content
                }
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start" style={{ animation: 'slideUp 0.2s ease-out forwards' }}>
              <div className="bg-white border border-slate-200 px-3 py-2 rounded-2xl rounded-bl-md shadow-sm">
                <div className="flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input - Gemini style */}
        <div className="p-3 bg-white border-t border-slate-200">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            accept=".pdf,.png,.jpg,.jpeg,.txt"
            multiple
          />
          <form onSubmit={handleSubmit}>
            <div className="flex items-start gap-1.5 bg-slate-50 rounded-2xl border border-slate-200 px-2 py-1.5 focus-within:border-emerald-300 focus-within:ring-1 focus-within:ring-emerald-100 transition-all">
              {/* Left buttons - Upload and Mic at top-left */}
              <div className="flex gap-1 pt-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={`p-1.5 rounded-full transition-all ${isUploading
                    ? 'bg-emerald-100 text-emerald-600 animate-pulse'
                    : 'hover:bg-slate-200 text-slate-400 hover:text-slate-600'
                  } disabled:opacity-50`}
                  title="Upload documents"
                >
                  {isUploading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  )}
                </button>

                <MicButton
                  isListening={dictation.isListening}
                  isSupported={dictation.isSupported}
                  onStartListening={() => {
                    dictation.resetTranscript();
                    dictation.startListening();
                  }}
                  onStopListening={dictation.stopListening}
                  disabled={isProcessing}
                  size="sm"
                />
              </div>

              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={dictation.isListening ? "Listening..." : getPlaceholder()}
                rows={1}
                className="flex-1 py-1.5 text-sm text-slate-700 placeholder-slate-400 bg-transparent resize-none outline-none max-h-[100px]"
                disabled={isProcessing || dictation.isListening}
              />

              {/* Right buttons - Voice mode and Send */}
              <div className="flex items-center gap-1 pt-0.5 flex-shrink-0">
                {/* Voice mode button */}
                <VoiceModeButton
                  onClick={handleStartVoiceMode}
                  disabled={isProcessing}
                  size="sm"
                />

                {/* Send button */}
                <button
                  type="submit"
                  disabled={isProcessing || !inputValue.trim()}
                  className={`p-1.5 rounded-full transition-all ${
                    inputValue.trim()
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'text-slate-400'
                  } disabled:opacity-50`}
                >
                  {isProcessing ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </aside>

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

      {/* Animation styles */}
      <style jsx global>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
