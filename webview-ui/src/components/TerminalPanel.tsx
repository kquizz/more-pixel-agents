import { useEffect, useRef, useState } from 'react';

export interface TerminalMessage {
  role: string;
  text?: string;
  tools?: Array<{ name: string; status: string }>;
  timestamp: number;
}

interface TerminalPanelProps {
  agentId: number | null;
  agentLabel: string;
  messages: TerminalMessage[];
  onClose: () => void;
  onFocusTerminal?: (agentId: number) => void;
}

export function TerminalPanel({ agentId, agentLabel, messages, onClose }: TerminalPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState('');

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (agentId === null) return null;

  const handleSend = () => {
    if (!inputText.trim()) return;
    // TODO: send input to the agent's terminal via server
    console.log(`[Terminal] Would send to agent ${agentId}: ${inputText}`);
    setInputText('');
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '40%',
        minHeight: 220,
        background: '#0d0d1a',
        borderTop: '3px solid #45475a',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Courier New", monospace',
        color: '#cdd6f4',
        zIndex: 60,
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          background: '#1e1e2e',
          borderBottom: '1px solid #45475a',
          flexShrink: 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#89b4fa', fontSize: 14, fontWeight: 'bold' }}>
            Agent #{agentId}
          </span>
          {agentLabel && <span style={{ color: '#cba6f7', fontSize: 13 }}>{agentLabel}</span>}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #585b70',
            color: '#6c7086',
            padding: '3px 10px',
            fontSize: 12,
            fontFamily: '"Courier New", monospace',
            cursor: 'pointer',
          }}
        >
          ESC
        </button>
      </div>

      {/* Message stream */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px 16px',
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#45475a', fontStyle: 'italic', padding: '20px 0', fontSize: 14 }}>
            Waiting for agent output...
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            {msg.text && (
              <div
                style={{
                  color: msg.role === 'assistant' ? '#cdd6f4' : '#a6e3a1',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.text}
              </div>
            )}
            {msg.tools && msg.tools.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {msg.tools.map((tool, j) => (
                  <div
                    key={j}
                    style={{
                      color: '#f9e2af',
                      padding: '4px 10px',
                      borderLeft: '3px solid #f9e2af',
                      marginTop: 4,
                      fontSize: 13,
                      background: 'rgba(249, 226, 175, 0.05)',
                    }}
                  >
                    {tool.status}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '8px 16px',
          background: '#1e1e2e',
          borderTop: '1px solid #45475a',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder="Type a response to the agent..."
          style={{
            flex: 1,
            background: '#181825',
            border: '1px solid #45475a',
            color: '#cdd6f4',
            padding: '8px 12px',
            fontSize: 14,
            fontFamily: '"Courier New", monospace',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          style={{
            background: '#89b4fa',
            border: 'none',
            color: '#1e1e2e',
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 'bold',
            fontFamily: '"Courier New", monospace',
            cursor: 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
