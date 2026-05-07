import React, { useState, useCallback, useEffect } from 'react';
import socket from '../socket.js';

const CX = 130;
const CY = 130;
const R = 95;
const SZ = 14;

// posIdx 0-5 = top, top-right, bottom-right, bottom, bottom-left, top-left (clockwise)
function pointPosition(posIdx) {
  const angle = (posIdx * 60 - 90) * (Math.PI / 180);
  return {
    x: CX + R * Math.cos(angle),
    y: CY + R * Math.sin(angle),
  };
}

const TYPE_COLORS = {
  feature: '#c8b560',
  danger: '#e05050',
  treasure: '#f5c842',
};

const TYPE_LABELS = {
  feature: '○ Feature',
  danger: '△ Danger',
  treasure: '◇ Treasure',
};

const ROUTE_TYPE_LABELS = {
  open: '─ Open',
  closed: '✕ Closed',
  hidden: '╌ Hidden',
};

const ROUTE_CYCLE = { open: 'closed', closed: 'hidden', hidden: 'open' };

// Default point types: posIdx 0,1,2 = feature, posIdx 3,4 = danger, posIdx 5 = treasure
function defaultPoints() {
  return [0, 1, 2, 3, 4, 5].map(posIdx => ({
    posIdx,
    type: posIdx < 3 ? 'feature' : posIdx < 5 ? 'danger' : 'treasure',
    desc: '',
    entrance: posIdx === 0,
    hiddenEntrance: false,
  }));
}

function initSite(existingSite) {
  if (existingSite) {
    return {
      name: existingSite.name || 'Unnamed Site',
      points: existingSite.points ? [...existingSite.points] : defaultPoints(),
      routes: existingSite.routes ? [...existingSite.routes] : [],
    };
  }
  return {
    name: 'New Site',
    points: defaultPoints(),
    routes: [],
  };
}

// SVG shape for a point type
function PointShape({ x, y, type, selected, posIdx }) {
  const color = TYPE_COLORS[type] || '#aaa';
  const strokeColor = selected ? '#fff' : 'rgba(0,0,0,0.6)';
  const strokeWidth = selected ? 2.5 : 1.5;

  let shape;
  if (type === 'feature') {
    shape = (
      <circle
        cx={x} cy={y} r={SZ}
        fill={color} stroke={strokeColor} strokeWidth={strokeWidth}
      />
    );
  } else if (type === 'danger') {
    // Up-pointing triangle
    const apex = `${x},${y - SZ * 1.3}`;
    const bl = `${x - SZ},${y + SZ * 0.65}`;
    const br = `${x + SZ},${y + SZ * 0.65}`;
    shape = (
      <polygon
        points={`${apex} ${bl} ${br}`}
        fill={color} stroke={strokeColor} strokeWidth={strokeWidth}
      />
    );
  } else {
    // Diamond (treasure)
    shape = (
      <polygon
        points={`${x},${y - SZ} ${x + SZ},${y} ${x},${y + SZ} ${x - SZ},${y}`}
        fill={color} stroke={strokeColor} strokeWidth={strokeWidth}
      />
    );
  }

  return (
    <g>
      {shape}
      <text
        x={x} y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={SZ * 0.9}
        fontWeight="bold"
        fill={type === 'treasure' ? '#1a1a1a' : '#1a1a1a'}
        style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'Cinzel, serif' }}
      >{posIdx + 1}</text>
    </g>
  );
}

