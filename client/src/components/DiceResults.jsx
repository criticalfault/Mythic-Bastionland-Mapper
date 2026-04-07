import React, { useState, useEffect, useCallback } from 'react';

const DIE_PATH = {
  4:  'M50,8 L93,85 L7,85 Z',
  8:  'M50,7 L93,50 L50,93 L7,50 Z',
  10: 'M50,93 L3,62 L20,8 L80,8 L97,62 Z',  // inverted pentagon (point down)
  12: 'M50,7 L97,38 L80,92 L20,92 L3,38 Z',
  20: 'M50,4 L95,27 L95,73 L50,96 L5,73 L5,27 Z',
};

function DieFace({ type, result, color, index }) {
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

  const isMax = settled && result === type;
  const isMin = settled && result === 1;
  const numColor = isMax ? '#ffd700' : isMin ? '#ff5555' : color;
  const fontSize = (num ?? 0) >= 10 ? 26 : 32;
  const fill = color + '30'; // ~19% opacity

  let shape;
  if (type === 6) {
    shape = <rect x="8" y="8" width="84" height="84" rx="14" fill={fill} stroke={color} strokeWidth="5" />;
  } else {
    shape = <path d={DIE_PATH[type]} fill={fill} stroke={color} strokeWidth="5" />;
  }

  return (
    <div
      className={`die-face${settled ? ' die-settled' : ' die-rolling'}${isMax ? ' die-max' : ''}${isMin ? ' die-min' : ''}`}
      style={{ animationDelay: `${index * 0.09}s` }}
    >
      <svg viewBox="0 0 100 100" width="58" height="58">
        {shape}
        {num !== null && (
          <text x="50" y="54" textAnchor="middle" dominantBaseline="middle"
            fontSize={fontSize} fill={numColor} fontWeight="bold" fontFamily="Cinzel,serif">
            {num}
          </text>
        )}
        {isMax && <text x="50" y="89" textAnchor="middle" fontSize="11" fill="#ffd700" fontFamily="Cinzel,serif" fontWeight="bold">MAX</text>}
        {isMin && <text x="50" y="89" textAnchor="middle" fontSize="11" fill="#ff5555" fontFamily="Cinzel,serif" fontWeight="bold">FUMBLE</text>}
      </svg>
      <span className="die-face-label">d{type}</span>
    </div>
  );
}

function RollCard({ roll, onRemove }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const f = setTimeout(() => setFading(true), 6000);
    const r = setTimeout(() => onRemove(roll.id), 7200);
    return () => { clearTimeout(f); clearTimeout(r); };
  }, [roll.id, onRemove]);

  return (
    <div className={`roll-card${fading ? ' roll-card-fade' : ''}`}>
      <div className="roll-card-head">
        <span className="roll-card-dot" style={{ background: roll.rollerColor }} />
        <span className="roll-card-name" style={{ color: roll.rollerColor }}>{roll.rollerName}</span>
        <span className="roll-card-verb"> rolled</span>
        <button className="roll-card-x" onClick={() => onRemove(roll.id)}>✕</button>
      </div>
      <div className="roll-card-dice">
        {roll.results.map((d, i) => (
          <DieFace key={i} type={d.type} result={d.result} color={roll.rollerColor} index={i} />
        ))}
      </div>
    </div>
  );
}

export default function DiceResults({ rolls, onRemove }) {
  if (!rolls.length) return null;
  return (
    <div className="dice-results-overlay">
      {rolls.map(r => <RollCard key={r.id} roll={r} onRemove={onRemove} />)}
    </div>
  );
}
