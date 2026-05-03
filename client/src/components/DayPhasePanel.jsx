import React from 'react';

const PHASES = [
  {
    id: 'morning',
    label: 'Morning',
    icon: '🌅',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.15)',
    border: 'rgba(249,115,22,0.5)',
  },
  {
    id: 'afternoon',
    label: 'Afternoon',
    icon: '☀️',
    color: '#c8b560',
    bg: 'rgba(200,181,96,0.15)',
    border: 'rgba(200,181,96,0.5)',
  },
  {
    id: 'night',
    label: 'Night',
    icon: '🌙',
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.15)',
    border: 'rgba(129,140,248,0.5)',
  },
];

export default function DayPhasePanel({ dayPhase, isGM, onSetPhase }) {
  return (
    <div className="day-phase-panel">
      {PHASES.map(p => {
        const active = dayPhase === p.id;
        return (
          <button
            key={p.id}
            className={`day-phase-item${active ? ' active' : ''}`}
            style={active ? {
              background: p.bg,
              borderColor: p.border,
              color: p.color,
            } : {}}
            onClick={() => isGM && onSetPhase(p.id)}
            title={isGM ? `Set phase: ${p.label}` : p.label}
            disabled={!isGM || active}
          >
            <span className="day-phase-icon">{p.icon}</span>
            <span className="day-phase-label">{p.label}</span>
            {active && <span className="day-phase-pip" style={{ background: p.color }} />}
          </button>
        );
      })}
    </div>
  );
}
