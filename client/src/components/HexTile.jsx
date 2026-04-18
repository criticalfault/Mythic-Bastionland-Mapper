import React from 'react';
import { regularTileUrls, specialTileUrls } from '../tiles.js';

// Flat-top hex geometry
function hexCorners(cx, cy, size) {
  return Array.from({ length: 6 }, (_, i) => {
    const angleRad = (Math.PI / 180) * 60 * i;
    return [cx + size * Math.cos(angleRad), cy + size * Math.sin(angleRad)];
  });
}

function pointsAttr(corners) {
  return corners.map(([x, y]) => `${x},${y}`).join(' ');
}

export default function HexTile({ hex, cx, cy, size, isGM, mode, onClick, onRightClick }) {
  const corners = hexCorners(cx, cy, size);
  const points = pointsAttr(corners);
  const clipId = `clip-${hex.q}-${hex.r}`;

  const isRevealed = hex.revealed;
  const isSpecialRevealed = hex.specialRevealed;

  // Players see full fog on unrevealed tiles
  const showFog = !isGM && !isRevealed;

  // Tile image URLs
  const terrainUrl = regularTileUrls[hex.terrain] || null;
  const specialUrl = hex.specialTile ? specialTileUrls[hex.specialTile] || null : null;
  const showSpecial = specialUrl && (isGM || isSpecialRevealed);

  // Image bounding box (fits tightly around flat-top hex)
  const imgW = size * 2;
  const imgH = size * Math.sqrt(3);
  const imgX = cx - size;
  const imgY = cy - imgH / 2;

  const handleClick = (e) => { e.preventDefault(); onClick(hex); };
  const handleRightClick = (e) => { e.preventDefault(); onRightClick(hex); };

  let cursor = 'default';
  if (isGM) cursor = mode === 'build' ? 'crosshair' : 'pointer';
  else cursor = 'pointer';

  return (
    <g className="hex-tile" onClick={handleClick} onContextMenu={handleRightClick} style={{ cursor }}>
      <defs>
        <clipPath id={clipId}>
          <polygon points={points} />
        </clipPath>
      </defs>

      {/* Dark base (shows through if no tile or fogged) */}
      <polygon points={points} fill="#2a2a2a" stroke="none" />

      {/* Regular terrain image */}
      {terrainUrl && !showFog && (
        <image
          href={terrainUrl}
          x={imgX} y={imgY} width={imgW} height={imgH}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      )}

      {/* Special tile overlay — on top of terrain */}
      {showSpecial && !showFog && (
        <image
          href={specialUrl}
          x={imgX} y={imgY} width={imgW} height={imgH}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
          opacity={isSpecialRevealed ? 1 : 0.72}
        />
      )}

      {/* Fog of war for players */}
      {showFog && (
        <>
          <polygon points={points} fill="#0d0d1a" stroke="none" />
          <polygon points={points} fill="url(#fogPattern)" stroke="none" opacity="0.7" />
        </>
      )}

      {/* GM: unrevealed dimming overlay */}
      {isGM && !isRevealed && (
        <polygon points={points} fill="#000" opacity="0.45" stroke="none" />
      )}

      {/* Special tile pending-reveal indicator (GM only, dim star) */}
      {isGM && specialUrl && !isSpecialRevealed && (
        <text
          x={cx} y={cy - size * 0.32}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={size * 0.26} fill="#aaa"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >✦</text>
      )}

      {/* Special tile revealed badge */}
      {isSpecialRevealed && specialUrl && (
        <text
          x={cx} y={cy - size * 0.32}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={size * 0.26} fill="#ffd700"
          stroke="#000" strokeWidth="0.5" paintOrder="stroke"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >★</text>
      )}

      {/* Hex label */}
      {!showFog && hex.label && (
        <text
          x={cx} y={cy + (specialUrl ? size * 0.18 : size * 0.05)}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={Math.max(size * 0.17, 9)}
          fill="#fff" stroke="#000" strokeWidth="0.6" paintOrder="stroke"
          style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'Crimson Text, serif', fontWeight: 600 }}
        >
          {hex.label}
        </text>
      )}

      {/* Hex border */}
      <polygon points={points} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />

      {/* Play-mode reveal border hint (GM only) */}
      {isGM && mode === 'play' && (
        <polygon
          points={points} fill="none"
          stroke={isRevealed ? '#4ade80' : '#555'}
          strokeWidth={isRevealed ? 2 : 1}
          opacity={0.6}
        />
      )}
    </g>
  );
}
