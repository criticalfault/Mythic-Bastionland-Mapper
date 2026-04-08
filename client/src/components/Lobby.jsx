import React, { useState, useEffect } from 'react';
import socket from '../socket.js';

export default function Lobby({ authUser, onJoined }) {
  const [tab, setTab] = useState('my-realms'); // 'my-realms' | 'join'
  const [realmName, setRealmName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [myRooms, setMyRooms] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  // Request GM's room list on mount
  useEffect(() => {
    socket.emit('lobby:myRooms');
    socket.on('lobby:myRooms', (rooms) => setMyRooms(rooms));
    socket.on('room:joined', onJoined);
    socket.on('lobby:error', ({ message }) => {
      setError(message);
      setCreating(false);
      setJoining(false);
    });
    return () => {
      socket.off('lobby:myRooms');
      socket.off('room:joined');
      socket.off('lobby:error');
    };
  }, [onJoined]);

  // Auto-join from URL ?room=CODE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('room');
    if (urlCode) {
      setInviteCode(urlCode.toUpperCase());
      setTab('join');
    }
  }, []);

  const handleCreate = () => {
    setError('');
    setCreating(true);
    socket.emit('lobby:createRoom', { realmName: realmName.trim() || 'New Realm', password: password.trim() });
  };

  const handleJoin = () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return setError('Enter an invite code.');
    setError('');
    setJoining(true);
    socket.emit('lobby:joinRoom', { inviteCode: code, password: joinPassword.trim() });
  };

  const handleRejoin = (room) => {
    setError('');
    setJoining(true);
    socket.emit('lobby:joinRoom', { inviteCode: room.inviteCode });
  };

  return (
    <div className="lobby-screen">
      <div className="lobby-box">
        <h1 className="lobby-title">Mythic Bastionland</h1>
        <p className="lobby-subtitle">Remote Play</p>

        <div className="lobby-user">
          Signed in as <strong>{authUser.displayName || authUser.email}</strong>
        </div>

        <div className="lobby-tabs">
          <button
            className={tab === 'my-realms' ? 'active' : ''}
            onClick={() => { setTab('my-realms'); setError(''); socket.emit('lobby:myRooms'); }}
          >
            My Realms
          </button>
          <button
            className={tab === 'join' ? 'active' : ''}
            onClick={() => { setTab('join'); setError(''); }}
          >
            Join Realm
          </button>
        </div>

        {error && <div className="lobby-error">{error}</div>}

        {tab === 'my-realms' && (
          <div className="lobby-panel">
            <div className="lobby-create">
              <label className="field-label">Create a New Realm</label>
              <input
                className="text-input"
                placeholder="Realm name…"
                value={realmName}
                onChange={e => setRealmName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                disabled={creating}
              />
              <input
                className="text-input"
                type="password"
                placeholder="Password (optional)…"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={creating}
              />
              <button
                className="btn-primary full-width"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Creating…' : '+ Create Realm'}
              </button>
            </div>

            <div className="lobby-rooms">
              <label className="field-label">Your Realms</label>
              {myRooms === null && <p className="empty-hint">Loading…</p>}
              {myRooms !== null && myRooms.length === 0 && (
                <p className="empty-hint">No realms yet — create one above!</p>
              )}
              {myRooms && myRooms.map(room => (
                <div key={room.roomId} className="lobby-room-row">
                  <div className="lobby-room-info">
                    <span className="lobby-room-name">{room.realmName}{room.hasPassword ? ' 🔒' : ''}</span>
                    <span className="lobby-invite-code">{room.inviteCode}</span>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => handleRejoin(room)}
                    disabled={joining}
                  >
                    Enter
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'join' && (
          <div className="lobby-panel">
            <label className="field-label">Invite Code</label>
            <input
              className="text-input invite-code-input"
              placeholder="ABCDEF"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              maxLength={6}
              disabled={joining}
            />
            <input
              className="text-input"
              type="password"
              placeholder="Password (if required)…"
              value={joinPassword}
              onChange={e => setJoinPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              disabled={joining}
            />
            <button
              className="btn-primary full-width"
              onClick={handleJoin}
              disabled={joining || !inviteCode.trim()}
            >
              {joining ? 'Joining…' : 'Join Realm'}
            </button>
            <p className="lobby-hint">Ask your GM for a 6-character invite code.</p>
          </div>
        )}
      </div>
    </div>
  );
}
