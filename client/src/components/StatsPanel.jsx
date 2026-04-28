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

function cryptoRoll(sides) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export default function StatsPanel({ authUser, initialStats, initialLocked, initialCharacterName, initialStatMethod }) {
  const [open, setOpen]               = useState(false);
  const [stats, setStats]             = useState(() => initialStats ?? DEFAULT_STATS);
  const [locked, setLocked]           = useState(() => initialLocked ?? false);
  const [characterName, setCharacterName] = useState(() => initialCharacterName ?? '');
  const [statMethod, setStatMethod]   = useState(() => initialStatMethod ?? null);
  const [entryMode, setEntryMode]     = useState(false); // manual entry form
  const [editingMax, setEditingMax]   = useState(null);  // key in normal mode
  // Local draft for entry mode (so we can edit all fields before emitting)
  const [draft, setDraft]             = useState(null);
  const emitTimeout                   = useRef(null);
  const nameTimeout                   = useRef(null);

  useEffect(() => { if (initialStats)       setStats(initialStats);            }, [initialStats]);
  useEffect(() => { setLocked(initialLocked ?? false);                         }, [initialLocked]);
  useEffect(() => { setCharacterName(initialCharacterName ?? '');              }, [initialCharacterName]);
  useEffect(() => { setStatMethod(initialStatMethod ?? null);                  }, [initialStatMethod]);

  // ── Emit helpers ──────────────────────────────────────────────────────────

  const emitStats = (nextStats, method, name) => {
    clearTimeout(emitTimeout.current);
    emitTimeout.current = setTimeout(() => {
      socket.emit('charSheet:update', {
        stats: nextStats,
        characterName: name ?? characterName,
        statMethod: method ?? statMethod,
      });
    }, 300);
  };

  const emitName = (name) => {
    clearTimeout(nameTimeout.current);
    nameTimeout.current = setTimeout(() => {
      socket.emit('charSheet:update', { stats, characterName: name, statMethod });
    }, 400);
  };

  // ── Normal mode: +/− current ──────────────────────────────────────────────

  const adjustCurrent = (key, delta) => {
    if (locked) return;
    setStats(prev => {
      const s = prev[key];
      const next = { ...prev, [key]: { ...s, current: clamp(s.current + delta, 0, s.max) } };
      emitStats(next, statMethod);
      return next;
    });
  };

  // ── Normal mode: click max to edit inline ─────────────────────────────────

  const commitMax = (key, raw) => {
    if (locked) { setEditingMax(null); return; }
    const v = clamp(parseInt(raw) || 1, 1, 20);
    const method = 'manual';
    setStats(prev => {
      const next = { ...prev, [key]: { max: v, current: clamp(prev[key].current, 0, v) } };
      emitStats(next, method);
      return next;
    });
    setStatMethod(method);
    setEditingMax(null);
  };

  // ── Roll all ──────────────────────────────────────────────────────────────

  const rollAll = () => {
    if (locked) return;
    const next = {
      vigor:   { max: cryptoRoll(6) + cryptoRoll(12), current: 0 },
      clarity: { max: cryptoRoll(6) + cryptoRoll(12), current: 0 },
      spirit:  { max: cryptoRoll(6) + cryptoRoll(12), current: 0 },
      guard:   { max: cryptoRoll(6),                  current: 0 },
    };
    Object.keys(next).forEach(k => { next[k].current = next[k].max; });
    const method = 'rolled';
    setStats(next);
    setStatMethod(method);
    setEntryMode(false);
    socket.emit('charSheet:update', { stats: next, characterName, statMethod: method });
  };

  // ── Manual entry mode ─────────────────────────────────────────────────────

  const openEntryMode = () => {
    setDraft(structuredClone(stats)); // start from current values
    setEntryMode(true);
  };

  const cancelEntryMode = () => {
    setEntryMode(false);
    setDraft(null);
  };

  const updateDraft = (key, field, raw) => {
    const v = parseInt(raw) || 0;
    setDraft(prev => {
      const next = { ...prev, [key]: { ...prev[key], [field]: v } };
      return next;
    });
  };

  const commitEntry = () => {
    // Clamp all values to valid ranges
    const next = {};
    for (const { key } of STAT_DEFS) {
      const d = draft[key] || stats[key];
      const max     = clamp(d.max     || 1, 1, 20);
      const current = clamp(d.current || 0, 0, max);
      next[key] = { max, current };
    }
    const method = 'manual';
    setStats(next);
    setStatMethod(method);
    setEntryMode(false);
    setDraft(null);
    socket.emit('charSheet:update', { stats: next, characterName, statMethod: method });
  };

  // ── Character name ────────────────────────────────────────────────────────

  const handleNameChange = (e) => {
    const val = e.target.value;
    setCharacterName(val);
    emitName(val);
  };

  // ── Submit / lock ─────────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (locked) return;
    if (!confirm('Submit your character? This locks your stats — you won\'t be able to re-roll. The GM can still adjust your values during play.')) return;
    socket.emit('charSheet:update', { stats, characterName, statMethod });
    setTimeout(() => socket.emit('charSheet:lock'), 350);
    setLocked(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`stats-panel${open ? ' stats-panel--open' : ''}`}>

      {/* Pull-up handle */}
      <button
        className="stats-handle"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close character stats' : 'Open character stats'}
      >
        <span className="stats-handle-notch" />
        <span className="stats-handle-label">
          {!open && (
            <span className="stats-mini-pips" aria-hidden="true">
              {STAT_DEFS.map(({ key, color }) => {
                const s = stats[key];
                const pct = s.max > 0 ? s.current / s.max : 0;
                return <span key={key} className="stats-mini-pip" style={{ background: color, opacity: 0.4 + pct * 0.6 }} />;
              })}
            </span>
          )}
          <span>Character{locked ? ' 🔒' : ''}</span>
          <span className="stats-handle-chevron">{open ? '▾' : '▴'}</span>
        </span>
      </button>

      {/* Panel body */}
      {open && (
        <div className="stats-body">

          {/* Name row */}
          <div className="stats-top-row">
            <div className="stats-name-wrap">
              <input
                className="stats-player-name-input"
                value={characterName}
                onChange={handleNameChange}
                placeholder={authUser.displayName}
                maxLength={40}
                aria-label="Character name"
              />
              <span className="stats-name-edit-icon" aria-hidden="true">✎</span>
            </div>
            {locked ? (
              <span className="stats-locked-badge">⚔ Character Submitted</span>
            ) : entryMode ? (
              <span className="stats-mode-tag manual-tag">✍ Manual</span>
            ) : statMethod === 'rolled' ? (
              <span className="stats-mode-tag rolled-tag">🎲 Rolled</span>
            ) : statMethod === 'manual' ? (
              <span className="stats-mode-tag manual-tag">✍ Manual</span>
            ) : null}
          </div>

          {/* Action buttons (hidden when locked) */}
          {!locked && (
            <div className="stats-action-row">
              {entryMode ? (
                <>
                  <button className="stats-action-btn stats-action-confirm" onClick={commitEntry}>✓ Save</button>
                  <button className="stats-action-btn stats-action-cancel"  onClick={cancelEntryMode}>✕ Cancel</button>
                </>
              ) : (
                <>
                  <button className="stats-action-btn stats-roll-btn" onClick={rollAll} title="Roll all stats (d6+d12 × 3, d6 guard)">🎲 Roll Stats</button>
                  <button className="stats-action-btn stats-enter-btn" onClick={openEntryMode} title="Enter stats manually">✍ Enter Stats</button>
                </>
              )}
            </div>
          )}

          {/* ── MANUAL ENTRY FORM ── */}
          {entryMode && draft && (
            <div className="stats-entry-form">
              {STAT_DEFS.map(({ key, label, color }) => (
                <div key={key} className="stats-entry-row">
                  <span className="stats-entry-label" style={{ color }}>{label}</span>
                  <div className="stats-entry-fields">
                    <div className="stats-entry-field">
                      <label className="stats-entry-sublabel">Current</label>
                      <input
                        className="stats-entry-input"
                        type="number"
                        min="0"
                        max="20"
                        value={draft[key]?.current ?? ''}
                        onChange={e => updateDraft(key, 'current', e.target.value)}
                      />
                    </div>
                    <span className="stats-entry-sep">/</span>
                    <div className="stats-entry-field">
                      <label className="stats-entry-sublabel">Max</label>
                      <input
                        className="stats-entry-input"
                        type="number"
                        min="1"
                        max="20"
                        value={draft[key]?.max ?? ''}
                        onChange={e => updateDraft(key, 'max', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <p className="stats-hint" style={{ marginTop: 4 }}>Enter your current and maximum values, then click ✓ Save.</p>
            </div>
          )}

          {/* ── NORMAL STAT BARS ── */}
          {!entryMode && (
            <div className="stats-rows">
              {STAT_DEFS.map(({ key, label, color, track }) => {
                const { current, max } = stats[key];
                const pct = max > 0 ? (current / max) * 100 : 0;
                return (
                  <div key={key} className="stat-row">
                    <span className="stat-label" style={{ color }}>{label}</span>
                    <button className="stat-adj stat-adj--minus" onClick={() => adjustCurrent(key, -1)} disabled={current <= 0} aria-label={`Decrease ${label}`}>−</button>
                    <div className="stat-bar-track" style={{ background: track }} aria-label={`${label} ${current} of ${max}`}>
                      <div className="stat-bar-fill" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}88` }} />
                    </div>
                    <button className="stat-adj stat-adj--plus"  onClick={() => adjustCurrent(key, +1)} disabled={current >= max} aria-label={`Increase ${label}`}>+</button>
                    <span className="stat-fraction">
                      <span className="stat-current">{current}</span>
                      <span className="stat-sep">/</span>
                      {!locked && editingMax === key ? (
                        <input
                          className="stat-max-input"
                          type="number" min="1" max="20"
                          defaultValue={max}
                          autoFocus
                          onBlur={e => commitMax(key, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitMax(key, e.target.value); if (e.key === 'Escape') setEditingMax(null); }}
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
          )}

          {/* Footer */}
          {locked ? (
            <p className="stats-hint">Your character is submitted. The GM can adjust your stats during play.</p>
          ) : entryMode ? null : (
            <>
              <p className="stats-hint">Click a max value to edit it. +/− adjusts current.</p>
              <button className="stats-submit-btn" onClick={handleSubmit}>⚔ Submit Character</button>
            </>
          )}

        </div>
      )}
    </div>
  );
}
