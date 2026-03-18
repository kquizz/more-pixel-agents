import type { TodoItem } from '../office/types.js';

interface KanbanOverlayProps {
  todos: TodoItem[];
  onClose: () => void;
}

export function KanbanOverlay({ todos, onClose }: KanbanOverlayProps) {
  const pending = todos.filter((t) => t.status === 'pending');
  const inProgress = todos.filter((t) => t.status === 'in_progress');
  const completed = todos.filter((t) => t.status === 'completed');

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
          background: '#1e1e2e',
          border: '2px solid #585b70',
          borderRadius: 8,
          padding: 20,
          minWidth: 600,
          maxWidth: '80vw',
          maxHeight: '70vh',
          overflow: 'auto',
          cursor: 'default',
          color: '#cdd6f4',
          fontFamily: '"Courier New", monospace',
        }}
      >
        <h2 style={{ margin: '0 0 16px', color: '#89b4fa', fontSize: 16 }}>Kanban Board</h2>
        <div style={{ display: 'flex', gap: 16 }}>
          {renderColumn('Pending', pending, '#585b70')}
          {renderColumn('In Progress', inProgress, '#f9e2af')}
          {renderColumn('Done', completed, '#a6e3a1')}
        </div>
      </div>
    </div>
  );
}

function renderColumn(title: string, items: TodoItem[], color: string) {
  return (
    <div style={{ flex: 1, minWidth: 150 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          color,
          marginBottom: 8,
          borderBottom: `2px solid ${color}`,
          paddingBottom: 4,
        }}
      >
        {title} ({items.length})
      </div>
      {items.length === 0 && (
        <div style={{ color: '#585b70', fontSize: 11, fontStyle: 'italic' }}>None</div>
      )}
      {items.map((item) => (
        <div
          key={item.taskId}
          style={{
            background: '#313244',
            borderRadius: 4,
            padding: '6px 8px',
            marginBottom: 6,
            fontSize: 11,
            borderLeft: `3px solid ${color}`,
          }}
        >
          {item.subject}
        </div>
      ))}
    </div>
  );
}
