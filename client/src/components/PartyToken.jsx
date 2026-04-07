import React, { useState } from 'react';

export default function PartyToken({ cx, cy, size, isGM, onMove, hexLayout }) {
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState(null);

  const r = size * 0.38; // slightly larger than player tokens

  const handleMouseDown = (e) => {
    if (!isGM) return;
    e.stopPropagation();
    setDragging(true);
    setDragPos({ x: cx, y: cy });

    const svg = e.currentTarget.closest('svg');

    const toSVGCoords = (me) => {
      const vb = svg.viewBox.baseVal;
      const rect = svg.getBoundingClientRect();
      // Account for preserveAspectRatio="xMidYMid meet": content is scaled
      // uniformly to fit, then centred — so we must find the actual scale and
      // the letterbox offsets before converting cursor → SVG coordinates.
      const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
      const ox = (rect.width  - vb.width  * scale) / 2;
      const oy = (rect.height - vb.height * scale) / 2;
      return {
        x: vb.x + (me.clientX - rect.left - ox) / scale,
        y: vb.y + (me.clientY - rect.top  - oy) / scale,
      };
    };

    // Capture where on the token the user clicked, so dragging keeps that
    // point under the cursor rather than snapping the centre to the cursor.
    const grabPt = toSVGCoords(e);
    const offset = { x: grabPt.x - cx, y: grabPt.y - cy };

    const onDragMove = (me) => {
      const { x, y } = toSVGCoords(me);
      setDragPos({ x: x - offset.x, y: y - offset.y });
    };

    const onDragUp = (me) => {
      setDragging(false);
      const { x, y } = toSVGCoords(me);
      const nearest = hexLayout.findNearestHex(x, y);
      if (nearest) onMove(nearest.q, nearest.r);
      setDragPos(null);
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragUp);
    };

    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragUp);
  };

  const px = dragging && dragPos ? dragPos.x : cx;
  const py = dragging && dragPos ? dragPos.y : cy;

  return (
    <g
      className="party-token"
      transform={`translate(${px}, ${py})`}
      style={{ cursor: isGM ? 'grab' : 'default' }}
      onMouseDown={handleMouseDown}
    >
      {/* Outer glow ring */}
      <circle r={r + 4} fill="none" stroke="#c8b560" strokeWidth="1.5" opacity="0.35" />

      {/* Drop shadow */}
      <circle cx={2} cy={3} r={r} fill="#000" opacity={0.45} />

      {/* Token body — dark metal */}
      <circle r={r} fill="#1c1c2e" stroke="#c8b560" strokeWidth="2.5" />

      {/* Inner ring decoration */}
      <circle r={r * 0.78} fill="none" stroke="#c8b560" strokeWidth="0.8" opacity="0.5" />

      {/* Knight chess piece ♞ */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={r * 1.15}
        fill="#c8b560"
        dy="0.05em"
        style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'serif' }}
      >
        ♞
      </text>

      {/* "Party" label beneath */}
      <text
        y={r + 9}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={Math.max(r * 0.32, 8)}
        fill="#c8b560"
        stroke="#000"
        strokeWidth="0.5"
        paintOrder="stroke"
        style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'Cinzel, serif', letterSpacing: '0.05em' }}
      >
        PARTY
      </text>
    </g>
  );
}