// Arrow marker for entrances
function EntranceArrow({ x, y, posIdx, hidden }) {
  // Arrow comes from outside ring toward the point (inward)
  const angle = (posIdx * 60 - 90) * (Math.PI / 180);
  // Start farther out, end at ring edge
  const outerR = R + 28;
  const innerR = R + 8;
  const x1 = CX + outerR * Math.cos(angle);
  const y1 = CY + outerR * Math.sin(angle);
  const x2 = CX + innerR * Math.cos(angle);
  const y2 = CY + innerR * Math.sin(angle);

  // Slight sideways offset for hidden entrance
  let ox = 0, oy = 0;
  if (hidden) {
    const perpAngle = angle + Math.PI / 2;
    ox = 6 * Math.cos(perpAngle);
    oy = 6 * Math.sin(perpAngle);
  }

  const markerId = hidden ? 'arrowHeadHidden' : 'arrowHeadEntrance';

  return (
    <line
      x1={x1 + ox} y1={y1 + oy}
      x2={x2 + ox} y2={y2 + oy}
      stroke={hidden ? '#aad0ff' : '#ffe080'}
      strokeWidth={hidden ? 1.5 : 2}
      strokeDasharray={hidden ? '5,3' : undefined}
      markerEnd={`url(#${markerId})`}
      opacity={0.85}
    />
  );
}

