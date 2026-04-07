const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GameState, createEmptyMap } = require('./gameState');
require('dotenv').config();
const admin = require('./firebaseAdmin');
const fsDb = require('./firestoreDb');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve built client in production
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// --- In-memory room registry ---
// roomId → { gs: GameState, gmSockets: Set<socketId>, gmUid, gmName, realmName, inviteCode }
const rooms = new Map();

// inviteCode (uppercase) → roomId  (fast lookup for joining)
const inviteIndex = new Map();

// socketId → roomId  (which room each socket is in)
const socketRoom = new Map();

function getOrCreateRoomInMemory(roomId, meta) {
  if (rooms.has(roomId)) return rooms.get(roomId);
  const entry = {
    gs: new GameState(meta.lastState || null),
    gmSockets: new Set(),
    gmUid: meta.gmUid,
    gmName: meta.gmName,
    realmName: meta.realmName,
    inviteCode: meta.inviteCode,
  };
  rooms.set(roomId, entry);
  inviteIndex.set(meta.inviteCode.toUpperCase(), roomId);
  return entry;
}

function getRoomForSocket(socketId) {
  const roomId = socketRoom.get(socketId);
  if (!roomId) return null;
  return rooms.get(roomId) || null;
}

// Auto-save a room's state to Firestore (debounced per room)
const autoSaveTimers = new Map();
function scheduleAutoSave(roomId) {
  if (autoSaveTimers.has(roomId)) clearTimeout(autoSaveTimers.get(roomId));
  autoSaveTimers.set(roomId, setTimeout(async () => {
    autoSaveTimers.delete(roomId);
    const room = rooms.get(roomId);
    if (!room) return;
    await fsDb.autoSaveRoomState(roomId, room.gs.toSnapshot());
  }, 5000)); // 5-second debounce
}

// --- Socket.io ---

