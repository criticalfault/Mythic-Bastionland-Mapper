import React, { useEffect, useState, useCallback } from 'react';
import socket, { gmToken } from './socket.js';
import HexMap from './components/HexMap.jsx';
import GMToolbar from './components/GMToolbar.jsx';
import PingOverlay from './components/PingOverlay.jsx';

export default function App() {
  const isGM = Boolean(gmToken);

  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState(null); // { map, players }
  const [serverIsGM, setServerIsGM] = useState(null); // null=pending, true/false from server
  const [mode, setMode] = useState('build'); // 'build' | 'play'
  const [selectedTerrain, setSelectedTerrain] = useState('plains');
  const [selectedSpecialTile, setSelectedSpecialTile] = useState(null); // null = eraser
  const [pings, setPings] = useState([]); // [{ id, q, r }]
  const [notification, setNotification] = useState('');

  const notify = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  }, []);

  // --- Socket listeners ---
  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('state:full', ({ state, isGM: gmConfirmed }) => {
      setGameState(structuredClone(state));
      setServerIsGM(gmConfirmed);
    });

    socket.on('tile:setTerrain', ({ key, hex }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.map.hexes[key] = hex;
        return next;
      });
    });

    socket.on('tile:setLabel', ({ key, label }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) next.map.hexes[key].label = label;
        return next;
      });
    });

    socket.on('tile:setSpecial', ({ key, special }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) next.map.hexes[key].special = special;
        return next;
      });
    });

    socket.on('tile:reveal', ({ key, revealed }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) next.map.hexes[key].revealed = revealed;
        return next;
      });
    });

    socket.on('tile:revealSpecial', ({ key, specialRevealed, special }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) {
          next.map.hexes[key].specialRevealed = specialRevealed;
          next.map.hexes[key].special = special;
        }
        return next;
      });
    });

    socket.on('player:add', (player) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (!next.players.find(p => p.id === player.id)) {
          next.players.push(player);
        }
        return next;
      });
    });

    socket.on('player:move', ({ id, q, r }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        const p = next.players.find(p => p.id === id);
        if (p) { p.q = q; p.r = r; }
        return next;
      });
    });

    socket.on('player:remove', ({ id }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.players = next.players.filter(p => p.id !== id);
        return next;
      });
    });

    socket.on('player:update', ({ id, updates }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        const p = next.players.find(p => p.id === id);
        if (p) Object.assign(p, updates);
        return next;
      });
    });

    socket.on('tile:setSpecialTile', ({ key, specialTile }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) next.map.hexes[key].specialTile = specialTile;
        return next;
      });
    });

    socket.on('ping', ({ q, r, socketId }) => {
      const id = `${socketId}-${Date.now()}`;
      setPings(prev => [...prev, { id, q, r }]);
      setTimeout(() => setPings(prev => prev.filter(p => p.id !== id)), 2500);
    });

    socket.on('map:renamed', ({ name }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.map.name = name;
        return next;
      });
    });

    socket.on('map:saved', ({ name }) => notify(`Map "${name}" saved.`));
    socket.on('state:saved', ({ name }) => notify(`Game state "${name}" saved.`));
    socket.on('error:save', ({ message }) => notify(`Save error: ${message}`));
    socket.on('error:load', ({ message }) => notify(`Load error: ${message}`));

    return () => socket.removeAllListeners();
  }, [notify]);

  // --- GM actions ---
  const handleHexClick = useCallback((key, hex) => {
    if (!isGM) return;
    if (mode === 'build') {
      socket.emit('tile:setTerrain', { key, terrain: selectedTerrain, label: hex?.label });
    } else {
      socket.emit('tile:reveal', { key });
    }
  }, [isGM, mode, selectedTerrain]);

  const handleHexRightClick = useCallback((key) => {
    if (!isGM) return;
    if (mode === 'build') {
      // Right-click in build mode: assign or clear selected special tile
      socket.emit('tile:setSpecialTile', { key, specialTile: selectedSpecialTile });
    } else {
      socket.emit('tile:revealSpecial', { key });
    }
  }, [isGM, mode, selectedSpecialTile]);

  const handlePlayerMove = useCallback((id, q, r) => {
    if (!isGM) return;
    socket.emit('player:move', { id, q, r });
  }, [isGM]);

  const handlePing = useCallback((q, r) => {
    socket.emit('ping', { q, r });
  }, []);

  if (!connected || !gameState) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <h1>Mythic Bastionland</h1>
          <p>{connected ? 'Loading map…' : 'Connecting…'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {isGM && serverIsGM === false && (
        <div className="gm-auth-warning">
          ⚠ GM token not recognized — check the server console for the correct GM URL. Events are being dropped.
        </div>
      )}
      <header className="app-header">
        <h1 className="app-title">Mythic Bastionland</h1>
        <span className="map-name">{gameState.map.name}</span>
        <div className="header-right">
          {isGM && serverIsGM && (
            <div className="mode-toggle">
              <button
                className={mode === 'build' ? 'active' : ''}
                onClick={() => setMode('build')}
              >Build Map</button>
              <button
                className={mode === 'play' ? 'active' : ''}
                onClick={() => setMode('play')}
              >Play Mode</button>
            </div>
          )}
          <div className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} title={connected ? 'Connected' : 'Disconnected'} />
        </div>
      </header>

      <div className="app-body">
        {isGM && serverIsGM && (
          <GMToolbar
            mode={mode}
            selectedTerrain={selectedTerrain}
            onTerrainSelect={setSelectedTerrain}
            selectedSpecialTile={selectedSpecialTile}
            onSpecialTileSelect={setSelectedSpecialTile}
            players={gameState.players}
            map={gameState.map}
          />
        )}

        <div className="map-container">
          <HexMap
            map={gameState.map}
            players={gameState.players}
            pings={pings}
            isGM={isGM}
            mode={mode}
            onHexClick={handleHexClick}
            onHexRightClick={handleHexRightClick}
            onPlayerMove={handlePlayerMove}
            onPlayerPing={handlePing}
          />
        </div>
      </div>

      {notification && (
        <div className="notification">{notification}</div>
      )}

      {!isGM && (
        <div className="player-hint">Click any hex to ping it for the group</div>
      )}
    </div>
  );
}
