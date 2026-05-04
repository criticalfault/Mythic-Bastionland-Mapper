import React, { useEffect, useState, useCallback } from 'react';
import { auth, googleProvider } from './firebase.js';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { createSocket, getSocket } from './socket.js';
import socket from './socket.js';
import HexMap from './components/HexMap.jsx';
import LandingPage from './components/LandingPage.jsx';
import GMToolbar from './components/GMToolbar.jsx';
import PingOverlay from './components/PingOverlay.jsx';
import DicePanel from './components/DicePanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import Lobby from './components/Lobby.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import DayPhase from './components/DayPhase.jsx';
import { trackSignIn, trackRealmCreated, trackRealmJoined, trackHexRevealed, trackPing } from './utils/analytics.js';

function copyViaExecCommand(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch (_) { /* best-effort */ }
  document.body.removeChild(ta);
}

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [connected, setConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [isGM, setIsGM] = useState(false);
  const [mode, setMode] = useState('build');
  const [selectedTerrain, setSelectedTerrain] = useState('plains');
  const [selectedSpecialTile, setSelectedSpecialTile] = useState(null);
  // selectedMyth: null = myth tool inactive, 'clear' = erase mode, 1-6 = place marker
  const [selectedMyth, setSelectedMyth] = useState(null);
  const [pings, setPings] = useState([]);
  const [notification, setNotification] = useState('');
  const [diceOpen, setDiceOpen] = useState(true);
  const [diceRolls, setDiceRolls] = useState([]);

  // Dice roller identity — lifted here so the header can display/edit it
  const storedId = (() => { try { return JSON.parse(localStorage.getItem('mb-dice-id') || '{}'); } catch { return {}; } })();
  const DICE_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e8e0cc'];
  const [rollerName, setRollerName]   = useState(storedId.name  || '');
  const [rollerColor, setRollerColor] = useState(storedId.color || DICE_COLORS[1]);

  const updateRollerIdentity = (name, color) => {
    localStorage.setItem('mb-dice-id', JSON.stringify({ name, color }));
  };

  const [showInviteCode, setShowInviteCode] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [myCharStats, setMyCharStats] = useState(null);
  const [myCharLocked, setMyCharLocked] = useState(false);
  const [myCharName, setMyCharName] = useState('');
  const [myStatMethod, setMyStatMethod] = useState(null);
  const [myCharFatigued, setMyCharFatigued] = useState(false);
  const [characters, setCharacters] = useState({});
  const [dayPhase, setDayPhase] = useState('morning');

  const notify = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  }, []);

  // --- Auth state ---
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setAuthLoading(false);
      if (user) await createSocket();
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
    const myUid = auth.currentUser?.uid;
    const myChar = myUid ? state.characters?.[myUid] : null;
    setMyCharStats(myChar?.stats || null);
    setMyCharLocked(myChar?.locked || false);
    setMyCharName(myChar?.characterName || '');
    setMyStatMethod(myChar?.statMethod || null);
    setMyCharFatigued(myChar?.fatigued || false);
    setCharacters(state.characters || {});
    setDayPhase(state.dayPhase || 'morning');
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
      setDayPhase(state.dayPhase || 'morning');
      if (gmConfirmed !== undefined) setIsGM(gmConfirmed);
    });

    s.on('tile:setTerrain', ({ key, hex }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        const existingMyth = next.map.hexes[key]?.myth ?? null;
        next.map.hexes[key] = { ...hex, myth: existingMyth };
        return next;
      });
    });

    s.on('tile:setMyth', ({ key, myth }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        if (next.map.hexes[key]) next.map.hexes[key].myth = myth ?? null;
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
        const merged = {};
        for (const [k, h] of Object.entries(hexes)) {
          merged[k] = { ...h, myth: h.myth !== undefined ? h.myth : (next.map.hexes[k]?.myth ?? null) };
        }
        next.map.hexes = merged;
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

    s.on('ping', ({ q, r, socketId, color }) => {
      const id = `${socketId}-${Date.now()}`;
      setPings(prev => [...prev, { id, q, r, color: color || '#f59e0b' }]);
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

    s.on('time:updated', ({ dayPhase: phase }) => setDayPhase(phase));

    s.on('charSheet:updated', ({ uid: updUid, displayName, characterName, stats, locked, statMethod, fatigued }) => {
      if (updUid === auth.currentUser?.uid) {
        setMyCharStats(stats);
        setMyCharLocked(locked ?? false);
        setMyCharName(characterName ?? '');
        setMyStatMethod(statMethod ?? null);
        setMyCharFatigued(fatigued ?? false);
      }
      setCharacters(prev => ({
        ...prev,
        [updUid]: { displayName, characterName: characterName ?? '', stats, locked: locked ?? false, statMethod: statMethod ?? null, fatigued: fatigued ?? false },
      }));
    });

    s.on('map:saved',   ({ name }) => notify(`Map "${name}" saved.`));
    s.on('state:saved', ({ name }) => notify(`Game state "${name}" saved.`));
    s.on('error:save',  ({ message }) => notify(`Save error: ${message}`));
    s.on('error:load',  ({ message }) => notify(`Load error: ${message}`));

    s.on('room:deleted', () => {
      handleLeaveRoom();
      notify('This realm has been deleted.');
    });

    return () => {
      s.off('state:full');
      s.off('tile:setTerrain');
      s.off('tile:setMyth');
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
      s.off('time:updated');
      s.off('charSheet:updated');
      s.off('map:saved');
      s.off('state:saved');
      s.off('error:save');
      s.off('error:load');
      s.off('room:deleted');
    };
  }, [currentRoom, notify]);

  // --- Toolbar selection helpers (mutually exclusive: special tile ↔ myth) ---
  const handleSpecialTileSelect = useCallback((tile) => {
    setSelectedSpecialTile(tile);
    if (tile !== null) setSelectedMyth(null);
  }, []);

  const handleMythSelect = useCallback((myth) => {
    setSelectedMyth(myth);
    setSelectedSpecialTile(null);
  }, []);

  // --- GM actions ---
  const handleHexClick = useCallback((key, hex) => {
    if (!isGM) return;
    if (mode === 'build') {
      if (selectedSpecialTile !== null || selectedMyth !== null) return;
      socket.emit('tile:setTerrain', { key, terrain: selectedTerrain, label: hex?.label });
    } else {
      socket.emit('tile:reveal', { key });
      trackHexRevealed();
    }
  }, [isGM, mode, selectedTerrain, selectedSpecialTile, selectedMyth]);

  const handleHexRightClick = useCallback((key) => {
    if (!isGM) return;
    if (mode === 'build') {
      if (selectedMyth !== null) {
        socket.emit('tile:setMyth', { key, myth: selectedMyth === 'clear' ? null : selectedMyth });
      } else {
        socket.emit('tile:setSpecialTile', { key, specialTile: selectedSpecialTile });
      }
    } else {
      socket.emit('tile:revealSpecial', { key });
    }
  }, [isGM, mode, selectedSpecialTile, selectedMyth]);

  const handlePlayerMove = useCallback((id, q, r) => {
    if (!isGM) return;
    socket.emit('player:move', { id, q, r });
  }, [isGM]);

  const handlePartyMove = useCallback((q, r) => {
    if (!isGM) return;
    socket.emit('party:move', { q, r });
  }, [isGM]);

  const handlePing = useCallback((q, r) => {
    const color = isGM ? '#c8b560' : (rollerColor || '#f59e0b');
    socket.emit('ping', { q, r, color });
    trackPing();
  }, [isGM, rollerColor]);

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
      <LandingPage
        onSignIn={() => signInWithPopup(auth, googleProvider).then(trackSignIn).catch(() => {})}
      />
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

  if (!currentRoom || !gameState) {
    return <Lobby authUser={authUser} onJoined={handleRoomJoined} onSignOut={() => signOut(auth)} />;
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
              <button className={mode === 'build' ? 'active' : ''} onClick={() => setMode('build')}>Build Map</button>
              <button className={mode === 'play'  ? 'active' : ''} onClick={() => setMode('play')}>Play Mode</button>
            </div>
          )}

          {isGM && currentRoom.inviteCode && (
            <div className="invite-code-wrap">
              <button className="invite-code-btn" onClick={() => setShowInviteCode(v => !v)} title="Show invite code">
                🔑 {showInviteCode ? currentRoom.inviteCode : '••••••'}
              </button>
              {showInviteCode && (
                <button
                  className="copy-code-btn"
                  title="Copy invite link"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('room', currentRoom.inviteCode);
                    const text = url.toString();
                    const doNotify = () => notify('Invite link copied!');
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(text).then(doNotify).catch(() => { copyViaExecCommand(text); doNotify(); });
                    } else {
                      copyViaExecCommand(text);
                      doNotify();
                    }
                  }}
                >📋</button>
              )}
            </div>
          )}

          {!isGM && (
            <div className="roller-identity">
              <span className="roller-identity-dot" style={{ background: rollerColor }} />
              <input
                className="roller-identity-input"
                placeholder="Your name…"
                value={rollerName}
                maxLength={30}
                onChange={e => { setRollerName(e.target.value); updateRollerIdentity(e.target.value, rollerColor); }}
              />
              <div className="roller-identity-swatches">
                {DICE_COLORS.map(c => (
                  <button
                    key={c}
                    className={`roller-swatch${rollerColor === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => { setRollerColor(c); updateRollerIdentity(rollerName, c); }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            className={`dice-header-btn${diceOpen ? ' active' : ''}`}
            onClick={() => setDiceOpen(o => !o)}
            title="Dice Roller"
          >🎲</button>

          <button className="btn-secondary btn-leave" onClick={handleLeaveRoom} title="Back to lobby">⬅ Lobby</button>

          <button className="btn-signout" onClick={() => { if (confirm('Sign out? You will leave the current session.')) signOut(auth); }} title="Sign out">
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
            onSpecialTileSelect={handleSpecialTileSelect}
            selectedMyth={selectedMyth}
            onMythSelect={handleMythSelect}
            players={gameState.players}
            map={gameState.map}
            characters={characters}
          />
        )}

        <div className="map-container">
          <DayPhase dayPhase={dayPhase} isGM={isGM} />
          <HexMap
            map={gameState.map}
            players={gameState.players}
            partyMarker={gameState.partyMarker}
            pings={pings}
            isGM={isGM}
            mode={mode}
            selectedSpecialTile={selectedSpecialTile}
            selectedMyth={selectedMyth}
            onHexClick={handleHexClick}
            onHexRightClick={handleHexRightClick}
            onPlayerMove={handlePlayerMove}
            onPartyMove={handlePartyMove}
            onPlayerPing={handlePing}
          />
        </div>
      </div>

      {diceOpen && <DicePanel isGM={isGM} onClose={() => setDiceOpen(false)} rolls={diceRolls} onClearLog={handleClearLog} rollerName={rollerName} rollerColor={rollerColor} />}

      <ChatPanel authUser={authUser} isGM={isGM} initialMessages={chatMessages} />
      {!isGM && authUser && (
        <StatsPanel
          authUser={authUser}
          initialStats={myCharStats}
          initialLocked={myCharLocked}
          initialCharacterName={myCharName}
          initialStatMethod={myStatMethod}
          initialFatigued={myCharFatigued}
        />
      )}

      {notification && <div className="notification">{notification}</div>}

      {!isGM && (
        <div className="player-hint">Click any hex to ping it for the group &nbsp;·&nbsp; Hold <kbd>Alt</kbd> + drag to pan the map</div>
      )}
    </div>
  );
}
