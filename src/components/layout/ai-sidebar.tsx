"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

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

export function AiSidebar({ pageContext = 'dashboard' }: AiSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Load saved width from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem('ai-sidebar-width');
    const savedCollapsed = localStorage.getItem('ai-sidebar-collapsed');
    if (savedWidth) setWidth(parseInt(savedWidth));
    if (savedCollapsed) setIsCollapsed(savedCollapsed === 'true');
  }, []);

  // Save width to localStorage
  useEffect(() => {
    localStorage.setItem('ai-sidebar-width', width.toString());
  }, [width]);

  useEffect(() => {
    localStorage.setItem('ai-sidebar-collapsed', isCollapsed.toString());
  }, [isCollapsed]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        
        setInputValue(transcript);
        
        if (event.results[0].isFinal) {
          sendMessage(transcript);
          setIsListening(false);
        }
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

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

  const sendMessage = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    const userMessage = text.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputValue('');
    setIsProcessing(true);

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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
      setInputValue('');
    }
  };

  const getPlaceholder = () => {
    switch (pageContext) {
      case 'banking': return 'Ask about accounts, balances, transfers...';
      case 'reports': return 'Ask about P&L, expenses, trends...';
      case 'documents': return 'Search for files, contracts, invoices...';
      case 'inventory': return 'Ask about stock levels, sales, orders...';
      case 'payroll': return 'Ask about payroll, employees...';
      default: return 'Ask me anything about your finances...';
    }
  };

  // Collapsed state
  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="w-12 bg-white border-l border-slate-200 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors"
      >
        <span className="material-symbols-outlined text-[#1B5E20] mb-2">smart_toy</span>
        <span className="text-xs text-slate-500 writing-vertical-lr rotate-180">AI Assistant</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full">
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 bg-slate-200 hover:bg-[#1B5E20] cursor-col-resize transition-colors flex items-center justify-center group ${
          isDragging ? 'bg-[#1B5E20]' : ''
        }`}
      >
        <div className="w-1 h-8 bg-slate-400 group-hover:bg-[#1B5E20] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Sidebar content */}
      <aside
        style={{ width }}
        className="bg-white border-l border-slate-200 flex flex-col transition-all duration-75"
      >
        {/* Header */}
        <div className="p-3 border-b border-slate-200 bg-[#1B5E20] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400">smart_toy</span>
            <div>
              <h3 className="font-semibold text-sm">AI Assistant</h3>
              <p className="text-xs text-green-200 capitalize">{pageContext} mode</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/ai"
              className="p-1.5 hover:bg-white/10 rounded transition-colors"
              title="Open full screen"
            >
              <span className="material-symbols-outlined text-sm">open_in_full</span>
            </Link>
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 hover:bg-white/10 rounded transition-colors"
              title="Collapse sidebar"
            >
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-8">
              <span className="material-symbols-outlined text-4xl text-slate-300 mb-3 block">forum</span>
              <p className="font-medium">How can I help?</p>
              <p className="text-xs mt-1 text-slate-400">
                Try: &quot;{pageContext === 'banking' ? "What's my cash position?" : "Show me outstanding invoices"}&quot;
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] p-2.5 rounded-lg text-sm ${
                msg.role === 'user'
                  ? 'bg-[#1B5E20] text-white rounded-tr-sm'
                  : 'bg-slate-100 text-slate-800 rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-slate-100 p-2.5 rounded-lg rounded-tl-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[#1B5E20] rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-[#1B5E20] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-[#1B5E20] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 bg-slate-50">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleListening}
              disabled={!recognitionRef.current}
              className={`p-2 rounded-lg transition-all ${
                isListening 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              } disabled:opacity-50`}
              title="Voice input"
            >
              <span className="material-symbols-outlined text-sm">
                {isListening ? 'stop' : 'mic'}
              </span>
            </button>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isListening ? "Listening..." : getPlaceholder()}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B5E20] focus:border-transparent"
              disabled={isProcessing || isListening}
            />
            <button
              type="submit"
              disabled={isProcessing || !inputValue.trim()}
              className="p-2 bg-[#1B5E20] text-white rounded-lg hover:bg-[#154a19] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined text-sm">send</span>
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
