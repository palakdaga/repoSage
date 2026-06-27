'use client';

import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { MermaidRenderer } from './MermaidRenderer';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  repositoryId: string;
  sessionId: string;
  repoUrl?: string;
  repoName?: string;
  onClose?: () => void;
}

/* ── Simple string hash for deterministic diagram IDs ───────── */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

/* ── Unified mermaid regex ──────────────────────────────────── */
const MERMAID_BLOCK_REGEX = /```\s*mermaid\s*[\r\n]+([\s\S]*?)[\r\n]+```/g;

/* ── Extract mermaid code blocks (complete blocks only) ─────── */
function extractMermaidDiagrams(content: string) {
  const diagrams: Array<{ id: string; code: string }> = [];
  let match;
  // Reset lastIndex for global regex
  MERMAID_BLOCK_REGEX.lastIndex = 0;

  while ((match = MERMAID_BLOCK_REGEX.exec(content)) !== null) {
    const code = match[1].trim();
    if (code.length > 0) {
      diagrams.push({
        id: `diagram_${hashCode(code)}`,
        code,
      });
    }
  }

  return diagrams;
}

/* ── Remove completed mermaid blocks from text ──────────────── */
function removeMermaidBlocks(content: string) {
  return content.replace(/```\s*mermaid\s*[\r\n]+([\s\S]*?)[\r\n]+```/g, '').trim();
}

