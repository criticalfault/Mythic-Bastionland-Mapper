import React, { useState } from 'react';
import socket from '../socket.js';

const DIE_TYPES = [4, 6, 8, 10, 12, 20];
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e8e0cc'];
const GM_COLOR = '#c8b560';

function getIdentity() {
  try { return JSON.parse(localStorage.getItem('mb-dice-id') || '{}'); } catch { return {}; }
}

export default function DicePanel({ isGM, onClose }) {
  const stored = getIdentity();
  const [counts, setCounts] = useState({ 4:0, 6:0, 8:0, 12:0, 20:0 });
  const [name, setName] = useState(stored.name || '');
  const [color, setColor] = useState(stored.color || COLORS[1]);
  const [rolling, setRolling] = useState(false);

  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  const handleRoll = () => {
    if (total === 0 || rolling) return;
    const dice = DIE_TYPES.filter(t => counts[t] > 0).map(t => ({ type: t, count: counts[t] }));
    const rollerName = isGM ? 'GM' : (name.trim() || 'Player');
    const rollerColor = isGM ? GM_COLOR : color;
    if (!isGM) localStorage.setItem('mb-dice-id', JSON.stringify({ name: rollerName, color }));
    socket.emit('dice:roll', { dice, rollerName, rollerColor });
    setRolling(true);
    setTimeout(() => setRolling(false), 1500);
  };

  return (
    <aside className="dice-panel">
      <div className="dice-panel-head">
        <span className="dice-panel-title">🎲 Dice Roller</span>
        <button className="dice-close" onClick={onClose}>✕</button>
      </div>

      <div className="die-rows">
        {DIE_TYPES.map(type => (
          <div key={type} className="die-row">
            <span className="die-row-label">d{type}</span>
            <div className="die-count-group">
              {[0,1,2,3,4,5].map(n => (
                <button
                  key={n}
                  className={`die-count-btn${counts[type] === n ? ' active' : ''}`}
                  onClick={() => setCounts(p => ({ ...p, [type]: n }))}
                >{n === 0 ? '—' : n}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {!isGM && (
        <div className="dice-identity">
          <input
            className="text-input"
            placeholder="Your name…"
            value={name}
            maxLength={30}
            onChange={e => setName(e.target.value)}
          />
          <div className="color-swatches">
            {COLORS.map(c => (
              <button key={c} className={`color-swatch${color === c ? ' selected' : ''}`}
                style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
      )}

      <button className="btn-primary roll-btn" disabled={total === 0 || rolling} onClick={handleRoll}>
        {rolling ? 'Rolling…' : total === 0 ? 'Select dice above' : `Roll ${total} ${total === 1 ? 'Die' : 'Dice'}`}
      </button>
    </aside>
  );
}
