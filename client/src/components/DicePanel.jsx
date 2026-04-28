import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket.js';
import { trackDiceRolled } from '../utils/analytics.js';

const DIE_TYPES = [4, 6, 8, 10, 12, 20];
const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e8e0cc'];
const GM_COLOR = '#c8b560';

const DIE_PATH = {
  4:  'M50,8 L93,85 L7,85 Z',
  8:  'M50,7 L93,50 L50,93 L7,50 Z',
  10: 'M50,5 C50,5 97,42 97,55 C97,68 50,95 50,95 C50,95 3,68 3,55 C3,42 50,5 50,5 Z',
  12: 'M50,7 L97,38 L80,92 L20,92 L3,38 Z',
  20: 'M50,4 L95,27 L95,73 L50,96 L5,73 L5,27 Z',
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Animated die face — used for the newest roll
function DieFaceAnimated({ type, result, color, index }) {
  const [num, setNum] = useState(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const FRAMES = 18;
    const id = setInterval(() => {
      frame++;
      if (frame >= FRAMES) {
        clearInterval(id);
        setNum(result);
        setSettled(true);
      } else {
        setNum(Math.floor(Math.random() * type) + 1);
      }
    }, 65);
    return () => clearInterval(id);
  }, [result, type]);

  const fontSize = (num ?? 0) >= 10 ? 24 : 30;
  const fill = color + '30';

  let shape;
  if (type === 6) {
    shape = <rect x="8" y="8" width="84" height="84" rx="14" fill={fill} stroke={color} strokeWidth="5" />;
  } else {
    shape = <path d={DIE_PATH[type]} fill={fill} stroke={color} strokeWidth="5" />;
  }

  return (
    <div
      className={`die-face${settled ? ' die-settled' : ' die-rolling'}`}
      style={{ animationDelay: `${index * 0.07}s` }}
      title={`d${type}: ${result}`}
    >
      <svg viewBox="0 0 100 100" width="52" height="52">
        {shape}
        {num !== null && (
          <text x="50" y="54" textAnchor="middle" dominantBaseline="middle"
            fontSize={fontSize} fill={color} fontWeight="bold" fontFamily="Cinzel,serif">
            {num}
          </text>
        )}
      </svg>
      <span className="die-face-label">d{type}</span>
    </div>
  );
}

// Static die face — used for older log entries
function DieFaceStatic({ type, result, color }) {
  const fill = color + '22';
  const fontSize = result >= 10 ? 28 : 34;

  let shape;
  if (type === 6) {
    shape = <rect x="8" y="8" width="84" height="84" rx="14" fill={fill} stroke={color} strokeWidth="4" />;
  } else {
    shape = <path d={DIE_PATH[type]} fill={fill} stroke={color} strokeWidth="4" />;
  }

  return (
    <div className="die-face-static" title={`d${type}: ${result}`}>
      <svg viewBox="0 0 100 100" width="38" height="38">
        {shape}
        <text x="50" y="54" textAnchor="middle" dominantBaseline="middle"
          fontSize={fontSize} fill={color} fontWeight="bold" fontFamily="Cinzel,serif">
          {result}
        </text>
      </svg>
    </div>
  );
}

function RollLogEntry({ roll, isNewest }) {
  const total = roll.results.reduce((s, d) => s + d.result, 0);

  // Summarise dice: "2d6 + 1d20" etc.
  const diceSummary = Object.entries(
    roll.results.reduce((acc, d) => { acc[d.type] = (acc[d.type] || 0) + 1; return acc; }, {})
  ).map(([t, c]) => `${c}d${t}`).join(' + ');

  return (
    <div className={`roll-log-entry${isNewest ? ' roll-log-newest' : ''}`}>
      <div className="roll-log-header">
        <span className="roll-log-dot" style={{ background: roll.rollerColor }} />
        <span className="roll-log-name" style={{ color: roll.rollerColor }}>{roll.rollerName}</span>
        <span className="roll-log-summary"> — {diceSummary}</span>
        <span className="roll-log-time">{formatTime(roll.timestamp)}</span>
      </div>

      <div className={isNewest ? 'roll-log-dice-animated' : 'roll-log-dice-static'}>
        {isNewest
          ? roll.results.map((d, i) => (
              <DieFaceAnimated key={i} type={d.type} result={d.result} color={roll.rollerColor} index={i} />
            ))
          : roll.results.map((d, i) => (
              <DieFaceStatic key={i} type={d.type} result={d.result} color={roll.rollerColor} />
            ))
        }
      </div>

      <div className="roll-log-footer">
        <span className="roll-log-total">Total: <strong>{total}</strong></span>
      </div>
    </div>
  );
}

export default function DicePanel({ isGM, onClose, rolls, onClearLog, rollerName, rollerColor }) {
  const [counts, setCounts] = useState({ 4:0, 6:0, 8:0, 10:0, 12:0, 20:0 });
  const [rolling, setRolling] = useState(false);
  const logRef = useRef(null);

  const total = Object.values(counts).reduce((s, v) => s + v, 0);

  // Scroll log to top when a new roll arrives
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [rolls.length]);

  const handleRoll = () => {
    if (total === 0 || rolling) return;
    const dice = DIE_TYPES.filter(t => counts[t] > 0).map(t => ({ type: t, count: counts[t] }));
    const name  = isGM ? 'GM'        : (rollerName  || 'Player');
    const color = isGM ? GM_COLOR    : (rollerColor  || COLORS[1]);
    socket.emit('dice:roll', { dice, rollerName: name, rollerColor: color });
    trackDiceRolled();
    setRolling(true);
    setTimeout(() => setRolling(false), 1500);
  };

  return (
    <aside className="dice-panel">
      {/* Header */}
      <div className="dice-panel-head">
        <span className="dice-panel-title">🎲 Dice Roller</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {rolls.length > 0 && (
            <button className="dice-clear-btn" onClick={onClearLog} title="Clear log">Clear</button>
          )}
          <button className="dice-close" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* Roller */}
      <div className="dice-roller-section">
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

        <button className="btn-primary roll-btn" disabled={total === 0 || rolling} onClick={handleRoll}>
          {rolling ? 'Rolling…' : total === 0 ? 'Select dice above' : `Roll ${total} ${total === 1 ? 'Die' : 'Dice'}`}
        </button>
      </div>

      {/* Log */}
      <div className="dice-log-divider">
        <span>Roll History</span>
      </div>

      <div className="dice-log" ref={logRef}>
        {rolls.length === 0 && (
          <p className="dice-log-empty">No rolls yet this session.</p>
        )}
        {[...rolls].reverse().map((roll, i) => (
          <RollLogEntry key={roll.id} roll={roll} isNewest={i === 0} />
        ))}
      </div>
    </aside>
  );
}