/* ── Check if content has an incomplete mermaid block ────────── */
function hasIncompleteMermaidBlock(content: string): boolean {
  // Count opening and closing fences
  const openPattern = /```\s*mermaid/g;
  const closingPattern = /```\s*mermaid[\s\S]*?```/g;
  const opens = (content.match(openPattern) || []).length;
  const closes = (content.match(closingPattern) || []).length;
  return opens > closes;
}

/* ── Memoised message bubble ───────────────────────────────── */
const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const diagrams = useMemo(() => extractMermaidDiagrams(message.content), [message.content]);
  const textContent = useMemo(() => removeMermaidBlocks(message.content), [message.content]);
  const [diagramErrors, setDiagramErrors] = useState<{ [key: string]: string }>({});

  const handleDiagramError = useCallback((diagramId: string, error: string) => {
    setDiagramErrors((prev) => ({ ...prev, [diagramId]: error }));
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
      <div style={{ maxWidth: '80%' }}>
        <div
          style={{
            padding: '10px 16px',
            borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
            background: isUser
              ? 'linear-gradient(135deg, #6c5ce7, #a29bfe)'
              : 'rgba(255,255,255,0.08)',
            color: isUser ? '#fff' : '#e2e8f0',
            border: isUser ? 'none' : '1px solid rgba(255,255,255,0.1)',
            fontSize: '0.88rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {textContent}
          {Object.values(diagramErrors).length > 0 && (
            <div style={{
              marginTop: '8px',
              padding: '8px',
              borderRadius: '6px',
              background: 'rgba(255, 107, 107, 0.15)',
              border: '1px solid rgba(255, 107, 107, 0.3)',
              color: '#ff6b6b',
              fontSize: '0.75rem',
            }}>
              {Object.entries(diagramErrors).map(([id, err]) => (
                <div key={id} style={{ marginBottom: '4px' }}>
                  ⚠️ {err}
                </div>
              ))}
            </div>
          )}
          <div style={{
            fontSize: '0.65rem',
            marginTop: '4px',
            opacity: 0.5,
            textAlign: isUser ? 'right' : 'left',
          }}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        {diagrams.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            {diagrams.map((diagram) => (
              <MermaidRenderer
                key={diagram.id}
                id={diagram.id}
                code={diagram.code}
                onError={(error) => handleDiagramError(diagram.id, error)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

/* ── Main component ────────────────────────────────────────── */
export function ChatInterface({ repositoryId, sessionId, repoUrl, repoName, onClose }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState('');
  const [streamingDiagramErrors, setStreamingDiagramErrors] = useState<{ [key: string]: string }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRAF = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRAF.current) cancelAnimationFrame(scrollRAF.current);
    scrollRAF.current = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (scrollRAF.current) cancelAnimationFrame(scrollRAF.current);
    };
  }, []);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetch(`/api/chat?sessionId=${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages?.length > 0) {
            setMessages(data.messages.map((msg: any) => ({ ...msg, timestamp: new Date(msg.timestamp) })));
          }
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };
    if (sessionId) loadHistory();
  }, [sessionId]);

  // Memoize streaming diagrams — only render complete blocks
  const streamingDiagrams = useMemo(() => extractMermaidDiagrams(streamingContent), [streamingContent]);
  const streamingText = useMemo(() => removeMermaidBlocks(streamingContent), [streamingContent]);
  const streamingHasIncomplete = useMemo(() => hasIncompleteMermaidBlock(streamingContent), [streamingContent]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setStreamingContent('');
    setError('');
    setStreamingDiagramErrors({});

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, repositoryId, message: inputMessage, repoUrl }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'token') {
              accumulated += event.token;
              setStreamingContent(accumulated);
            } else if (event.type === 'done') {
              setStreamingContent('');
              const assistantMsg: ChatMessage = {
                id: event.message?.id || `assistant_${Date.now()}`,
                role: 'assistant',
                content: accumulated,
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, assistantMsg]);
            } else if (event.type === 'error') {
              setError(event.error || 'An error occurred');
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Chat error:', err);
        setError('Failed to send message. Please try again.');
      }
    } finally {
      setIsLoading(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  };

  const clearChat = () => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setStreamingContent('');
    setError('');
    setStreamingDiagramErrors({});
  };

  const quickQuestions = [
    "How do I set up this project?",
    "What's the architecture?",
    "Tell me about the API endpoints",
    "Explain the main components",
  ];

  /* ── Styles ──────────────────────────────────────────────── */
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'rgba(15, 15, 26, 0.95)',
    borderRadius: '16px',
    border: '1px solid rgba(108, 92, 231, 0.25)',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: '1px solid rgba(108, 92, 231, 0.2)',
    background: 'rgba(108, 92, 231, 0.08)',
  };

  const badgeStyle: React.CSSProperties = {
    fontSize: '0.65rem',
    padding: '2px 8px',
    borderRadius: '12px',
    background: 'rgba(0, 206, 201, 0.2)',
    color: '#00cec9',
    fontWeight: 600,
    marginLeft: '8px',
  };

  const messagesStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
  };

  const inputContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    padding: '14px 20px',
    borderTop: '1px solid rgba(108, 92, 231, 0.2)',
    background: 'rgba(26, 26, 46, 0.5)',
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 16px',
    borderRadius: '10px',
    border: '1px solid rgba(108, 92, 231, 0.3)',
    background: 'rgba(255,255,255,0.06)',
    color: '#e2e8f0',
    fontSize: '0.88rem',
    outline: 'none',
  };

  const sendBtnStyle: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #6c5ce7 0%, #00cec9 100%)',
    color: '#fff',
    fontWeight: 600,
    cursor: isLoading || !inputMessage.trim() ? 'not-allowed' : 'pointer',
    opacity: isLoading || !inputMessage.trim() ? 0.5 : 1,
    fontSize: '0.88rem',
    transition: 'all 0.2s',
  };

  const chipStyle: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(108, 92, 231, 0.3)',
    background: 'rgba(108, 92, 231, 0.1)',
    color: '#a29bfe',
    cursor: 'pointer',
    fontSize: '0.8rem',
    textAlign: 'left',
    transition: 'all 0.2s',
  };

  const headerBtnStyle: React.CSSProperties = {
    padding: '6px 10px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    background: 'transparent',
    color: '#636e72',
    cursor: 'pointer',
    fontSize: '0.8rem',
    transition: 'all 0.2s',
  };

  return (
    <div style={containerStyle}>
      {/* ── Header ── */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: '1.1rem', marginRight: '8px' }}>💬</span>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem' }}>Chat with Repository</span>
          <span style={badgeStyle}>⚡ AI</span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => {
              const params = new URLSearchParams({
                repositoryId,
                sessionId,
                ...(repoUrl ? { repoUrl } : {}),
                ...(repoName ? { repoName } : {}),
              });
              window.open(`/chat?${params.toString()}`, '_blank');
            }}
            style={headerBtnStyle}
            title="Open chat in new tab"
          >
            ↗
          </button>
          <button onClick={clearChat} style={headerBtnStyle} title="Clear chat">🗑️</button>
          {onClose && <button onClick={onClose} style={headerBtnStyle} title="Close">✕</button>}
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={messagesStyle}>
        {messages.length === 0 && !streamingContent && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px', filter: 'drop-shadow(0 0 10px rgba(108,92,231,0.4))' }}>🚀</div>
            <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>
              Ask me about this repository
            </h4>
            <p style={{ color: '#636e72', fontSize: '0.85rem', marginBottom: '20px', maxWidth: '380px', margin: '0 auto 20px' }}>
              AI-powered responses with context fetched directly from the repository.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxWidth: '400px', margin: '0 auto' }}>
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInputMessage(q);
                    setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
                  }}
                  style={chipStyle}
                  onMouseOver={(e) => {
                    (e.target as HTMLElement).style.borderColor = '#6c5ce7';
                    (e.target as HTMLElement).style.boxShadow = '0 0 10px rgba(108,92,231,0.3)';
                  }}
                  onMouseOut={(e) => {
                    (e.target as HTMLElement).style.borderColor = 'rgba(108,92,231,0.3)';
                    (e.target as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Streaming response */}
        {streamingContent && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
            <div style={{ maxWidth: '80%' }}>
              <div style={{
                padding: '10px 16px',
                borderRadius: '16px 16px 16px 4px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#e2e8f0',
                fontSize: '0.88rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {streamingText}
                <span style={{ animation: 'ag-pulse 1s infinite' }}>▊</span>
                {Object.values(streamingDiagramErrors).length > 0 && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px',
                    borderRadius: '6px',
                    background: 'rgba(255, 107, 107, 0.15)',
                    border: '1px solid rgba(255, 107, 107, 0.3)',
                    color: '#ff6b6b',
                    fontSize: '0.75rem',
                  }}>
                    {Object.entries(streamingDiagramErrors).map(([id, err]) => (
                      <div key={id} style={{ marginBottom: '4px' }}>
                        ⚠️ {err}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Show placeholder for in-progress diagram */}
              {streamingHasIncomplete && (
                <div style={{
                  marginTop: '8px',
                  background: 'rgba(26, 26, 46, 0.5)',
                  borderRadius: '10px',
                  padding: '20px',
                  border: '1px solid rgba(108, 92, 231, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  minHeight: '100px',
                }}>
                  <div className="ag-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                  <span style={{ color: '#a29bfe', fontSize: '0.85rem' }}>Generating diagram…</span>
                </div>
              )}

              {/* Render only complete diagrams */}
              {streamingDiagrams.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  {streamingDiagrams.map((diagram) => (
                    <MermaidRenderer
                      key={diagram.id}
                      id={diagram.id}
                      code={diagram.code}
                      onError={(error) => setStreamingDiagramErrors(prev => ({ ...prev, [diagram.id]: error }))}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingContent && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
            <div style={{
              padding: '10px 16px',
              borderRadius: '16px 16px 16px 4px',
              background: 'rgba(108, 92, 231, 0.15)',
              border: '1px solid rgba(108, 92, 231, 0.3)',
              color: '#a29bfe',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.85rem',
            }}>
              <div className="ag-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
              Thinking...
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
            <div style={{
              padding: '10px 16px',
              borderRadius: '16px 16px 16px 4px',
              background: 'rgba(255, 107, 107, 0.15)',
              border: '1px solid rgba(255, 107, 107, 0.3)',
              color: '#ff6b6b',
              fontSize: '0.85rem',
            }}>
              {error}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div style={inputContainerStyle}>
        <input
          id="chat-input"
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ask something..."
          style={inputStyle}
          disabled={isLoading}
          onFocus={(e) => { (e.target as HTMLElement).style.borderColor = '#6c5ce7'; }}
          onBlur={(e) => { (e.target as HTMLElement).style.borderColor = 'rgba(108,92,231,0.3)'; }}
        />
        <button
          onClick={sendMessage}
          disabled={!inputMessage.trim() || isLoading}
          style={sendBtnStyle}
        >
          Send
        </button>
      </div>
    </div>
  );
}