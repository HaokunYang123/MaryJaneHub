"use client";

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: string | null;
}

const SUGGESTION_CHIPS = [
  "What's my cash position?",
  "Summarize last month's P&L",
  "Find the Phoenix lease",
  "How much did I spend on repairs?",
  "Show me outstanding invoices",
  "Check inventory levels"
];

export default function AIFullPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
      setInputValue('');
    }
  };

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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  const clearChat = async () => {
    try {
      await fetch('/api/assistant', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'default' })
      });
      setMessages([]);
    } catch (error) {
      console.error('Error clearing chat:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-[#1B5E20] text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <Link 
            href="/" 
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Back to Dashboard"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold">AI Assistant</h1>
            <p className="text-green-200 text-sm">Ask me anything about your finances</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={clearChat}
            className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            Clear Chat
          </button>
          <div className="flex items-center gap-2 text-green-200 text-sm">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span>Online</span>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-hidden flex justify-center">
        <div className="w-full max-w-4xl flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <div className="w-24 h-24 bg-gradient-to-br from-[#1B5E20] to-[#2E7D32] rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <span className="material-symbols-outlined text-4xl text-amber-400">smart_toy</span>
                </div>
                <h2 className="text-3xl font-bold text-slate-800 mb-2">Hi Mary, how can I help?</h2>
                <p className="text-slate-500 mb-8 max-w-lg mx-auto">
                  I can help you manage your finances, track expenses, find documents, check inventory, and more. 
                  Just ask me anything!
                </p>
                
                {/* Suggestion chips */}
                <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
                  {SUGGESTION_CHIPS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => sendMessage(suggestion)}
                      className="px-4 py-2.5 bg-white border border-slate-200 rounded-full text-sm text-slate-700 hover:bg-[#1B5E20] hover:text-white hover:border-[#1B5E20] transition-all shadow-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-2xl ${msg.role === 'user' ? 'order-2' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-[#1B5E20] to-[#2E7D32] rounded-full flex items-center justify-center shadow-md">
                        <span className="text-amber-400 text-sm font-bold">AI</span>
                      </div>
                      <span className="text-sm text-slate-500 font-medium">Assistant</span>
                      {msg.action && msg.action !== 'awaiting_confirmation' && msg.action !== 'error' && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          ✓ {msg.action.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  )}
                  <div className={`p-4 rounded-2xl shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-[#1B5E20] text-white rounded-tr-sm'
                      : 'bg-white border border-slate-200 rounded-tl-sm'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex justify-start">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-[#1B5E20] to-[#2E7D32] rounded-full flex items-center justify-center">
                      <span className="text-amber-400 text-sm font-bold">AI</span>
                    </div>
                    <span className="text-sm text-slate-500">Thinking...</span>
                  </div>
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-sm">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 bg-[#1B5E20] rounded-full animate-bounce" />
                      <div className="w-2.5 h-2.5 bg-[#1B5E20] rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                      <div className="w-2.5 h-2.5 bg-[#1B5E20] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-6 bg-white border-t border-slate-200 shadow-lg">
            <form onSubmit={handleSubmit} className="flex items-center gap-4">
              {/* Voice button */}
              <button
                type="button"
                onClick={toggleListening}
                disabled={!recognitionRef.current}
                className={`p-4 rounded-full transition-all shadow-md ${
                  isListening 
                    ? 'bg-red-500 animate-pulse scale-110' 
                    : 'bg-[#1B5E20] hover:bg-[#154a19]'
                } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
                title={recognitionRef.current ? (isListening ? 'Stop listening' : 'Start voice input') : 'Voice not supported'}
              >
                {isListening ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>
              
              {/* Text input */}
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={isListening ? "Listening..." : "Type or speak your message..."}
                  className="w-full px-6 py-4 text-lg border-2 border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#1B5E20] focus:border-transparent transition-all"
                  disabled={isProcessing || isListening}
                />
              </div>
              
              {/* Send button */}
              <button
                type="submit"
                disabled={isProcessing || !inputValue.trim()}
                className="p-4 bg-[#1B5E20] text-white rounded-full hover:bg-[#154a19] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
            
            <p className="text-center text-xs text-slate-400 mt-3">
              Press Enter to send • Click microphone for voice input
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
