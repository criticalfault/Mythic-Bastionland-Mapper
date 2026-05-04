import React, { useState, useRef, useEffect } from 'react';
import socket from '../socket.js';

const PHASES = [
  { key: 'morning',   label: 'Morning',   icon: '☀️',  color: '#f5c842', bg: 'rgba(245,200,66,0.14)',  border: 'rgba(245,200,66,0.45)'  },
  { key: 'afternoon', label: 'Afternoon', icon: '🌤',  color: '#f97316', bg: 'rgba(249,115,22,0.14)',  border: 'rgba(249,115,22,0.45)'  },
  { key: 'night',     label: 'Night',     icon: '🌙',  color: '#818cf8', bg: 'rgba(129,140,248,0.14)', border: 'rgba(129,140,248,0.45)' },
];

export default function DayPhase({ dayPhase, isGM }) {
  const [pos, setPos] = useState(null); // null = inline in header
  const panelRef = useRef(null);
  const dragState = useRef(null); // tracks pointer-down info

  // ── Drag (only activates after moving >6px) ────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.startMX;
      const dy = e.clientY - dragState.current.startMY;
      if (!dragState.current.dragging) {
        if (dx * dx + dy * dy < 36) return; // 6px dead zone — clicks pass through
        dragState.current.dragging = true;
      }
      setPos({
        x: dragState.current.startPX + dx,
        y: dragState.current.startPY + dy,
      });
    };
    const onUp = () => { dragState.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onHandleMouseDown = (e) => {
    if (e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragState.current = {
      startMX: e.clientX,
      startMY: e.clientY,
      startPX: pos?.x ?? rect.left,
      startPY: pos?.y ?? rect.top,
      dragging: false,
    };
    // Do NOT call e.preventDefault() here — that would swallow clicks on children
  };

  const isFloating = pos !== null;

  return (
    <div
      ref={panelRef}
      className={`day-phase-widget${isFloating ? ' day-phase-widget--floating' : ''}`}
      style={isFloating ? { position: 'fixed', left: pos.x, top: pos.y } : {}}
    >
      {/* Drag handle — always present, drag grip style */}
      <div
        className="day-phase-handle"
        onMouseDown={onHandleMouseDown}
        title="Drag to detach"
      >
        <span className="day-phase-handle-label">
          {isFloating ? 'Day Phase' : '⠿'}
        </span>
        {isFloating && (
          <button
            className="day-phase-dock-btn"
            title="Dock back to header"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setPos(null)}
          >✕</button>
        )}
      </div>

      {/* Phase buttons */}
      <div className="day-phase-btns">
        {PHASES.map(phase => {
          const isActive = phase.key === dayPhase;
          return (
            <button
              key={phase.key}
              className={`day-phase-btn${isActive ? ' active' : ''}`}
              style={isActive ? {
                background: phase.bg,
                borderColor: phase.border,
                color: phase.color,
              } : {}}
              onClick={isGM ? () => socket.emit('time:set', { phase: phase.key }) : undefined}
              disabled={!isGM}
              title={isGM ? `Set to ${phase.label}` : phase.label}
            >
              <span className="day-phase-icon">{phase.icon}</span>
              {isFloating && <span className="day-phase-label">{phase.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
