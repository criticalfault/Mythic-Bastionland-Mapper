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


export default function HexTile({ hex, cx, cy, size, isGM, mode, selectedSpecialTile, selectedMyth, onClick, onRightClick, hasSite, onSiteClick, note, onHoverStart, onHoverEnd }) {
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
  if (isGM) {
    if (mode === 'build') {
      // Special tile or myth selected → right-click mode; left-click is inactive
      cursor = (selectedSpecialTile !== null || selectedMyth !== null) ? 'context-menu' : 'crosshair';
    } else {
      cursor = 'pointer';
    }
  } else {
    cursor = 'pointer';
  }

  return (
    <g className="hex-tile" onClick={handleClick} onContextMenu={handleRightClick} style={{ cursor }} onMouseEnter={e => onHoverStart && onHoverStart(hex, e)} onMouseLeave={() => onHoverEnd && onHoverEnd()}>
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

      {/* Site marker — visible to GM always, and to players when hex is revealed */}
      {hasSite && (isGM || !showFog) && (
        <g
          style={{ cursor: 'pointer', pointerEvents: 'all' }}
          onClick={e => { e.stopPropagation(); e.preventDefault(); onSiteClick && onSiteClick(); }}
        >
          <circle
            cx={cx + size * 0.38}
            cy={cy - size * 0.44}
            r={size * 0.19}
            fill="#1e4a3a"
            stroke="#3a9a6a"
            strokeWidth={1.5}
            opacity={0.92}
          />
          <text
            x={cx + size * 0.38}
            y={cy - size * 0.44}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.21}
            fontWeight="bold"
            fill="#6adaaa"
            style={{ fontFamily: 'Cinzel, serif', userSelect: 'none', pointerEvents: 'none' }}
          >S</text>
        </g>
      )}

      {/* Note marker — visible to GM always, and to players when hex is revealed */}
      {note && (isGM || !showFog) && (
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={cx + size * 0.38}
            cy={cy + size * 0.44}
            r={size * 0.19}
            fill="#1e2e4a"
            stroke="#3a6a9a"
            strokeWidth={1.5}
            opacity={0.92}
          />
          <text
            x={cx + size * 0.38}
            y={cy + size * 0.44}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.21}
            fontWeight="bold"
            fill="#6aaadd"
            style={{ fontFamily: 'Cinzel, serif', userSelect: 'none' }}
          >N</text>
        </g>
      )}

      {/* Myth marker — GM only, never sent to players */}
      {isGM && hex.myth != null && (
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={cx - size * 0.38}
            cy={cy - size * 0.44}
            r={size * 0.19}
            fill="#6b3a2a"
            stroke="#3d1f12"
            strokeWidth={1.5}
            opacity={0.92}
          />
          <text
            x={cx - size * 0.38}
            y={cy - size * 0.44}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.22}
            fontWeight="bold"
            fill="#f5e6c8"
            style={{ fontFamily: 'Crimson Text, serif', userSelect: 'none' }}
          >{hex.myth}</text>
        </g>
      )}
    </g>
  );
}
