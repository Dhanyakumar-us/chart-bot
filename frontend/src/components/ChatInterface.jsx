import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Send, Plus, Loader2, Mic, MicOff, Volume2, Trash2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

// Obtain Native Web Speech API
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [inConversation, setInConversation] = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [interimText, setInterimText] = useState(''); // Live dictation feedback
  
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  
  const inConversationRef = useRef(false);

  useEffect(() => {
    // Wipe the chat database completely when the page is refreshed
    axios.delete(`${API_BASE}/history`).then(() => {
        setMessages([]);
    }).catch(err => console.error("Could not clear on load:", err));

    const loadVoices = () => {
      if (window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
        if (voices.length > 0 && !selectedVoiceURI) {
           const bestVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Natural')) || voices[0];
           setSelectedVoiceURI(bestVoice.voiceURI);
        }
      }
    };
    loadVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices;
    
    // Initialize Native SpeechRecognition System
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false; // OS naturally stops when you finish your sentence
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
      alert("Failed to clear chat history: " + err.message);
    }
  };

  const stopConversation = () => {
    inConversationRef.current = false;
    setInConversation(false);
    setInterimText('');
    if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
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
          // Unblock Text-To-Speech engine gracefully
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
          console.log("Speech recognition error:", event.error);
          if (event.error === 'not-allowed') {
              alert("Microphone blocked. Please click the lock icon in Chrome's address bar to Allow.");
              stopConversation();
          }
      };

      recognitionRef.current.onend = () => {
          setInterimText('');
          if (!inConversationRef.current) return; // If manually stopped

          if (finalTranscript.trim()) {
              executeChat(finalTranscript.trim(), true);
          } else {
              // They paused too long without speaking, instantly loop back!
              try { recognitionRef.current.start(); } catch(e){}
          }
      };

      try {
          recognitionRef.current.start();
      } catch (err) {
          console.error("Already started error", err);
      }
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
        alert("Your browser does not support Web Speech API.");
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
           try { recognitionRef.current.start(); } catch(e){}
       }
    };
    
    utteranceRef.current.onerror = (e) => {
       console.error("SpeechSynthesis error:", e);
       if (inConversationRef.current) {
           try { recognitionRef.current.start(); } catch(e){}
       }
    };

    window.speechSynthesis.speak(utteranceRef.current);
  };

  const executeChat = async (textToProcess, isVoiceInteraction) => {
    const userMessage = { role: 'user', content: textToProcess, isVoice: isVoiceInteraction };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/chat`, { message: textToProcess });
      const botResponse = res.data.response;
      setMessages(prev => [...prev, { role: 'bot', content: botResponse, isVoice: isVoiceInteraction }]);
      
      if (isVoiceInteraction) {
         speakText(botResponse);
      } else {
         if (inConversationRef.current) {
              try { recognitionRef.current.start(); } catch(e){}
         }
      }
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg = 'Error: Could not connect to backend. ' + (err.response?.data?.detail || err.message);
      setMessages(prev => [...prev, { role: 'bot', content: errorMsg }]);
      alert("Chat Engine Error: " + errorMsg);
      if (inConversationRef.current) {
          try { recognitionRef.current.start(); } catch(e){}
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
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
      await axios.post(`${API_BASE}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' }});
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Header Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-0.5rem' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Voice:</span>
               <select 
                  value={selectedVoiceURI} 
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)', borderRadius: '0.5rem',
                    padding: '0.25rem 0.5rem', fontSize: '0.85rem', outline: 'none',
                    maxWidth: '200px'
                  }}
               >
                 {availableVoices.map((v, i) => (
                    <option key={i} value={v.voiceURI}>{v.name}</option>
                 ))}
               </select>
             </div>

             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
          </div>

          {messages.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-secondary)' }}>
              <h2>Welcome to NoLimits AI</h2>
              <p>Type a message or start a Voice Conversation.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: msg.role === 'user' ? 'var(--bg-tertiary)' : '#10b981'
              }}>
                {msg.role === 'user' ? 'U' : 'AI'}
              </div>
              <div className="prose" style={{ flex: 1, color: 'var(--text-primary)' }}>
                {msg.role === 'bot' ? (
                   <div>
                     {msg.isVoice && (
                       <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <Volume2 size={18} className="text-emerald-500" />
                          <span style={{ fontSize: '0.85rem' }}>Voice Response</span>
                       </div>
                     )}
                     <ReactMarkdown>{msg.content}</ReactMarkdown>
                   </div>
                ) : (
                  msg.isVoice ? (
                     <p>🎤 <i>"{msg.content}"</i></p>
                  ) : (
                     <p>{msg.content}</p>
                  )
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', color: 'var(--text-secondary)' }}>
              <Loader2 size={24} className="animate-spin" />
              <span>Thinking...</span>
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
              placeholder={inConversation ? (interimText ? `"${interimText}"` : "Listening... (Talk now)") : "Message NoLimits AI..."}
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
                borderRadius: '0.5rem',
                marginBottom: '0.25rem',
                transition: 'all 0.2s'
              }}
            >
              {inConversation ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button type="submit" disabled={inConversation} style={{
               padding: '0.5rem', 
               backgroundColor: input.trim() ? '#10b981' : 'var(--bg-tertiary)',
               color: input.trim() ? '#fff' : 'var(--text-secondary)',
               borderRadius: '0.5rem',
               marginBottom: '0.25rem',
               opacity: inConversation ? 0.3 : 1
            }}>
              <Send size={20} />
            </button>
          </div>
        </form>
        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
          NoLimits AI powered by Native Browser Dictation.
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;