io.on('connection', (socket) => {
  const { idToken } = socket.handshake.auth;

  let uid = null;
  let displayName = 'Player';

  // Verify token asynchronously — but register handlers SYNCHRONOUSLY below
  // so no events are dropped while we wait for Firebase.
  const authReady = (admin && idToken)
    ? admin.auth().verifyIdToken(idToken)
        .then(decoded => {
          uid = decoded.uid;
          displayName = decoded.name || decoded.email || 'Player';
        })
        .catch(e => console.warn(`[Auth] Token verification failed: ${e.message}`))
    : Promise.resolve();

  authReady.then(() => {
    console.log(`[connected] socket=${socket.id} uid=${uid || 'anon'} name="${displayName}"`);
  });

  // ── LOBBY EVENTS (before joining a room) ──

  // List all rooms this user is GM of
  socket.on('lobby:myRooms', async () => {
    await authReady;
    console.log(`[lobby:myRooms] uid=${uid} USE_FIRESTORE=${fsDb.USE_FIRESTORE}`);
    if (!uid) {
      console.warn('[lobby:myRooms] No uid — token not verified, returning empty list');
      return socket.emit('lobby:myRooms', []);
    }
    // Always include in-memory rooms regardless of Firestore
    const localRooms = [];
    for (const [rid, room] of rooms.entries()) {
      if (room.gmUid === uid) {
        localRooms.push({
          roomId: rid,
          realmName: room.realmName,
          inviteCode: room.inviteCode,
          lastActiveAt: Date.now(),
        });
      }
    }

    if (!fsDb.USE_FIRESTORE) {
      console.log(`[lobby:myRooms] Firestore off, returning ${localRooms.length} local rooms`);
      return socket.emit('lobby:myRooms', localRooms);
    }

    try {
      const gmRooms = await fsDb.getGMRooms(uid);
      console.log(`[lobby:myRooms] Firestore returned ${gmRooms.length} rooms for uid=${uid}`);
      // Merge Firestore rooms with any in-memory ones not yet persisted
      const firestoreIds = new Set(gmRooms.map(r => r.roomId));
      for (const local of localRooms) {
        if (!firestoreIds.has(local.roomId)) gmRooms.push(local);
      }
      socket.emit('lobby:myRooms', gmRooms);
    } catch (e) {
      console.error('[lobby:myRooms] Firestore error:', e.message);
      // Fall back to in-memory rooms
      socket.emit('lobby:myRooms', localRooms);
    }
  });

  // Create a new room
  socket.on('lobby:createRoom', async ({ realmName }) => {
    await authReady;
    if (!uid) return socket.emit('lobby:error', { message: 'Not signed in.' });
    try {
      const result = await fsDb.createRoom(uid, displayName, realmName || 'New Realm');
      const room = getOrCreateRoomInMemory(result.roomId, {
        gmUid: uid,
        gmName: displayName,
        realmName: result.realmName,
        inviteCode: result.inviteCode,
        lastState: null,
      });
      // GM joins the room
      room.gmSockets.add(socket.id);
      socket.join(result.roomId);
      socketRoom.set(socket.id, result.roomId);

      console.log(`[Room created] id=${result.roomId} code=${result.inviteCode} by ${displayName}`);
      socket.emit('room:joined', {
        roomId: result.roomId,
        inviteCode: result.inviteCode,
        realmName: result.realmName,
        isGM: true,
        state: room.gs.getState(),
      });
    } catch (e) {
      console.error('[lobby:createRoom]', e);
      socket.emit('lobby:error', { message: `Failed to create room: ${e.message}` });
    }
  });

  // Join a room by invite code
  socket.on('lobby:joinRoom', async ({ inviteCode }) => {
    await authReady;
    if (!inviteCode) return socket.emit('lobby:error', { message: 'No invite code provided.' });
    const code = String(inviteCode).trim().toUpperCase();

    try {
      let roomId = inviteIndex.get(code);
      let meta = null;

      if (!roomId) {
        // Not in memory — try Firestore
        const roomDoc = await fsDb.getRoomByInviteCode(code);
        if (!roomDoc) {
          return socket.emit('lobby:error', { message: `Invite code "${code}" not found.` });
        }
        roomId = roomDoc.roomId;
        meta = roomDoc;
      }

      if (!rooms.has(roomId)) {
        // Restore from Firestore
        const roomDoc = meta || await fsDb.getRoom(roomId);
        if (!roomDoc) {
          return socket.emit('lobby:error', { message: 'Room no longer exists.' });
        }
        getOrCreateRoomInMemory(roomId, roomDoc);
      }

      const room = rooms.get(roomId);
      const isGM = uid && uid === room.gmUid;
      if (isGM) room.gmSockets.add(socket.id);

      socket.join(roomId);
      socketRoom.set(socket.id, roomId);

      console.log(`[Room joined] id=${roomId} code=${code} by ${displayName} isGM=${isGM}`);
      socket.emit('room:joined', {
        roomId,
        inviteCode: room.inviteCode,
        realmName: room.realmName,
        isGM,
        state: room.gs.getState(),
      });
    } catch (e) {
      console.error('[lobby:joinRoom]', e);
      socket.emit('lobby:error', { message: `Failed to join room: ${e.message}` });
    }
  });

  // ── HELPERS ──

  const isGMSocket = () => {
    const room = getRoomForSocket(socket.id);
    if (!room || !room.gmSockets.has(socket.id)) return false;
    return true;
  };

  const roomId = () => socketRoom.get(socket.id);
  const gs = () => getRoomForSocket(socket.id)?.gs;

  const broadcastRoom = (event, data) => {
    const rid = roomId();
    if (rid) io.to(rid).emit(event, data);
  };

  const emitToGMs = (event, data) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    for (const sid of room.gmSockets) {
      io.to(sid).emit(event, data);
    }
  };

  // ── IN-ROOM GM EVENTS ──

  socket.on('tile:setTerrain', ({ key, terrain, label }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.updateTerrain(key, terrain, label);
    broadcastRoom('tile:setTerrain', { key, hex: g.getState().map.hexes[key] });
    scheduleAutoSave(roomId());
  });

  socket.on('tile:setSpecialTile', ({ key, specialTile }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.updateSpecialTile(key, specialTile);
    broadcastRoom('tile:setSpecialTile', { key, specialTile: g.getState().map.hexes[key]?.specialTile });
    scheduleAutoSave(roomId());
  });

  socket.on('tile:setLabel', ({ key, label }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.updateHexLabel(key, label);
    broadcastRoom('tile:setLabel', { key, label });
    scheduleAutoSave(roomId());
  });

  socket.on('tile:setSpecial', ({ key, special }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.updateHexSpecial(key, special);
    // GM-only — don't broadcast to players
    socket.emit('tile:setSpecial', { key, special });
  });

  socket.on('tile:reveal', ({ key }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.toggleReveal(key);
    broadcastRoom('tile:reveal', { key, revealed: g.getState().map.hexes[key]?.revealed });
    scheduleAutoSave(roomId());
  });

  socket.on('tile:revealSpecial', ({ key }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.toggleSpecialReveal(key);
    const hex = g.getState().map.hexes[key];
    broadcastRoom('tile:revealSpecial', {
      key,
      specialRevealed: hex?.specialRevealed,
      special: hex?.specialRevealed ? hex.special : '',
    });
    scheduleAutoSave(roomId());
  });

  socket.on('player:add', (player) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.addPlayer(player);
    broadcastRoom('player:add', player);
    scheduleAutoSave(roomId());
  });

  socket.on('player:move', ({ id, q, r }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.movePlayer(id, q, r);
    broadcastRoom('player:move', { id, q, r });
    scheduleAutoSave(roomId());
  });

  socket.on('player:remove', ({ id }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.removePlayer(id);
    broadcastRoom('player:remove', { id });
    scheduleAutoSave(roomId());
  });

  socket.on('player:update', ({ id, updates }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.updatePlayer(id, updates);
    broadcastRoom('player:update', { id, updates });
  });

  socket.on('party:move', ({ q, r }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    g.movePartyMarker(q, r);
    broadcastRoom('party:moved', { q, r });
    scheduleAutoSave(roomId());
  });

  socket.on('map:rename', ({ name }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    g.getState().map.name = trimmed;
    broadcastRoom('map:renamed', { name: trimmed });
    scheduleAutoSave(roomId());
  });

  socket.on('map:new', ({ cols, rows, name }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    const rid = roomId();
    const map = createEmptyMap(cols, rows, name);
    g.setMap(map);
    // Send full state to all in room — players get isGM: false, GM gets isGM: true
    io.to(rid).emit('state:full', { state: g.getState(), isGM: false });
    socket.emit('state:full', { state: g.getState(), isGM: true });
    scheduleAutoSave(rid);
  });

  socket.on('map:save', async ({ name }) => {
    await authReady;
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    try {
      if (fsDb.USE_FIRESTORE && uid) {
        const docId = await fsDb.saveMap(name || g.getState().map.name, g.getState().map, uid);
        socket.emit('map:saved', { id: docId, name: name || g.getState().map.name });
      } else {
        const filename = g.saveMap(name);
        socket.emit('map:saved', { filename, name: name || g.getState().map.name });
      }
    } catch (e) {
      socket.emit('error:save', { message: e.message });
    }
  });

  socket.on('map:load', async ({ filename, id }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    const rid = roomId();
    try {
      if (fsDb.USE_FIRESTORE && id) {
        const mapData = await fsDb.loadMap(id);
        g.setMap(mapData);
      } else {
        g.loadMap(filename);
      }
      io.to(rid).emit('state:full', { state: g.getState(), isGM: false });
      socket.emit('state:full', { state: g.getState(), isGM: true });
      scheduleAutoSave(rid);
    } catch (e) {
      socket.emit('error:load', { message: e.message });
    }
  });

  socket.on('state:save', async ({ name }) => {
    await authReady;
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    try {
      if (fsDb.USE_FIRESTORE && uid) {
        const docId = await fsDb.saveGameState(name || g.getState().map.name, g.getState(), uid);
        socket.emit('state:saved', { id: docId, name: name || g.getState().map.name });
      } else {
        const filename = g.saveGameState(name);
        socket.emit('state:saved', { filename, name });
      }
    } catch (e) {
      socket.emit('error:save', { message: e.message });
    }
  });

  socket.on('state:load', async ({ filename, id }) => {
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    const rid = roomId();
    try {
      if (fsDb.USE_FIRESTORE && id) {
        const stateData = await fsDb.loadGameState(id);
        g.getState().map = stateData.map;
        g.getState().players = stateData.players || [];
        g.getState().partyMarker = stateData.partyMarker || { q: 0, r: 0 };
      } else {
        g.loadGameState(filename);
      }
      io.to(rid).emit('state:full', { state: g.getState(), isGM: false });
      socket.emit('state:full', { state: g.getState(), isGM: true });
      scheduleAutoSave(rid);
    } catch (e) {
      socket.emit('error:load', { message: e.message });
    }
  });

  socket.on('map:list', async () => {
    await authReady;
    if (!isGMSocket()) return;
    const g = gs(); if (!g) return;
    console.log(`[map:list] uid=${uid} USE_FIRESTORE=${fsDb.USE_FIRESTORE}`);
    try {
      if (fsDb.USE_FIRESTORE && uid) {
        const maps = await fsDb.listMaps(uid);
        const states = await fsDb.listGameStates(uid);
        console.log(`[map:list] Found ${maps.length} maps, ${states.length} states`);
        socket.emit('map:list', { maps, states, source: 'firestore' });
      } else {
        const maps = g.listSaves('map');
        const states = g.listSaves('state');
        console.log(`[map:list] Local: ${maps.length} maps, ${states.length} states`);
        socket.emit('map:list', { maps, states, source: 'local' });
      }
    } catch (e) {
      console.error('[map:list] Firestore error:', e.message, e.stack);
      // Fall back to local saves
      socket.emit('map:list', {
        maps: g.listSaves('map'),
        states: g.listSaves('state'),
        source: 'local',
      });
    }
  });

  // ── DICE (available to all in room) ──

  socket.on('dice:roll', ({ dice, rollerName, rollerColor }) => {
    const rid = roomId();
    if (!rid) return; // must be in a room
    const results = [];
    for (const { type, count } of (Array.isArray(dice) ? dice : [])) {
      const t = parseInt(type);
      const c = Math.max(1, Math.min(5, parseInt(count) || 1));
      if (![4, 6, 8, 10, 12, 20].includes(t)) continue;
      for (let i = 0; i < c; i++) {
        results.push({ type: t, result: Math.floor(Math.random() * t) + 1 });
      }
    }
    if (results.length === 0) return;
    const safeColor = /^#[0-9a-fA-F]{6}$/.test(String(rollerColor)) ? rollerColor : '#ffffff';
    io.to(rid).emit('dice:rolled', {
      id: `roll-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      rollerName: String(rollerName || 'Unknown').trim().slice(0, 30),
      rollerColor: safeColor,
      results,
      timestamp: Date.now(),
    });
  });

  // ── PING (available to all in room) ──

  socket.on('ping', ({ q, r }) => {
    const rid = roomId();
    if (!rid) return;
    io.to(rid).emit('ping', { q, r, socketId: socket.id });
  });

  // ── DISCONNECT ──

  socket.on('disconnect', async () => {
    const rid = socketRoom.get(socket.id);
    if (rid) {
      const room = rooms.get(rid);
      if (room) {
        room.gmSockets.delete(socket.id);
        // Auto-save on GM disconnect
        if (room.gmSockets.size === 0) {
          await fsDb.autoSaveRoomState(rid, room.gs.toSnapshot());
          console.log(`[AutoSave] Room ${rid} saved on GM disconnect`);
        }
      }
      socketRoom.delete(socket.id);
    }
    console.log(`[disconnected] socket=${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) { localIP = addr.address; break; }
    }
    if (localIP !== 'localhost') break;
  }

  console.log('\n========================================');
  console.log('  Mythic Bastionland Online');
  console.log('========================================');
  if (admin) {
    console.log('\n  Auth: Firebase (Google OAuth2)');
    console.log('\n  Multi-GM mode: any signed-in user can create a realm!');
  } else {
    console.log('\n  Auth: Anonymous (no service-account.json)');
    console.log('  Sign in via Google OAuth; rooms are in-memory only.');
  }
  console.log(`\n  App URL: http://${localIP}:5173/`);
  console.log('========================================\n');
});
