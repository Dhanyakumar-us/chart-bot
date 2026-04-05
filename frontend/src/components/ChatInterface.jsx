import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Send, Plus, Loader2, Mic, MicOff, Volume2, Trash2, Wifi } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

// Obtain Native Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [inConversation, setInConversation] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [interimText, setInterimText] = useState('');
  const [backendStatus, setBackendStatus] = useState('unknown'); // 'online' | 'waking' | 'unknown'

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const inConversationRef = useRef(false);
  const abortControllerRef = useRef(null);

  // ── Keep-Alive Ping: prevent Render cold starts ──────────────────────────
  useEffect(() => {
    const ping = async () => {
      try {
        await axios.get(`${API_BASE}/ping`, { timeout: 5000 });
        setBackendStatus('online');
      } catch {
        setBackendStatus('waking');
      }
    };
    ping(); // Ping immediately on load
    const interval = setInterval(ping, 4 * 60 * 1000); // Every 4 minutes
    return () => clearInterval(interval);
  }, []);

  // ── Clear history on page load ────────────────────────────────────────────
  useEffect(() => {
    axios.delete(`${API_BASE}/history`).then(() => {
      setMessages([]);
    }).catch(err => console.error("Could not clear on load:", err));

    const loadVoices = () => {
      if (window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
        if (voices.length > 0 && !selectedVoiceURI) {
          const bestVoice = voices.find(v =>
            v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Natural')
          ) || voices[0];
          setSelectedVoiceURI(bestVoice.voiceURI);
        }
      }
    };
    loadVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const clearChat = async () => {
    if (!window.confirm("Are you sure you want to delete this chat history?")) return;
    try {
      await axios.delete(`${API_BASE}/history`);
      setMessages([]);
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  const stopConversation = () => {
    inConversationRef.current = false;
    setInConversation(false);
    setInterimText('');
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { }
    }
  };

  const startListening = () => {
    if (!recognitionRef.current) {
      alert("Your browser does not support Speech Recognition. Please try Google Chrome.");
      stopConversation();
      return;
    }

    let finalTranscript = '';
    setInterimText('');

    recognitionRef.current.onstart = () => {
      if (window.speechSynthesis && !utteranceRef.current) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
      }
    };

    recognitionRef.current.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(finalTranscript || interim);
    };

    recognitionRef.current.onerror = (event) => {
      if (event.error === 'not-allowed') {
        alert("Microphone blocked. Please allow microphone access.");
        stopConversation();
      }
    };

    recognitionRef.current.onend = () => {
      setInterimText('');
      if (!inConversationRef.current) return;
      if (finalTranscript.trim()) {
        executeChat(finalTranscript.trim(), true);
      } else {
        try { recognitionRef.current.start(); } catch (e) { }
      }
    };

    try { recognitionRef.current.start(); } catch (err) { }
  };

  const toggleConversation = () => {
    if (inConversationRef.current) {
      stopConversation();
    } else {
      inConversationRef.current = true;
      setInConversation(true);
      startListening();
    }
  };

  const speakText = (text) => {
    if (!window.speechSynthesis) {
      if (inConversationRef.current) startListening();
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#_~`]/g, '');
    utteranceRef.current = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current.rate = 1.0;
    if (selectedVoiceURI) {
      const matchedVoice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
      if (matchedVoice) utteranceRef.current.voice = matchedVoice;
    }
    utteranceRef.current.onend = () => {
      if (inConversationRef.current) {
        try { recognitionRef.current.start(); } catch (e) { }
      }
    };
    utteranceRef.current.onerror = () => {
      if (inConversationRef.current) {
        try { recognitionRef.current.start(); } catch (e) { }
      }
    };
    window.speechSynthesis.speak(utteranceRef.current);
  };

  // ── Streaming Chat ────────────────────────────────────────────────────────
  const executeChat = async (textToProcess, isVoiceInteraction) => {
    const userMessage = { role: 'user', content: textToProcess, isVoice: isVoiceInteraction };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);
    setIsStreaming(false);

    // Cancel any in-progress stream
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    // Add placeholder bot message for streaming
    const botPlaceholder = { role: 'bot', content: '', isVoice: isVoiceInteraction, streaming: true };
    setMessages(prev => [...prev, botPlaceholder]);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToProcess,
          history: updatedMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      setIsLoading(false);
      setIsStreaming(true);
      setBackendStatus('online');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              fullText = `Error: ${parsed.error}`;
            } else if (parsed.delta) {
              fullText += parsed.delta;
            }
            // Update the last message (bot placeholder) in real time
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'bot',
                content: fullText,
                isVoice: isVoiceInteraction,
                streaming: true,
              };
              return updated;
            });
          } catch { /* ignore parse errors */ }
        }
      }

      // Mark streaming as done
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'bot',
          content: fullText,
          isVoice: isVoiceInteraction,
          streaming: false,
        };
        return updated;
      });

      if (isVoiceInteraction) {
        speakText(fullText);
      } else if (inConversationRef.current) {
        try { recognitionRef.current.start(); } catch (e) { }
      }

    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Chat error:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'bot',
          content: `⚠️ Could not connect to backend. ${err.message}`,
          streaming: false,
        };
        return updated;
      });
      setBackendStatus('waking');
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isStreaming) return;
    const currentInput = input;
    setInput('');
    executeChat(currentInput, false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Status dot color
  const statusColor = backendStatus === 'online' ? '#10b981' : backendStatus === 'waking' ? '#f59e0b' : '#6b7280';
  const statusLabel = backendStatus === 'online' ? 'Online' : backendStatus === 'waking' ? 'Connecting...' : 'Checking...';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Header Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* Backend status indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: statusColor }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  backgroundColor: statusColor,
                  boxShadow: backendStatus === 'online' ? `0 0 6px ${statusColor}` : 'none',
                  animation: backendStatus === 'waking' ? 'pulse 1.5s infinite' : 'none'
                }} />
                {statusLabel}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Voice:</span>
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)', borderRadius: '0.5rem',
                    padding: '0.25rem 0.5rem', fontSize: '0.85rem', outline: 'none',
                    maxWidth: '180px'
                  }}
                >
                  {availableVoices.map((v, i) => (
                    <option key={i} value={v.voiceURI}>{v.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={clearChat}
              title="Clear Chat History"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
                padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #ef4444',
                backgroundColor: 'transparent', color: '#ef4444'
              }}
            >
              <Trash2 size={16} />
              <span style={{ fontSize: '0.8rem' }}>New Chat</span>
            </button>
          </div>

          {/* Welcome screen */}
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-secondary)' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.8rem'
              }}>⚡</div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Welcome to NoLimits AI</h2>
              <p>Ask me anything • Generate charts • Upload files</p>
              {backendStatus === 'waking' && (
                <p style={{ color: '#f59e0b', fontSize: '0.85rem', marginTop: '1rem' }}>
                  ⏳ Backend is waking up — first message may take ~15s on free tier
                </p>
              )}
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }} className="animate-fade-in">
              <div style={{
                width: '32px', height: '32px', borderRadius: '4px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: msg.role === 'user' ? 'var(--bg-tertiary)' : '#10b981',
                fontSize: '0.75rem', fontWeight: 'bold'
              }}>
                {msg.role === 'user' ? 'U' : 'AI'}
              </div>
              <div className="prose" style={{ flex: 1, color: 'var(--text-primary)' }}>
                {msg.role === 'bot' ? (
                  <div>
                    {msg.isVoice && (
                      <div style={{
                        fontStyle: 'italic', color: 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem'
                      }}>
                        <Volume2 size={18} style={{ color: '#10b981' }} />
                        <span style={{ fontSize: '0.85rem' }}>Voice Response</span>
                      </div>
                    )}
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    {msg.streaming && msg.content && (
                      <span style={{
                        display: 'inline-block', width: '2px', height: '1em',
                        backgroundColor: '#6366f1', marginLeft: '1px',
                        animation: 'blink 0.7s infinite'
                      }} />
                    )}
                  </div>
                ) : (
                  msg.isVoice
                    ? <p>🎤 <i>"{msg.content}"</i></p>
                    : <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Loading spinner (before stream starts) */}
          {isLoading && !isStreaming && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '0.9rem' }}>
                {backendStatus === 'waking' ? 'Waking up server...' : 'Thinking...'}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div style={{ padding: '1.5rem 2rem', background: 'linear-gradient(to top, var(--bg-main) 80%, transparent)' }}>
        <form onSubmit={handleSend} style={{
          maxWidth: '800px', margin: '0 auto', position: 'relative', display: 'flex', gap: '0.5rem'
        }}>
          <div className="glass-panel" style={{
            display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flex: 1,
            borderRadius: '1rem', padding: '0.5rem 1rem',
            border: inConversation ? '1px solid #10b981' : '1px solid var(--border-color)'
          }}>
            <label style={{ cursor: 'pointer', padding: '0.5rem', color: 'var(--text-secondary)' }}>
              <Plus size={24} />
              <input type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder={
                inConversation
                  ? (interimText ? `"${interimText}"` : "Listening... (Talk now)")
                  : "Message NoLimits AI..."
              }
              disabled={inConversation}
              style={{
                flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)',
                resize: 'none', maxHeight: '200px', padding: '0.75rem 0', outline: 'none',
                opacity: inConversation && !interimText ? 0.5 : 1
              }}
              rows={1}
            />
            <button
              type="button"
              onClick={toggleConversation}
              title={inConversation ? "End Call" : "Start Hands-Free Call"}
              style={{
                padding: '0.5rem',
                backgroundColor: inConversation ? '#ef4444' : 'transparent',
                color: inConversation ? '#fff' : 'var(--text-secondary)',
                borderRadius: '0.5rem', marginBottom: '0.25rem', transition: 'all 0.2s'
              }}
            >
              {inConversation ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              type="submit"
              disabled={inConversation || isLoading || isStreaming}
              style={{
                padding: '0.5rem',
                backgroundColor: input.trim() && !isLoading && !isStreaming ? '#10b981' : 'var(--bg-tertiary)',
                color: input.trim() && !isLoading && !isStreaming ? '#fff' : 'var(--text-secondary)',
                borderRadius: '0.5rem', marginBottom: '0.25rem',
                opacity: (inConversation || isLoading || isStreaming) ? 0.4 : 1
              }}
            >
              {isStreaming
                ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                : <Send size={20} />
              }
            </button>
          </div>
        </form>
        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
          NoLimits AI · Powered by Groq & Llama 3.3
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

export default ChatInterface;
