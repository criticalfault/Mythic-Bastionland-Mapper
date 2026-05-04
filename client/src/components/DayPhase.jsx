import React from 'react';
import socket from '../socket.js';

const PHASES = [
  {
    key: 'morning',
    label: 'Morning',
    icon: '☀️',
    color: '#f5c842',
    glow: 'rgba(245,200,66,0.25)',
    bg: 'rgba(245,200,66,0.10)',
    border: 'rgba(245,200,66,0.35)',
  },
  {
    key: 'afternoon',
    label: 'Afternoon',
    icon: '🌤',
    color: '#f97316',
    glow: 'rgba(249,115,22,0.25)',
    bg: 'rgba(249,115,22,0.10)',
    border: 'rgba(249,115,22,0.35)',
  },
  {
    key: 'night',
    label: 'Night',
    icon: '🌙',
    color: '#818cf8',
    glow: 'rgba(129,140,248,0.25)',
    bg: 'rgba(129,140,248,0.10)',
    border: 'rgba(129,140,248,0.35)',
  },
];

export default function DayPhase({ dayPhase, isGM }) {
  const current = PHASES.find(p => p.key === dayPhase) || PHASES[0];

  return (
    <div className="day-phase-panel" title={isGM ? 'Click a phase to change the time of day' : undefined}>
      <div className="day-phase-title">Day Phase</div>
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
              boxShadow: `0 0 10px ${phase.glow}`,
            } : {}}
            onClick={isGM ? () => socket.emit('time:set', { phase: phase.key }) : undefined}
            disabled={!isGM}
            aria-current={isActive ? 'true' : undefined}
            aria-label={`${phase.label}${isActive ? ' (current)' : ''}`}
          >
            <span className="day-phase-icon">{phase.icon}</span>
            <span className="day-phase-label">{phase.label}</span>
            {isActive && <span className="day-phase-dot" style={{ background: phase.color }} />}
          </button>
        );
      })}
    </div>
  );
}
