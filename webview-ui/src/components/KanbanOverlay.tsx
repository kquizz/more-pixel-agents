import { useState } from 'react';

import type { TodoItem } from '../office/types.js';

interface KanbanOverlayProps {
  todos: TodoItem[];
  onClose: () => void;
}

const PRIORITY_LABELS: Record<number, string> = {
  0: 'P0 Critical',
  1: 'P1 High',
  2: 'P2 Medium',
  3: 'P3 Low',
  4: 'P4 Backlog',
};

const PRIORITY_COLORS: Record<number, string> = {
  0: '#f38ba8',
  1: '#fab387',
  2: '#f9e2af',
  3: '#a6e3a1',
  4: '#585b70',
};

export function KanbanOverlay({ todos, onClose }: KanbanOverlayProps) {
  const [clearedTaskIds, setClearedTaskIds] = useState<Set<string>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
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
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 8,
          padding: 24,
          minWidth: 800,
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflow: 'auto',
          cursor: 'default',
          color: '#cdd6f4',
          fontFamily: '"Courier New", monospace',
        }}
      >
        <h2 style={{ margin: '0 0 16px', color: 'var(--pixel-accent)', fontSize: 20 }}>
          Kanban Board
        </h2>
        <div style={{ display: 'flex', gap: 20 }}>
          {renderColumn('Pending', pending, '#585b70', expandedTaskId, handleCardClick)}
          {renderColumn('In Progress', inProgress, '#f9e2af', expandedTaskId, handleCardClick)}
          {renderColumn(
            'Done',
            completed,
            '#a6e3a1',
            expandedTaskId,
            handleCardClick,
            handleClearDone,
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
) {
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 'bold',
          color,
          marginBottom: 8,
          borderBottom: `2px solid ${color}`,
          paddingBottom: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          {title} ({items.length})
        </span>
        {onClear && items.length > 0 && (
          <button
            onClick={onClear}
            style={{
              background: 'var(--pixel-bg)',
              color,
              border: `2px solid ${color}`,
              borderRadius: 0,
              padding: '2px 8px',
              fontSize: 11,
              fontFamily: '"Courier New", monospace',
              cursor: 'pointer',
              boxShadow: '2px 2px 0px #0a0a14',
            }}
          >
            Clear
          </button>
        )}
      </div>
      {items.length === 0 && (
        <div style={{ color: '#585b70', fontSize: 13, fontStyle: 'italic' }}>None</div>
      )}
      {items.map((item) => (
        <div key={item.taskId}>
          <div
            onClick={() => onCardClick(item.taskId)}
            style={{
              background: expandedTaskId === item.taskId ? '#45475a' : '#313244',
              borderRadius: 4,
              padding: '8px 12px',
              marginBottom: expandedTaskId === item.taskId ? 0 : 8,
              fontSize: 13,
              borderLeft: `3px solid ${color}`,
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
          >
            {item.subject}
            <span style={{ float: 'right', display: 'flex', gap: 4, alignItems: 'center' }}>
              {item.priority != null && (
                <span
                  style={{
                    background: 'var(--pixel-bg)',
                    border: `1px solid ${PRIORITY_COLORS[item.priority] ?? '#585b70'}`,
                    borderRadius: 0,
                    padding: '1px 5px',
                    fontSize: 10,
                    color: PRIORITY_COLORS[item.priority] ?? '#585b70',
                  }}
                >
                  P{item.priority}
                </span>
              )}
              {item.issueType && (
                <span
                  style={{
                    background: 'var(--pixel-bg)',
                    border: '1px solid var(--pixel-border)',
                    borderRadius: 0,
                    padding: '1px 5px',
                    fontSize: 10,
                    color: '#585b70',
                  }}
                >
                  {item.issueType}
                </span>
              )}
              {item.agentId != null && (
                <span
                  style={{
                    background: 'var(--pixel-bg)',
                    border: '1px solid var(--pixel-border)',
                    borderRadius: 0,
                    padding: '1px 5px',
                    fontSize: 10,
                    color: '#585b70',
                  }}
                >
                  #{item.agentId}
                </span>
              )}
            </span>
          </div>
          {expandedTaskId === item.taskId && (
            <div
              style={{
                background: '#181828',
                border: '2px solid var(--pixel-border)',
                borderTop: 'none',
                borderRadius: '0 0 4px 4px',
                padding: '10px 12px',
                marginBottom: 8,
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: '#585b70', marginBottom: 4 }}>{item.taskId}</div>
              {item.description && <div style={{ marginBottom: 6 }}>{item.description}</div>}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  color: '#585b70',
                  fontSize: 11,
                }}
              >
                {item.priority != null && (
                  <span style={{ color: PRIORITY_COLORS[item.priority] ?? '#585b70' }}>
                    {PRIORITY_LABELS[item.priority] ?? `P${item.priority}`}
                  </span>
                )}
                {item.assignee && <span>Assigned: {item.assignee}</span>}
                {item.dependencyCount != null && item.dependencyCount > 0 && (
                  <span>Blocked by: {item.dependencyCount}</span>
                )}
                {item.dependentCount != null && item.dependentCount > 0 && (
                  <span>Blocks: {item.dependentCount}</span>
                )}
                {item.createdAt && (
                  <span>Created: {new Date(item.createdAt).toLocaleDateString()}</span>
                )}
                {item.closedAt && (
                  <span>Closed: {new Date(item.closedAt).toLocaleDateString()}</span>
                )}
              </div>
              {item.closeReason && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '6px 8px',
                    background: '#313244',
                    borderLeft: '3px solid #a6e3a1',
                    fontSize: 11,
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
  );
}
