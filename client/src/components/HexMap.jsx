import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import HexTile from './HexTile.jsx';
import PlayerToken from './PlayerToken.jsx';
import PartyToken from './PartyToken.jsx';
import PingOverlay from './PingOverlay.jsx';
import socket from '../socket.js';

// Flat-top hex layout helpers
// q = column, r = row (offset coords, "even-q" offset)
function hexToPixel(q, r, size) {
  const x = size * 1.5 * q;
  const y = size * Math.sqrt(3) * (r + (q % 2 === 0 ? 0 : 0.5));
  return { x, y };
}

function pixelToHex(x, y, size, cols, rows) {
  // Approximate — find nearest hex center
  let best = null;
  let bestDist = Infinity;
  for (let qq = 0; qq < cols; qq++) {
    for (let rr = 0; rr < rows; rr++) {
      const center = hexToPixel(qq, rr, size);
      const dx = x - center.x;
      const dy = y - center.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = { q: qq, r: rr };
      }
    }
  }
  return best;
}

const HEX_SIZE = 52; // circumradius
const PAD = HEX_SIZE;

export default function HexMap({
  map, players, partyMarker, pings,
  isGM, mode,
  onHexClick, onHexRightClick,
  onPlayerMove, onPartyMove, onPlayerPing,
}) {
  const svgRef = useRef(null);

  // Pan/zoom state
  const [viewBox, setViewBox] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef(null);
  const viewBoxStart = useRef(null);

  // Drag-to-paint state (build mode)
  const isPainting = useRef(false);
  const lastPaintedKey = useRef(null);
  const mouseDownPos = useRef(null); // track start pos to enforce dead zone

  // Compute SVG dimensions from map size
  const { svgWidth, svgHeight } = useMemo(() => {
    const w = HEX_SIZE * 1.5 * map.cols + HEX_SIZE * 0.5 + PAD * 2;
    const h = HEX_SIZE * Math.sqrt(3) * (map.rows + 0.5) + PAD * 2;
    return { svgWidth: w, svgHeight: h };
  }, [map.cols, map.rows]);

  // Reset viewbox when map changes
  useEffect(() => {
    setViewBox({ x: 0, y: 0, w: svgWidth, h: svgHeight });
  }, [svgWidth, svgHeight]);

  const hexLayout = useMemo(() => ({
    findNearestHex: (x, y) => pixelToHex(x - PAD, y - PAD, HEX_SIZE, map.cols, map.rows),
  }), [map.cols, map.rows]);

  const getHexCenter = useCallback((q, r) => {
    const { x, y } = hexToPixel(q, r, HEX_SIZE);
    return { x: x + PAD, y: y + PAD };
  }, []);

  // Build sorted hex list for rendering
  const hexEntries = useMemo(() => Object.entries(map.hexes), [map.hexes]);

  // Helper: get SVG coords from mouse event
  const svgCoords = (e) => {
    const svg = svgRef.current;
    if (!svg || !viewBox) return null;
    const rect = svg.getBoundingClientRect();
    const x = viewBox.x + (e.clientX - rect.left) * (viewBox.w / rect.width);
    const y = viewBox.y + (e.clientY - rect.top) * (viewBox.h / rect.height);
    return { x, y };
  };

  // --- Pan + paint handlers ---
  const onMouseDown = (e) => {
    // Middle-click or alt+left-click = pan
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      viewBoxStart.current = { ...viewBox };
      e.preventDefault();
      return;
    }
    // Left-click in build mode = start painting
    if (e.button === 0 && isGM && mode === 'build') {
      isPainting.current = true;
      lastPaintedKey.current = null;
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onMouseMove = (e) => {
    // Pan
    if (isPanning && panStart.current && viewBox) {
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      const dx = (e.clientX - panStart.current.x) * scaleX;
      const dy = (e.clientY - panStart.current.y) * scaleY;
      setViewBox({
        ...viewBoxStart.current,
        x: viewBoxStart.current.x - dx,
        y: viewBoxStart.current.y - dy,
      });
      return;
    }
    // Drag-to-paint in build mode — only after moving >8px from click origin
    if (isPainting.current && isGM && mode === 'build') {
      if (mouseDownPos.current) {
        const dx = e.clientX - mouseDownPos.current.x;
        const dy = e.clientY - mouseDownPos.current.y;
        if (dx * dx + dy * dy < 64) return; // 8px dead zone
      }
      const coords = svgCoords(e);
      if (!coords) return;
      const nearest = pixelToHex(coords.x - PAD, coords.y - PAD, HEX_SIZE, map.cols, map.rows);
      if (!nearest) return;
      const key = `${nearest.q},${nearest.r}`;
      if (key !== lastPaintedKey.current) {
        lastPaintedKey.current = key;
        onHexClick(key, map.hexes[key] || nearest);
      }
    }
  };

  const onMouseUp = () => {
    setIsPanning(false);
    isPainting.current = false;
    lastPaintedKey.current = null;
    mouseDownPos.current = null;
  };

  // Ctrl+Z undo (GM only)
  useEffect(() => {
    if (!isGM) return;
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        socket.emit('map:undo');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGM]);

  // Scroll to zoom — must be non-passive to call preventDefault()
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (e) => {
      e.preventDefault();
      setViewBox(prev => {
        if (!prev) return prev;
        const rect = svg.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / rect.width;
        const mouseY = (e.clientY - rect.top) / rect.height;
        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        const newW = Math.max(300, Math.min(svgWidth * 2, prev.w * factor));
        const newH = Math.max(200, Math.min(svgHeight * 2, prev.h * factor));
        return {
          x: prev.x + (prev.w - newW) * mouseX,
          y: prev.y + (prev.h - newH) * mouseY,
          w: newW,
          h: newH,
        };
      });
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [svgWidth, svgHeight]);

  const handleHexClick = useCallback((hex) => {
    if (isGM) {
      onHexClick(`${hex.q},${hex.r}`, hex);
    } else {
      onPlayerPing(hex.q, hex.r);
    }
  }, [isGM, onHexClick, onPlayerPing]);

  const handleHexRightClick = useCallback((hex) => {
    onHexRightClick(`${hex.q},${hex.r}`);
  }, [onHexRightClick]);

  if (!viewBox) return null;

  const vb = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  return (
    <svg
      ref={svgRef}
      className="hex-map"
      viewBox={vb}
      style={{ width: '100%', height: '100%', display: 'block' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <defs>
        <pattern id="fogPattern" patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill="#1a1a2e" />
          <circle cx="2" cy="2" r="1" fill="#2a2a4e" opacity="0.6" />
          <circle cx="6" cy="6" r="1" fill="#2a2a4e" opacity="0.6" />
        </pattern>
        <filter id="tokenGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Hex tiles */}
      {hexEntries.map(([key, hex]) => {
        const { x, y } = hexToPixel(hex.q, hex.r, HEX_SIZE);
        return (
          <HexTile
            key={key}
            hex={hex}
            cx={x + PAD}
            cy={y + PAD}
            size={HEX_SIZE}
            isGM={isGM}
            mode={mode}
            onClick={handleHexClick}
            onRightClick={handleHexRightClick}
          />
        );
      })}

      {/* Player tokens */}
      {players.map(player => {
        const center = getHexCenter(player.q, player.r);
        return (
          <PlayerToken
            key={player.id}
            player={player}
            cx={center.x}
            cy={center.y}
            size={HEX_SIZE}
            isGM={isGM}
            onMove={onPlayerMove}
            hexLayout={hexLayout}
          />
        );
      })}

      {/* Party marker — always visible to everyone, GM can drag it */}
      {partyMarker && (() => {
        const center = getHexCenter(partyMarker.q, partyMarker.r);
        return (
          <PartyToken
            cx={center.x}
            cy={center.y}
            size={HEX_SIZE}
            isGM={isGM}
            onMove={onPartyMove}
            hexLayout={hexLayout}
          />
        );
      })()}

      {/* Ping animations */}
      <PingOverlay pings={pings} getHexCenter={getHexCenter} />
    </svg>
  );
}
