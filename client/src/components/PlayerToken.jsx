import React, { useRef, useState } from 'react';

export default function PlayerToken({ player, cx, cy, size, isGM, onMove, hexLayout }) {
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState(null);
  const svgRef = useRef(null);

  const r = size * 0.32;

  const handleMouseDown = (e) => {
    if (!isGM) return;
    e.stopPropagation();
    setDragging(true);
    setDragPos({ x: cx, y: cy });

    const svg = e.currentTarget.closest('svg');

    const toSVGCoords = (me) => {
      const vb = svg.viewBox.baseVal;
      const rect = svg.getBoundingClientRect();
      return {
        x: vb.x + (me.clientX - rect.left) * (vb.width / rect.width),
        y: vb.y + (me.clientY - rect.top) * (vb.height / rect.height),
      };
    };

    const onDragMove = (me) => {
      const { x, y } = toSVGCoords(me);
      setDragPos({ x, y });
    };

    const onDragUp = (me) => {
      setDragging(false);
      const { x, y } = toSVGCoords(me);
      const nearest = hexLayout.findNearestHex(x, y);
      if (nearest) {
        onMove(player.id, nearest.q, nearest.r);
      }
      setDragPos(null);
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragUp);
    };

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragUp);
  };

  const px = dragging && dragPos ? dragPos.x : cx;
  const py = dragging && dragPos ? dragPos.y : cy;

  // Initials from name
  const initials = player.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <g
      className="player-token"
      transform={`translate(${px}, ${py})`}
      style={{ cursor: isGM ? 'grab' : 'default' }}
      onMouseDown={handleMouseDown}
    >
      {/* Drop shadow */}
      <circle cx={2} cy={2} r={r} fill="#000" opacity={0.4} />
      {/* Token body */}
      <circle r={r} fill={player.color} stroke="#fff" strokeWidth={1.5} />
      {/* Initials */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={r * 0.85}
        fill="#fff"
        fontWeight="bold"
        style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'Cinzel, serif' }}
      >
        {initials}
      </text>
    </g>
  );
}
