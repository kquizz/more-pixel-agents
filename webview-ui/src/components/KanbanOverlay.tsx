import { useState } from 'react';

import type { TodoItem } from '../office/types.js';

interface KanbanOverlayProps {
  todos: TodoItem[];
  onClose: () => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  0: '#f38ba8',
  1: '#fab387',
  2: '#f9e2af',
  3: '#a6e3a1',
  4: '#585b70',
};

const MAX_DONE_VISIBLE = 5;

export function KanbanOverlay({ todos, onClose }: KanbanOverlayProps) {
  const [clearedTaskIds, setClearedTaskIds] = useState<Set<string>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);

  const pending = todos.filter((t) => t.status === 'pending');
  const inProgress = todos.filter((t) => t.status === 'in_progress');
  const completed = todos.filter((t) => t.status === 'completed' && !clearedTaskIds.has(t.taskId));

  const handleClearDone = () => {
    setClearedTaskIds((prev) => {
      const next = new Set(prev);
      for (const item of completed) {
        next.add(item.taskId);
      }
      return next;
    });
  };

  const handleCardClick = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const visibleCompleted = showAllDone ? completed : completed.slice(0, MAX_DONE_VISIBLE);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        cursor: 'pointer',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1e1e2e',
          border: '3px solid #45475a',
          padding: '20px 24px',
          width: '92vw',
          maxWidth: 1100,
          maxHeight: '85vh',
          overflow: 'auto',
          cursor: 'default',
          color: '#cdd6f4',
          fontFamily: '"Courier New", monospace',
          boxShadow: '4px 4px 0px #0a0a14',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, color: '#cba6f7', fontSize: 18, letterSpacing: 1 }}>KANBAN</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '2px solid #585b70',
              color: '#585b70',
              padding: '4px 10px',
              fontSize: 14,
              fontFamily: '"Courier New", monospace',
              cursor: 'pointer',
            }}
          >
            ESC
          </button>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {renderColumn('Pending', pending, '#6c7086', expandedTaskId, handleCardClick)}
          {renderColumn('In Progress', inProgress, '#f9e2af', expandedTaskId, handleCardClick)}
          {renderColumn(
            'Done',
            visibleCompleted,
            '#a6e3a1',
            expandedTaskId,
            handleCardClick,
            handleClearDone,
            completed.length > MAX_DONE_VISIBLE && !showAllDone
              ? {
                  count: completed.length - MAX_DONE_VISIBLE,
                  onShowAll: () => setShowAllDone(true),
                }
              : undefined,
          )}
        </div>
      </div>
    </div>
  );
}

function renderColumn(
  title: string,
  items: TodoItem[],
  color: string,
  expandedTaskId: string | null,
  onCardClick: (taskId: string) => void,
  onClear?: () => void,
  showMore?: { count: number; onShowAll: () => void },
) {
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 'bold',
          color,
          marginBottom: 10,
          borderBottom: `2px solid ${color}`,
          paddingBottom: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        <span>
          {title}{' '}
          <span style={{ opacity: 0.6 }}>
            ({items.length}
            {showMore ? `+${showMore.count}` : ''})
          </span>
        </span>
        {onClear && items.length > 0 && (
          <button
            onClick={onClear}
            style={{
              background: 'none',
              color,
              border: `1px solid ${color}`,
              padding: '2px 8px',
              fontSize: 11,
              fontFamily: '"Courier New", monospace',
              cursor: 'pointer',
              opacity: 0.7,
            }}
          >
            Clear
          </button>
        )}
      </div>
      {items.length === 0 && (
        <div style={{ color: '#45475a', fontSize: 13, fontStyle: 'italic', padding: '8px 0' }}>
          None
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => (
          <div key={item.taskId}>
            <div
              onClick={() => onCardClick(item.taskId)}
              style={{
                background: expandedTaskId === item.taskId ? '#45475a' : '#313244',
                padding: '10px 12px',
                marginBottom: expandedTaskId === item.taskId ? 0 : 0,
                fontSize: 14,
                lineHeight: 1.4,
                borderLeft: `3px solid ${color}`,
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
            >
              <div style={{ marginBottom: 4 }}>{item.subject}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {item.priority != null && (
                  <span
                    style={{
                      border: `1px solid ${PRIORITY_COLORS[item.priority] ?? '#585b70'}`,
                      padding: '1px 6px',
                      fontSize: 11,
                      color: PRIORITY_COLORS[item.priority] ?? '#585b70',
                    }}
                  >
                    P{item.priority}
                  </span>
                )}
                {item.issueType && (
                  <span
                    style={{
                      border: '1px solid #45475a',
                      padding: '1px 6px',
                      fontSize: 11,
                      color: '#6c7086',
                    }}
                  >
                    {item.issueType}
                  </span>
                )}
              </div>
            </div>
            {expandedTaskId === item.taskId && (
              <div
                style={{
                  background: '#181825',
                  border: '1px solid #45475a',
                  borderTop: 'none',
                  padding: '12px',
                  marginBottom: 0,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <div style={{ color: '#585b70', marginBottom: 6, fontSize: 11 }}>{item.taskId}</div>
                {item.description && <div style={{ marginBottom: 8 }}>{item.description}</div>}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    color: '#6c7086',
                    fontSize: 12,
                  }}
                >
                  {item.assignee && <span>Assigned: {item.assignee}</span>}
                  {item.dependencyCount != null && item.dependencyCount > 0 && (
                    <span style={{ color: '#f38ba8' }}>Blocked by: {item.dependencyCount}</span>
                  )}
                  {item.dependentCount != null && item.dependentCount > 0 && (
                    <span>Blocks: {item.dependentCount}</span>
                  )}
                </div>
                {item.closeReason && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      background: '#313244',
                      borderLeft: '3px solid #a6e3a1',
                      fontSize: 12,
                      color: '#a6e3a1',
                    }}
                  >
                    {item.closeReason}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {showMore && (
        <button
          onClick={showMore.onShowAll}
          style={{
            background: 'none',
            color: '#6c7086',
            border: '1px solid #45475a',
            padding: '6px 12px',
            fontSize: 12,
            fontFamily: '"Courier New", monospace',
            cursor: 'pointer',
            width: '100%',
            marginTop: 6,
          }}
        >
          +{showMore.count} more
        </button>
      )}
    </div>
  );
}
