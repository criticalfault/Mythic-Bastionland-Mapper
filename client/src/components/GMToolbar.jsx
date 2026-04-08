import React, { useState } from 'react';
import socket from '../socket.js';
import { trackMapSaved, trackStateSaved, trackMapExported, trackNewMap, trackPlayerAdded } from '../utils/analytics.js';
import { v4 as uuidv4 } from 'uuid';
import { regularTileUrls, specialTileUrls, REGULAR_TILE_NAMES, SPECIAL_TILE_NAMES } from '../tiles.js';
import { exportMapAsPng } from '../utils/exportMap.js';

const PLAYER_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e'];

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function GMToolbar({
  mode, selectedTerrain, onTerrainSelect,
  selectedSpecialTile, onSpecialTileSelect,
  players, map,
}) {
  const [tab, setTab] = useState('terrain');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerColor, setNewPlayerColor] = useState(PLAYER_COLORS[0]);
  const [saveName, setSaveName] = useState('');
  const [exporting, setExporting] = useState(null); // 'gm' | 'player' | null
  const [savedMaps, setSavedMaps] = useState([]);
  const [savedStates, setSavedStates] = useState([]);
  const [fileListError, setFileListError] = useState('');
  const [fileListLoading, setFileListLoading] = useState(false);
  const [showMapDialog, setShowMapDialog] = useState(false);
  const [newMapCols, setNewMapCols] = useState(10);
  const [newMapRows, setNewMapRows] = useState(8);
  const [newMapName, setNewMapName] = useState('New Realm');

  React.useEffect(() => {
    socket.on('map:list', ({ maps, states, source, error }) => {
      console.log('[map:list] received:', { maps, states, source, error });
      setFileListLoading(false);
      setFileListError(error ? `Error (${source}): ${error}` : '');
      setSavedMaps(maps || []);
      setSavedStates(states || []);
    });
    return () => socket.off('map:list');
  }, []);

  const requestFileList = () => {
    setFileListLoading(true);
    setFileListError('');
    socket.emit('map:list');
  };

  const handleAddPlayer = () => {
    if (!newPlayerName.trim()) return;
    trackPlayerAdded();
    socket.emit('player:add', {
      id: uuidv4(),
      name: newPlayerName.trim(),
      color: newPlayerColor,
      q: Math.floor(map.cols / 2),
      r: Math.floor(map.rows / 2),
    });
    setNewPlayerName('');
  };

  const handleNewMap = () => {
    trackNewMap();
    socket.emit('map:new', {
      cols: parseInt(newMapCols),
      rows: parseInt(newMapRows),
      name: newMapName.trim() || 'New Realm',
    });
    setShowMapDialog(false);
  };

  // All regular tile names + 'empty' sentinel
  const terrainNames = ['empty', ...REGULAR_TILE_NAMES.filter(n => n !== 'empty')];

  return (
    <aside className="gm-toolbar">
      <div className="toolbar-tabs">
        <button className={tab === 'terrain' ? 'active' : ''} onClick={() => setTab('terrain')}>Terrain</button>
        <button className={tab === 'special' ? 'active' : ''} onClick={() => setTab('special')}>Specials</button>
        <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>Players</button>
        <button className={tab === 'files' ? 'active' : ''} onClick={() => { setTab('files'); requestFileList(); }}>Files</button>
      </div>

      <div className="toolbar-content">

        {/* ── TERRAIN TAB ── */}
        {tab === 'terrain' && (
          <div className="terrain-panel">
            {mode === 'build' ? (
              <p className="panel-hint">Left-click / drag to paint. Right-click to assign special.</p>
            ) : (
              <p className="panel-hint"><strong>Play Mode:</strong> Left-click reveals hex. Right-click reveals special.</p>
            )}
            <div className="tile-image-grid">
              {terrainNames.map(name => (
                <button
                  key={name}
                  className={`tile-image-btn ${selectedTerrain === name ? 'selected' : ''}`}
                  onClick={() => onTerrainSelect(name)}
                  title={capitalize(name)}
                >
                  {regularTileUrls[name] ? (
                    <img src={regularTileUrls[name]} alt={name} />
                  ) : (
                    <span className="tile-empty-swatch" />
                  )}
                  <span className="tile-image-label">{capitalize(name)}</span>
                </button>
              ))}
            </div>
            <div className="toolbar-section" style={{ marginTop: 8 }}>
              <button className="btn-secondary full-width" onClick={() => setShowMapDialog(true)}>
                + New Map
              </button>
            </div>
          </div>
        )}

        {/* ── SPECIALS TAB ── */}
        {tab === 'special' && (
          <div className="terrain-panel">
            {mode === 'build' ? (
              <p className="panel-hint">Select a special, then right-click any hex to apply it. Select None to erase.</p>
            ) : (
              <p className="panel-hint">Right-click a hex in Play Mode to reveal/hide its special to players.</p>
            )}
            <div className="tile-image-grid">
              {/* None/eraser option */}
              <button
                className={`tile-image-btn ${selectedSpecialTile === null ? 'selected' : ''}`}
                onClick={() => onSpecialTileSelect(null)}
                title="None (erase special)"
              >
                <span className="tile-empty-swatch" style={{ fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>✕</span>
                <span className="tile-image-label">None</span>
              </button>
              {SPECIAL_TILE_NAMES.map(name => (
                <button
                  key={name}
                  className={`tile-image-btn ${selectedSpecialTile === name ? 'selected' : ''}`}
                  onClick={() => onSpecialTileSelect(name)}
                  title={capitalize(name)}
                >
                  <img src={specialTileUrls[name]} alt={name} />
                  <span className="tile-image-label">{capitalize(name)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── PLAYERS TAB ── */}
        {tab === 'players' && (
          <div className="players-panel">
            <div className="toolbar-section">
              <label className="field-label">Add Player</label>
              <input
                className="text-input"
                placeholder="Player name…"
                value={newPlayerName}
                onChange={e => setNewPlayerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
              />
              <div className="color-swatches">
                {PLAYER_COLORS.map(c => (
                  <button
                    key={c}
                    className={`color-swatch ${newPlayerColor === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewPlayerColor(c)}
                  />
                ))}
              </div>
              <button className="btn-primary full-width" onClick={handleAddPlayer}>Add Token</button>
            </div>
            <div className="toolbar-section">
              <label className="field-label">Active Players</label>
              {players.length === 0 && <p className="empty-hint">No players yet.</p>}
              {players.map(p => (
                <div key={p.id} className="player-row">
                  <span className="player-dot" style={{ background: p.color }} />
                  <span className="player-name">{p.name}</span>
                  <span className="player-pos">({p.q},{p.r})</span>
                  <button className="btn-danger-sm" onClick={() => socket.emit('player:remove', { id: p.id })}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FILES TAB ── */}
        {tab === 'files' && (
          <div className="files-panel">
            <div className="toolbar-section">
              <label className="field-label">Export PNG</label>
              <div className="btn-row">
                <button
                  className="btn-secondary"
                  disabled={!!exporting}
                  onClick={async () => {
                    setExporting('gm');
                    await exportMapAsPng(map, 'gm').catch(() => {}); trackMapExported('gm');
                    setExporting(null);
                  }}
                >
                  {exporting === 'gm' ? '…' : 'GM Map'}
                </button>
                <button
                  className="btn-secondary"
                  disabled={!!exporting}
                  onClick={async () => {
                    setExporting('player');
                    await exportMapAsPng(map, 'player').catch(() => {}); trackMapExported('player');
                    setExporting(null);
                  }}
                >
                  {exporting === 'player' ? '…' : 'Player Map'}
                </button>
              </div>
            </div>
            <div className="toolbar-section">
              <label className="field-label">Save Name</label>
              <input
                className="text-input"
                placeholder={map.name}
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
              />
              <div className="btn-row">
                <button className="btn-primary" onClick={() => { socket.emit('map:save', { name: saveName.trim() || map.name }); trackMapSaved(); setSaveName(''); }}>Save Map</button>
                <button className="btn-secondary" onClick={() => { socket.emit('state:save', { name: saveName.trim() || map.name + '-state' }); trackStateSaved(); setSaveName(''); }}>Save State</button>
              </div>
            </div>
            <div className="toolbar-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className="field-label">Saved Maps</label>
                <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={requestFileList} disabled={fileListLoading}>
                  {fileListLoading ? '…' : '↻'}
                </button>
              </div>
              {fileListError && <p className="empty-hint" style={{ color: '#f87171', fontSize: 11 }}>{fileListError}</p>}
              {!fileListLoading && savedMaps.length === 0 && !fileListError && <p className="empty-hint">No saved maps.</p>}
              {savedMaps.map(m => (
                <div key={m.id || m.filename} className="file-row">
                  <button className="file-btn" onClick={() => socket.emit('map:load', { id: m.id, filename: m.filename })}>
                    📍 {m.name}
                    {m.savedAt && <span className="file-date">{new Date(m.savedAt).toLocaleDateString()}</span>}
                  </button>
                  <button
                    className="btn-danger-sm"
                    title="Delete map"
                    onClick={() => {
                      if (confirm(`Delete "${m.name}"? This cannot be undone.`)) {
                        socket.emit('map:delete', { id: m.id, filename: m.filename });
                        setSavedMaps(prev => prev.filter(x => (x.id || x.filename) !== (m.id || m.filename)));
                      }
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
            <div className="toolbar-section">
              <label className="field-label">Saved Game States</label>
              {!fileListLoading && savedStates.length === 0 && !fileListError && <p className="empty-hint">No saved states.</p>}
              {savedStates.map(s => (
                <div key={s.id || s.filename} className="file-row">
                  <button className="file-btn" onClick={() => socket.emit('state:load', { id: s.id, filename: s.filename })}>
                    🎲 {s.name}
                    {s.savedAt && <span className="file-date">{new Date(s.savedAt).toLocaleDateString()}</span>}
                  </button>
                  <button
                    className="btn-danger-sm"
                    title="Delete state"
                    onClick={() => {
                      if (confirm(`Delete "${s.name}"? This cannot be undone.`)) {
                        socket.emit('state:delete', { id: s.id, filename: s.filename });
                        setSavedStates(prev => prev.filter(x => (x.id || x.filename) !== (s.id || s.filename)));
                      }
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New Map Dialog */}
      {showMapDialog && (
        <div className="dialog-overlay" onClick={() => setShowMapDialog(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h3>New Map</h3>
            <label className="field-label">Realm Name</label>
            <input className="text-input" value={newMapName} onChange={e => setNewMapName(e.target.value)} />
            <div className="field-row">
              <div>
                <label className="field-label">Columns</label>
                <input type="number" className="text-input num-input" min="3" max="30" value={newMapCols} onChange={e => setNewMapCols(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Rows</label>
                <input type="number" className="text-input num-input" min="3" max="30" value={newMapRows} onChange={e => setNewMapRows(e.target.value)} />
              </div>
            </div>
            <p className="panel-hint">Warning: clears the current map for all players.</p>
            <div className="btn-row">
              <button className="btn-primary" onClick={handleNewMap}>Create</button>
              <button className="btn-secondary" onClick={() => setShowMapDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
