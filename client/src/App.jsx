import React, { useEffect, useState, useCallback } from 'react';
import { auth, googleProvider } from './firebase.js';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { createSocket, getSocket } from './socket.js';
import socket from './socket.js';
import HexMap from './components/HexMap.jsx';
import GMToolbar from './components/GMToolbar.jsx';
import PingOverlay from './components/PingOverlay.jsx';
import DicePanel from './components/DicePanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import Lobby from './components/Lobby.jsx';
import { trackSignIn, trackRealmCreated, trackRealmJoined, trackHexRevealed, trackPing } from './utils/analytics.js';

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [connected, setConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null); // { roomId, inviteCode, realmName, isGM }
  const [gameState, setGameState] = useState(null); // { map, players, partyMarker }
  const [isGM, setIsGM] = useState(false);
  const [mode, setMode] = useState('build'); // 'build' | 'play'
  const [selectedTerrain, setSelectedTerrain] = useState('plains');
  const [selectedSpecialTile, setSelectedSpecialTile] = useState(null);
  const [pings, setPings] = useState([]);
  const [notification, setNotification] = useState('');
  const [diceOpen, setDiceOpen] = useState(false);
  const [diceRolls, setDiceRolls] = useState([]);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  const notify = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  }, []);

  // --- Auth state ---
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setAuthLoading(false);
      if (user) {
        await createSocket();
      }
      setAuthUser(user);
    });
  }, []);

  // --- Socket base listeners (connect/disconnect) ---
  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    if (s.connected) setConnected(true);
    s.on('connect', () => {
      setConnected(true);
      // If we reconnect after a server restart, room state is gone server-side.
      // Drop back to lobby so the user can re-join cleanly.
      setCurrentRoom(null);
      setGameState(null);
      setIsGM(false);
      setChatMessages([]);
    });
    s.on('disconnect', () => setConnected(false));

    return () => {
      s.off('connect');
      s.off('disconnect');
    };
  }, [authUser]);

  // --- Room joined handler ---
  const handleRoomJoined = useCallback((data) => {
    const { roomId, inviteCode, realmName, isGM: gmFlag, state, chatLog } = data;
    setCurrentRoom({ roomId, inviteCode, realmName });
    setIsGM(gmFlag);
    setGameState(structuredClone(state));
    setChatMessages(chatLog || []);
    // Update URL to include room code for easy sharing
    const url = new URL(window.location.href);
    url.searchParams.set('room', inviteCode);
    window.history.replaceState({}, '', url.toString());
    if (gmFlag) trackRealmCreated(); else trackRealmJoined();
  }, []);

  // --- In-room socket listeners ---
  useEffect(() => {
    if (!currentRoom) return;
    const s = getSocket();
    if (!s) return;

    s.on('state:full', ({ state, isGM: gmConfirmed }) => {
      setGameState(structuredClone(state));
      if (gmConfirmed !== undefined) setIsGM(gmConfirmed);
    });

    s.on('tile:setTerrain', ({ key, hex }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.map.hexes[key] = hex;
        return next;
      });
    });

    s.on('tile:setLabel', ({ key, label }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) next.map.hexes[key].label = label;
        return next;
      });
    });

    s.on('tile:setSpecial', ({ key, special }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) next.map.hexes[key].special = special;
        return next;
      });
    });

    s.on('tile:reveal', ({ key, revealed }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) next.map.hexes[key].revealed = revealed;
        return next;
      });
    });

    s.on('map:revealAll', ({ hexes }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.map.hexes = hexes;
        return next;
      });
    });

    s.on('tile:revealSpecial', ({ key, specialRevealed, special }) => {
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

    s.on('tile:setSpecialTile', ({ key, specialTile }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) next.map.hexes[key].specialTile = specialTile;
        return next;
      });
    });

    s.on('player:add', (player) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (!next.players.find(p => p.id === player.id)) next.players.push(player);
        return next;
      });
    });

    s.on('player:move', ({ id, q, r }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        const p = next.players.find(p => p.id === id);
        if (p) { p.q = q; p.r = r; }
        return next;
      });
    });

    s.on('player:remove', ({ id }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.players = next.players.filter(p => p.id !== id);
        return next;
      });
    });

    s.on('player:update', ({ id, updates }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        const p = next.players.find(p => p.id === id);
        if (p) Object.assign(p, updates);
        return next;
      });
    });

    s.on('party:moved', ({ q, r }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.partyMarker = { q, r };
        return next;
      });
    });

    s.on('ping', ({ q, r, socketId }) => {
      const id = `${socketId}-${Date.now()}`;
      setPings(prev => [...prev, { id, q, r }]);
      setTimeout(() => setPings(prev => prev.filter(p => p.id !== id)), 2500);
    });

    s.on('dice:rolled', (roll) => {
      setDiceRolls(prev => [...prev.slice(-49), roll]);
    });

    s.on('map:renamed', ({ name }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.map.name = name;
        return next;
      });
    });

    s.on('map:saved', ({ name }) => notify(`Map "${name}" saved.`));
    s.on('state:saved', ({ name }) => notify(`Game state "${name}" saved.`));
    s.on('error:save', ({ message }) => notify(`Save error: ${message}`));
    s.on('error:load', ({ message }) => notify(`Load error: ${message}`));

    return () => {
      s.off('state:full');
      s.off('tile:setTerrain');
      s.off('tile:setLabel');
      s.off('tile:setSpecial');
      s.off('tile:reveal');
      s.off('tile:revealSpecial');
      s.off('tile:setSpecialTile');
      s.off('player:add');
      s.off('player:move');
      s.off('player:remove');
      s.off('player:update');
      s.off('party:moved');
      s.off('ping');
      s.off('dice:rolled');
      s.off('map:renamed');
      s.off('map:saved');
      s.off('state:saved');
      s.off('error:save');
      s.off('error:load');
    };
  }, [currentRoom, notify]);

  // --- GM actions ---
  const handleHexClick = useCallback((key, hex) => {
    if (!isGM) return;
    if (mode === 'build') {
      socket.emit('tile:setTerrain', { key, terrain: selectedTerrain, label: hex?.label });
    } else {
      socket.emit('tile:reveal', { key });
      trackHexRevealed();
    }
  }, [isGM, mode, selectedTerrain]);

  const handleHexRightClick = useCallback((key) => {
    if (!isGM) return;
    if (mode === 'build') {
      socket.emit('tile:setSpecialTile', { key, specialTile: selectedSpecialTile });
    } else {
      socket.emit('tile:revealSpecial', { key });
    }
  }, [isGM, mode, selectedSpecialTile]);

  const handlePlayerMove = useCallback((id, q, r) => {
    if (!isGM) return;
    socket.emit('player:move', { id, q, r });
  }, [isGM]);

  const handlePartyMove = useCallback((q, r) => {
    if (!isGM) return;
    socket.emit('party:move', { q, r });
  }, [isGM]);

  const handlePing = useCallback((q, r) => {
    socket.emit('ping', { q, r });
    trackPing();
  }, []);

  const handleClearLog = useCallback(() => setDiceRolls([]), []);

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
    setGameState(null);
    setIsGM(false);
    setChatMessages([]);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  };

  // ── SCREENS ──

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <h1>Mythic Bastionland</h1>
          <p>Checking sign-in…</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="login-screen">
        <div className="login-content">
          <h1 className="app-title">Mythic Bastionland</h1>
          <p className="login-subtitle">Remote Play</p>
          <button
            className="btn-google"
            onClick={() => signInWithPopup(auth, googleProvider).then(trackSignIn).catch(() => {})}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <h1>Mythic Bastionland</h1>
          <p>Connecting…</p>
        </div>
      </div>
    );
  }

  // Show Lobby if not in a room yet
  if (!currentRoom || !gameState) {
    return <Lobby authUser={authUser} onJoined={handleRoomJoined} />;
  }

  // ── MAIN GAME UI ──
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Mythic Bastionland</h1>
        <span className="map-name">{gameState.map.name}</span>
        <div className="header-right">
          {isGM && (
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

          {isGM && currentRoom.inviteCode && (
            <div className="invite-code-wrap">
              <button
                className="invite-code-btn"
                onClick={() => setShowInviteCode(v => !v)}
                title="Show invite code"
              >
                🔑 {showInviteCode ? currentRoom.inviteCode : '••••••'}
              </button>
              {showInviteCode && (
                <button
                  className="copy-code-btn"
                  title="Copy invite link"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('room', currentRoom.inviteCode);
                    navigator.clipboard.writeText(url.toString());
                    notify('Invite link copied!');
                  }}
                >📋</button>
              )}
            </div>
          )}

          <button
            className={`dice-header-btn${diceOpen ? ' active' : ''}`}
            onClick={() => setDiceOpen(o => !o)}
            title="Dice Roller"
          >🎲</button>

          <button
            className="btn-secondary btn-leave"
            onClick={handleLeaveRoom}
            title="Back to lobby"
          >⬅ Lobby</button>

          <button className="btn-signout" onClick={() => signOut(auth)} title="Sign out">
            {authUser.displayName?.split(' ')[0] || 'Sign out'} ↩
          </button>
          <div className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} title={connected ? 'Connected' : 'Disconnected'} />
        </div>
      </header>

      <div className="app-body">
        {isGM && (
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
            partyMarker={gameState.partyMarker}
            pings={pings}
            isGM={isGM}
            mode={mode}
            onHexClick={handleHexClick}
            onHexRightClick={handleHexRightClick}
            onPlayerMove={handlePlayerMove}
            onPartyMove={handlePartyMove}
            onPlayerPing={handlePing}
          />
        </div>
      </div>

      {diceOpen && <DicePanel isGM={isGM} onClose={() => setDiceOpen(false)} rolls={diceRolls} onClearLog={handleClearLog} />}

      <ChatPanel authUser={authUser} isGM={isGM} initialMessages={chatMessages} />

      {notification && (
        <div className="notification">{notification}</div>
      )}

      {!isGM && (
        <div className="player-hint">Click any hex to ping it for the group</div>
      )}
    </div>
  );
}
