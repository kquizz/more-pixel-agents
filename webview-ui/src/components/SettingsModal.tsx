import { useState } from 'react';

import { isSoundEnabled, setSoundEnabled } from '../notificationSound.js';
import coworkingTemplate from '../templates/template-coworking.json';
import enterpriseTemplate from '../templates/template-enterprise.json';
import gamingTemplate from '../templates/template-gaming.json';
import startupTemplate from '../templates/template-startup.json';
import { vscode } from '../vscodeApi.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
  alwaysShowOverlay: boolean;
  onToggleAlwaysShowOverlay: () => void;
  showActiveLabels: boolean;
  onToggleShowActiveLabels: () => void;
}

const TEMPLATES = [
  { id: 'startup', name: 'Startup', description: '3 desks, couch, cozy', layout: startupTemplate },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: '6 desks, meeting room, lounge',
    layout: enterpriseTemplate,
  },
  {
    id: 'coworking',
    name: 'Coworking',
    description: 'Open plan, mixed seating, plants',
    layout: coworkingTemplate,
  },
  {
    id: 'gaming',
    name: 'Gaming Studio',
    description: 'U-shape PCs, fish tank, lounge',
    layout: gamingTemplate,
  },
] as const;

const menuItemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  padding: '6px 10px',
  fontSize: '24px',
  color: 'rgba(255, 255, 255, 0.8)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
};

const templateBtnBase: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  width: '100%',
  padding: '6px 10px',
  fontSize: '20px',
  color: 'rgba(255, 255, 255, 0.8)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  cursor: 'pointer',
  textAlign: 'left',
};

export function SettingsModal({
  isOpen,
  onClose,
  isDebugMode,
  onToggleDebugMode,
  alwaysShowOverlay,
  onToggleAlwaysShowOverlay,
  showActiveLabels,
  onToggleShowActiveLabels,
}: SettingsModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [soundLocal, setSoundLocal] = useState(isSoundEnabled);
  const [confirmTemplate, setConfirmTemplate] = useState<string | null>(null);

  if (!isOpen) return null;

  const applyTemplate = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    vscode.postMessage({
      type: 'applyTemplateLayout',
      layout: template.layout,
      templateName: template.name,
    });
    setConfirmTemplate(null);
    onClose();
  };

  return (
    <>
      {/* Dark backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 49,
        }}
      />
      {/* Centered modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          background: 'var(--pixel-bg)',
          border: '2px solid var(--pixel-border)',
          borderRadius: 0,
          padding: '4px',
          boxShadow: 'var(--pixel-shadow)',
          minWidth: 200,
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        {/* Header with title and X button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
            borderBottom: '1px solid var(--pixel-border)',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: '24px', color: 'rgba(255, 255, 255, 0.9)' }}>Settings</span>
          <button
            onClick={onClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            style={{
              background: hovered === 'close' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>
        {/* Menu items */}
        <button
          onClick={() => {
            vscode.postMessage({ type: 'openSessionsFolder' });
            onClose();
          }}
          onMouseEnter={() => setHovered('sessions')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'sessions' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Open Sessions Folder
        </button>
        <button
          onClick={() => {
            vscode.postMessage({ type: 'exportLayout' });
            onClose();
          }}
          onMouseEnter={() => setHovered('export')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'export' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Export Layout
        </button>
        <button
          onClick={() => {
            vscode.postMessage({ type: 'importLayout' });
            onClose();
          }}
          onMouseEnter={() => setHovered('import')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'import' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          Import Layout
        </button>
        <button
          onClick={() => {
            const newVal = !isSoundEnabled();
            setSoundEnabled(newVal);
            setSoundLocal(newVal);
            vscode.postMessage({ type: 'setSoundEnabled', enabled: newVal });
          }}
          onMouseEnter={() => setHovered('sound')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'sound' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Sound Notifications</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: soundLocal ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {soundLocal ? 'X' : ''}
          </span>
        </button>
        <button
          onClick={onToggleAlwaysShowOverlay}
          onMouseEnter={() => setHovered('overlay')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'overlay' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Always Show Labels</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: alwaysShowOverlay ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {alwaysShowOverlay ? 'X' : ''}
          </span>
        </button>
        <button
          onClick={onToggleShowActiveLabels}
          onMouseEnter={() => setHovered('activeLabels')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'activeLabels' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Show Active Labels</span>
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid rgba(255, 255, 255, 0.5)',
              borderRadius: 0,
              background: showActiveLabels ? 'rgba(90, 140, 255, 0.8)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              lineHeight: 1,
              color: '#fff',
            }}
          >
            {showActiveLabels ? 'X' : ''}
          </span>
        </button>
        <button
          onClick={onToggleDebugMode}
          onMouseEnter={() => setHovered('debug')}
          onMouseLeave={() => setHovered(null)}
          style={{
            ...menuItemBase,
            background: hovered === 'debug' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
        >
          <span>Debug View</span>
          {isDebugMode && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(90, 140, 255, 0.8)',
                flexShrink: 0,
              }}
            />
          )}
        </button>

        {/* Layout Templates section */}
        <div
          style={{
            borderTop: '1px solid var(--pixel-border)',
            marginTop: '4px',
            paddingTop: '4px',
          }}
        >
          <div
            style={{
              padding: '4px 10px',
              fontSize: '18px',
              color: 'rgba(255, 255, 255, 0.5)',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            Layout Templates
          </div>
          {TEMPLATES.map((template) => (
            <div key={template.id}>
              {confirmTemplate === template.id ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: 'rgba(255, 180, 50, 0.1)',
                  }}
                >
                  <span style={{ fontSize: '18px', color: 'rgba(255, 200, 100, 0.9)' }}>
                    Replace current layout?
                  </span>
                  <span style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => applyTemplate(template.id)}
                      onMouseEnter={() => setHovered(`confirm-${template.id}`)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        background:
                          hovered === `confirm-${template.id}`
                            ? 'rgba(90, 200, 90, 0.3)'
                            : 'rgba(90, 200, 90, 0.15)',
                        border: '1px solid rgba(90, 200, 90, 0.5)',
                        borderRadius: 0,
                        color: 'rgba(90, 200, 90, 0.9)',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '2px 8px',
                      }}
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setConfirmTemplate(null)}
                      onMouseEnter={() => setHovered(`cancel-${template.id}`)}
                      onMouseLeave={() => setHovered(null)}
                      style={{
                        background:
                          hovered === `cancel-${template.id}`
                            ? 'rgba(255, 100, 100, 0.3)'
                            : 'rgba(255, 100, 100, 0.15)',
                        border: '1px solid rgba(255, 100, 100, 0.5)',
                        borderRadius: 0,
                        color: 'rgba(255, 100, 100, 0.9)',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '2px 8px',
                      }}
                    >
                      Cancel
                    </button>
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmTemplate(template.id)}
                  onMouseEnter={() => setHovered(`template-${template.id}`)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    ...templateBtnBase,
                    background:
                      hovered === `template-${template.id}`
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'transparent',
                  }}
                >
                  <span>{template.name}</span>
                  <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.4)' }}>
                    {template.description}
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
