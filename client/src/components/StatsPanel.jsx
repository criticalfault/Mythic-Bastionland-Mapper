import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';

const STAT_DEFS = [
  { key: 'vigor',   label: 'Vigor',   color: '#c0392b', track: 'rgba(192,57,43,0.2)'  },
  { key: 'clarity', label: 'Clarity', color: '#27ae60', track: 'rgba(39,174,96,0.2)'  },
  { key: 'spirit',  label: 'Spirit',  color: '#2980b9', track: 'rgba(41,128,185,0.2)' },
  { key: 'guard',   label: 'Guard',   color: '#c8b560', track: 'rgba(200,181,96,0.2)' },
];

const DEFAULT_STATS = {
  vigor:   { current: 10, max: 10 },
  clarity: { current: 10, max: 10 },
  spirit:  { current: 10, max: 10 },
  guard:   { current:  3, max:  3 },
};

function roll(sides) {
  // Use the browser's CSPRNG (OS entropy pool) instead of Math.random()
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export default function StatsPanel({ authUser, initialStats, initialLocked }) {
  const [open, setOpen]             = useState(false);
  const [stats, setStats]           = useState(() => initialStats ?? DEFAULT_STATS);
  const [locked, setLocked]         = useState(() => initialLocked ?? false);
  const [editingMax, setEditingMax] = useState(null); // key of stat whose max is being edited
  const emitTimeout                 = useRef(null);

  // Sync when server sends saved stats back (e.g. on rejoin)
  useEffect(() => {
    if (initialStats) setStats(initialStats);
  }, [initialStats]);

  useEffect(() => {
    setLocked(initialLocked ?? false);
  }, [initialLocked]);

  // Debounced emit — batch rapid +/− clicks into one socket message
  const emitStats = (next) => {
    clearTimeout(emitTimeout.current);
    emitTimeout.current = setTimeout(() => {
      socket.emit('charSheet:update', { stats: next });
    }, 300);
  };

  const adjustCurrent = (key, delta) => {
    if (locked) return;
    setStats(prev => {
      const s = prev[key];
      const next = {
        ...prev,
        [key]: { ...s, current: clamp(s.current + delta, 0, s.max) },
      };
      emitStats(next);
      return next;
    });
  };

  const commitMax = (key, raw) => {
    if (locked) { setEditingMax(null); return; }
    const v = clamp(parseInt(raw) || 1, 1, 20);
    setStats(prev => {
      const next = {
        ...prev,
        [key]: { max: v, current: clamp(prev[key].current, 0, v) },
      };
      emitStats(next);
      return next;
    });
    setEditingMax(null);
  };

  const rollAll = () => {
    if (locked) return;
    const next = {
      vigor:   { max: roll(6) + roll(12), current: 0 },
      clarity: { max: roll(6) + roll(12), current: 0 },
      spirit:  { max: roll(6) + roll(12), current: 0 },
      guard:   { max: roll(6),            current: 0 },
    };
    // Set current = max on a fresh roll
    Object.keys(next).forEach(k => { next[k].current = next[k].max; });
    setStats(next);
    socket.emit('charSheet:update', { stats: next });
  };

  const handleSubmit = () => {
    if (locked) return;
    if (!confirm('Submit your character? This locks your stats — you won\'t be able to re-roll. The GM can still adjust your values during play.')) return;
    // Send current stats one last time, then lock
    socket.emit('charSheet:update', { stats });
    // Small delay so the update lands before lock
    setTimeout(() => {
      socket.emit('charSheet:lock');
    }, 350);
    setLocked(true);
  };

  return (
    <div className={`stats-panel${open ? ' stats-panel--open' : ''}`}>

      {/* ── Pull-up handle ── */}
      <button
        className="stats-handle"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close character stats' : 'Open character stats'}
      >
        <span className="stats-handle-notch" />
        <span className="stats-handle-label">
          {/* Mini colour pips when closed */}
          {!open && (
            <span className="stats-mini-pips" aria-hidden="true">
              {STAT_DEFS.map(({ key, color }) => {
                const s = stats[key];
                const pct = s.max > 0 ? s.current / s.max : 0;
                return (
                  <span
                    key={key}
                    className="stats-mini-pip"
                    style={{ background: color, opacity: 0.4 + pct * 0.6 }}
                  />
                );
              })}
            </span>
          )}
          <span>Character{locked ? ' 🔒' : ''}</span>
          <span className="stats-handle-chevron">{open ? '▾' : '▴'}</span>
        </span>
      </button>

      {/* ── Panel body ── */}
      {open && (
        <div className="stats-body">

          <div className="stats-top-row">
            <span className="stats-player-name">{authUser.displayName}</span>
            {locked ? (
              <span className="stats-locked-badge">⚔ Character Submitted</span>
            ) : (
              <button className="stats-roll-btn" onClick={rollAll} title="Roll all stats fresh (d6+d12, d6+d12, d6+d12, d6)">
                🎲 Roll Stats
              </button>
            )}
          </div>

          <div className="stats-rows">
            {STAT_DEFS.map(({ key, label, color, track }) => {
              const { current, max } = stats[key];
              const pct = max > 0 ? (current / max) * 100 : 0;

              return (
                <div key={key} className="stat-row">

                  {/* Label */}
                  <span className="stat-label" style={{ color }}>{label}</span>

                  {/* Decrease */}
                  <button
                    className="stat-adj stat-adj--minus"
                    onClick={() => adjustCurrent(key, -1)}
                    disabled={current <= 0}
                    aria-label={`Decrease ${label}`}
                  >−</button>

                  {/* Progress bar */}
                  <div className="stat-bar-track" style={{ background: track }} aria-label={`${label} ${current} of ${max}`}>
                    <div
                      className="stat-bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: color,
                        boxShadow: `0 0 6px ${color}88`,
                      }}
                    />
                  </div>

                  {/* Increase */}
                  <button
                    className="stat-adj stat-adj--plus"
                    onClick={() => adjustCurrent(key, +1)}
                    disabled={current >= max}
                    aria-label={`Increase ${label}`}
                  >+</button>

                  {/* Current / Max */}
                  <span className="stat-fraction">
                    <span className="stat-current">{current}</span>
                    <span className="stat-sep">/</span>
                    {!locked && editingMax === key ? (
                      <input
                        className="stat-max-input"
                        type="number"
                        min="1"
                        max="20"
                        defaultValue={max}
                        autoFocus
                        onBlur={e => commitMax(key, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  commitMax(key, e.target.value);
                          if (e.key === 'Escape') setEditingMax(null);
                        }}
                      />
                    ) : (
                      <button
                        className="stat-max"
                        onClick={() => { if (!locked) setEditingMax(key); }}
                        title={locked ? 'Locked' : 'Click to edit maximum'}
                        style={locked ? { cursor: 'default', opacity: 0.7 } : {}}
                      >{max}</button>
                    )}
                  </span>

                </div>
              );
            })}
          </div>

          {locked ? (
            <p className="stats-hint">Your character is submitted. The GM can adjust your stats during play.</p>
          ) : (
            <>
              <p className="stats-hint">Click the max value to edit it. +/− adjusts current.</p>
              <button className="stats-submit-btn" onClick={handleSubmit}>
                ⚔ Submit Character
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
