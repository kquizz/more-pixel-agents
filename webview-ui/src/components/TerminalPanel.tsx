import { useEffect, useRef } from 'react';

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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (agentId === null) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '40%',
        minHeight: 200,
        background: '#0d0d1a',
        borderTop: '3px solid #45475a',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Courier New", monospace',
        fontSize: 13,
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
          padding: '6px 12px',
          background: '#1e1e2e',
          borderBottom: '1px solid #45475a',
          flexShrink: 0,
        }}
      >
        <span>
          <span style={{ color: '#89b4fa' }}>Agent #{agentId}</span>
          {agentLabel && <span style={{ color: '#6c7086', marginLeft: 8 }}>{agentLabel}</span>}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #45475a',
            color: '#6c7086',
            padding: '2px 8px',
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
          padding: '8px 12px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#45475a', fontStyle: 'italic', padding: '20px 0' }}>
            Waiting for agent output...
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            {msg.text && (
              <div
                style={{
                  color: msg.role === 'assistant' ? '#cdd6f4' : '#a6e3a1',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                }}
              >
                {msg.text}
              </div>
            )}
            {msg.tools && msg.tools.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {msg.tools.map((tool, j) => (
                  <div
                    key={j}
                    style={{
                      color: '#f9e2af',
                      padding: '2px 0',
                      borderLeft: '2px solid #f9e2af',
                      paddingLeft: 8,
                      marginTop: 2,
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
    </div>
  );
}