// Route midpoint
function routeMidpoint(fromIdx, toIdx) {
  const p1 = pointPosition(fromIdx);
  const p2 = pointPosition(toIdx);
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

export default function SiteModal({ hexKey, sites, isGM, onClose }) {
  const existingSite = sites?.[hexKey];
  const [site, setSite] = useState(() => initSite(existingSite));
  const [selectedPoint, setSelectedPoint] = useState(null); // posIdx or null
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Add-route form state
  const [addRouteFrom, setAddRouteFrom] = useState(0);
  const [addRouteTo, setAddRouteTo] = useState(1);
  const [addRouteType, setAddRouteType] = useState('open');

  // Reset when hexKey changes
  useEffect(() => {
    setSite(initSite(sites?.[hexKey]));
    setSelectedPoint(null);
    setSavedFeedback(false);
  }, [hexKey]);

  const updatePoint = useCallback((posIdx, updates) => {
    setSite(prev => ({
      ...prev,
      points: prev.points.map(p => p.posIdx === posIdx ? { ...p, ...updates } : p),
    }));
  }, []);

  const cycleRouteType = useCallback((routeIdx) => {
    setSite(prev => {
      const routes = [...prev.routes];
      routes[routeIdx] = { ...routes[routeIdx], type: ROUTE_CYCLE[routes[routeIdx].type] || 'open' };
      return { ...prev, routes };
    });
  }, []);

  const deleteRoute = useCallback((routeIdx) => {
    setSite(prev => ({ ...prev, routes: prev.routes.filter((_, i) => i !== routeIdx) }));
  }, []);

  const addRoute = useCallback(() => {
    if (addRouteFrom === addRouteTo) return;
    // Don't add duplicate
    const exists = site.routes.some(
      r => (r.from === addRouteFrom && r.to === addRouteTo) || (r.from === addRouteTo && r.to === addRouteFrom)
    );
    if (exists) return;
    setSite(prev => ({
      ...prev,
      routes: [...prev.routes, { from: addRouteFrom, to: addRouteTo, type: addRouteType }],
    }));
  }, [addRouteFrom, addRouteTo, addRouteType, site.routes]);

  const handleSave = useCallback(() => {
    socket.emit('site:update', { hexKey, site });
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  }, [hexKey, site]);

  const handleDelete = useCallback(() => {
    if (!confirm(`Delete site "${site.name}" at hex ${hexKey}? This cannot be undone.`)) return;
    socket.emit('site:delete', { hexKey });
    onClose();
  }, [hexKey, site.name, onClose]);

  const selPoint = selectedPoint !== null ? site.points.find(p => p.posIdx === selectedPoint) : null;

  return (
    <div className="site-modal-overlay" onClick={onClose}>
      <div className="site-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="site-modal-header">
          {isGM ? (
            <input
              className="site-name-input"
              value={site.name}
              onChange={e => setSite(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Site name…"
            />
          ) : (
            <h2 className="site-name-display">{site.name}</h2>
          )}
          <span className="site-hex-label">hex {hexKey}</span>
          <button className="site-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Body */}
        <div className="site-modal-body">

          {/* Left: SVG diagram */}
          <div className="site-diagram-wrap">
            <svg
              className="site-diagram-svg"
              width="260" height="260"
              viewBox="0 0 260 260"
            >
              <defs>
                <marker id="arrowHeadEntrance" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#ffe080" />
                </marker>
                <marker id="arrowHeadHidden" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#aad0ff" />
                </marker>
              </defs>

              {/* Dark background */}
              <rect width="260" height="260" rx="8" fill="#131320" />

              {/* Faint guide circle */}
              <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

              {/* Routes (drawn behind points) */}
              {site.routes.map((route, idx) => {
                const p1 = pointPosition(route.from);
                const p2 = pointPosition(route.to);
                const mid = routeMidpoint(route.from, route.to);
                const isHidden = route.type === 'hidden';
                const isClosed = route.type === 'closed';
                return (
                  <g key={idx}>
                    {/* Invisible wide hit area */}
                    {isGM && (
                      <line
                        x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                        stroke="transparent" strokeWidth={14}
                        style={{ cursor: 'pointer' }}
                        onClick={() => cycleRouteType(idx)}
                      />
                    )}
                    <line
                      x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                      stroke="rgba(255,255,255,0.65)"
                      strokeWidth={1.5}
                      strokeDasharray={isHidden ? '8,5' : undefined}
                      style={{ pointerEvents: 'none' }}
                    />
                    {isClosed && (
                      <g style={{ pointerEvents: 'none' }}>
                        <line x1={mid.x - 5.5} y1={mid.y - 5.5} x2={mid.x + 5.5} y2={mid.y + 5.5}
                          stroke="rgba(255,255,255,0.65)" strokeWidth={1.5} />
                        <line x1={mid.x + 5.5} y1={mid.y - 5.5} x2={mid.x - 5.5} y2={mid.y + 5.5}
                          stroke="rgba(255,255,255,0.65)" strokeWidth={1.5} />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Entrance arrows */}
              {site.points.filter(p => p.entrance || p.hiddenEntrance).map(p => (
                <g key={p.posIdx}>
                  {p.entrance && <EntranceArrow x={pointPosition(p.posIdx).x} y={pointPosition(p.posIdx).y} posIdx={p.posIdx} hidden={false} />}
                  {p.hiddenEntrance && <EntranceArrow x={pointPosition(p.posIdx).x} y={pointPosition(p.posIdx).y} posIdx={p.posIdx} hidden={true} />}
                </g>
              ))}

              {/* Points */}
              {site.points.map(p => {
                const pos = pointPosition(p.posIdx);
                return (
                  <g
                    key={p.posIdx}
                    style={{ cursor: isGM ? 'pointer' : 'default' }}
                    onClick={isGM ? () => setSelectedPoint(p.posIdx === selectedPoint ? null : p.posIdx) : undefined}
                  >
                    <PointShape
                      x={pos.x} y={pos.y}
                      type={p.type}
                      selected={selectedPoint === p.posIdx}
                      posIdx={p.posIdx}
                    />
                  </g>
                );
              })}
            </svg>

            {isGM && (
              <p className="site-diagram-hint">Click a point to select it. Click a route line to cycle its type.</p>
            )}
          </div>

          {/* Right: editor/viewer panel */}
          <div className="site-editor-panel">

            {/* Selected point editor (GM only) */}
            {isGM && selPoint && (
              <div className="site-point-editor">
                <div className="site-point-editor-title">
                  Point {selPoint.posIdx + 1}
                </div>
                <div className="site-type-btns">
                  {['feature', 'danger', 'treasure'].map(t => (
                    <button
                      key={t}
                      className={`site-type-btn site-type-btn--${t}${selPoint.type === t ? ' active' : ''}`}
                      onClick={() => updatePoint(selPoint.posIdx, { type: t })}
                    >{TYPE_LABELS[t]}</button>
                  ))}
                </div>
                <textarea
                  className="site-desc-input"
                  placeholder="Description…"
                  value={selPoint.desc}
                  onChange={e => updatePoint(selPoint.posIdx, { desc: e.target.value })}
                  rows={3}
                />
                <div className="site-entrance-row">
                  <label className="site-checkbox-label">
                    <input
                      type="checkbox"
                      checked={selPoint.entrance}
                      onChange={e => updatePoint(selPoint.posIdx, { entrance: e.target.checked })}
                    />
                    {' '}Entrance
                  </label>
                  <label className="site-checkbox-label">
                    <input
                      type="checkbox"
                      checked={selPoint.hiddenEntrance}
                      onChange={e => updatePoint(selPoint.posIdx, { hiddenEntrance: e.target.checked })}
                    />
                    {' '}Hidden Entrance
                  </label>
                </div>
              </div>
            )}

            {/* Points list */}
            <div className="site-points-list">
              <div className="site-section-label">Points</div>
              {site.points.map(p => (
                <div
                  key={p.posIdx}
                  className={`site-point-row${selectedPoint === p.posIdx ? ' selected' : ''}${isGM ? ' clickable' : ''}`}
                  onClick={isGM ? () => setSelectedPoint(p.posIdx === selectedPoint ? null : p.posIdx) : undefined}
                >
                  <span className="site-point-num" style={{ color: TYPE_COLORS[p.type] }}>{p.posIdx + 1}</span>
                  <span className="site-point-type-icon">
                    {p.type === 'feature' ? '○' : p.type === 'danger' ? '△' : '◇'}
                  </span>
                  <span className="site-point-desc">{p.desc || <em className="site-point-empty">No description</em>}</span>
                  <span className="site-point-markers">
                    {p.entrance && <span className="site-marker site-marker--entrance" title="Entrance">↓</span>}
                    {p.hiddenEntrance && <span className="site-marker site-marker--hidden" title="Hidden Entrance">⤵</span>}
                  </span>
                </div>
              ))}
            </div>

            {/* Routes section */}
            <div className="site-routes-section">
              <div className="site-section-label">Routes</div>
              {site.routes.length === 0 && <p className="site-empty-hint">No routes defined.</p>}
              {site.routes.map((route, idx) => (
                <div key={idx} className="site-route-row">
                  <span className="site-route-label">{route.from + 1} → {route.to + 1}</span>
                  {isGM ? (
                    <button
                      className={`site-route-type-btn site-route-type-btn--${route.type}`}
                      onClick={() => cycleRouteType(idx)}
                      title="Click to cycle type"
                    >{ROUTE_TYPE_LABELS[route.type]}</button>
                  ) : (
                    <span className={`site-route-type-display site-route-type-btn--${route.type}`}>{ROUTE_TYPE_LABELS[route.type]}</span>
                  )}
                  {isGM && (
                    <button className="site-route-del" onClick={() => deleteRoute(idx)} title="Delete route">✕</button>
                  )}
                </div>
              ))}

              {/* Add route form (GM only) */}
              {isGM && (
                <div className="site-add-route-row">
                  <select className="site-select" value={addRouteFrom} onChange={e => setAddRouteFrom(Number(e.target.value))}>
                    {[0,1,2,3,4,5].map(i => <option key={i} value={i}>{i + 1}</option>)}
                  </select>
                  <span className="site-route-arrow">→</span>
                  <select className="site-select" value={addRouteTo} onChange={e => setAddRouteTo(Number(e.target.value))}>
                    {[0,1,2,3,4,5].map(i => <option key={i} value={i}>{i + 1}</option>)}
                  </select>
                  <select className="site-select" value={addRouteType} onChange={e => setAddRouteType(e.target.value)}>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="hidden">Hidden</option>
                  </select>
                  <button className="btn-primary site-add-route-btn" onClick={addRoute}>Add</button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer (GM only) */}
        {isGM && (
          <div className="site-modal-footer">
            <button className="btn-primary" onClick={handleSave}>
              {savedFeedback ? '✓ Saved!' : 'Save Site'}
            </button>
            <button className="btn-danger" onClick={handleDelete}>Delete Site</button>
          </div>
        )}

      </div>
    </div>
  );
}
