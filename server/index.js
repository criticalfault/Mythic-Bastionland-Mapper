const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const gs = require('./gameState');

// GM token: set GM_TOKEN env var for a custom secret, otherwise defaults to "gm"
const GM_TOKEN = process.env.GM_TOKEN || 'gm';
const ROOM_ID = crypto.randomBytes(6).toString('hex');

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

// REST: expose room info (for QR / sharing)
app.get('/api/room', (req, res) => {
  res.json({ roomId: ROOM_ID });
});

// --- Socket.io ---

// Track which socket IDs are GMs
const gmSockets = new Set();

io.on('connection', (socket) => {
  const { gmToken, roomId } = socket.handshake.auth;

  const isGM = gmToken === GM_TOKEN;
  if (isGM) {
    gmSockets.add(socket.id);
    console.log(`[GM connected] socket=${socket.id}`);
  } else {
    console.log(`[Player connected] socket=${socket.id}`);
  }

  // Send full state on connect
  socket.emit('state:full', { state: gs.getState(), isGM, roomId: ROOM_ID });

  // --- GM-only events ---

  const isGMSocket = () => {
    if (!gmSockets.has(socket.id)) {
      console.warn(`[REJECTED GM event] socket=${socket.id} — wrong or missing GM token`);
      return false;
    }
    return true;
  };

  socket.on('tile:setTerrain', ({ key, terrain, label }) => {
    if (!isGMSocket()) return;
    gs.updateTerrain(key, terrain, label);
    io.emit('tile:setTerrain', { key, hex: gs.getState().map.hexes[key] });
  });

  socket.on('tile:setSpecialTile', ({ key, specialTile }) => {
    if (!isGMSocket()) return;
    gs.updateSpecialTile(key, specialTile);
    io.emit('tile:setSpecialTile', { key, specialTile: gs.getState().map.hexes[key]?.specialTile });
  });

  socket.on('tile:setLabel', ({ key, label }) => {
    if (!isGMSocket()) return;
    gs.updateHexLabel(key, label);
    io.emit('tile:setLabel', { key, label });
  });

  socket.on('tile:setSpecial', ({ key, special }) => {
    if (!isGMSocket()) return;
    gs.updateHexSpecial(key, special);
    socket.emit('tile:setSpecial', { key, special });
  });

  socket.on('tile:reveal', ({ key }) => {
    if (!isGMSocket()) return;
    gs.toggleReveal(key);
    io.emit('tile:reveal', { key, revealed: gs.getState().map.hexes[key]?.revealed });
  });

  socket.on('tile:revealSpecial', ({ key }) => {
    if (!isGMSocket()) return;
    gs.toggleSpecialReveal(key);
    const hex = gs.getState().map.hexes[key];
    io.emit('tile:revealSpecial', {
      key,
      specialRevealed: hex?.specialRevealed,
      special: hex?.specialRevealed ? hex.special : ''
    });
  });

  socket.on('player:add', (player) => {
    if (!isGMSocket()) return;
    gs.addPlayer(player);
    io.emit('player:add', player);
  });

  socket.on('player:move', ({ id, q, r }) => {
    if (!isGMSocket()) return;
    gs.movePlayer(id, q, r);
    io.emit('player:move', { id, q, r });
  });

  socket.on('player:remove', ({ id }) => {
    if (!isGMSocket()) return;
    gs.removePlayer(id);
    io.emit('player:remove', { id });
  });

  socket.on('player:update', ({ id, updates }) => {
    if (!isGMSocket()) return;
    gs.updatePlayer(id, updates);
    io.emit('player:update', { id, updates });
  });

  socket.on('map:rename', ({ name }) => {
    if (!isGMSocket()) return;
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    gs.getState().map.name = trimmed;
    io.emit('map:renamed', { name: trimmed });
  });

  socket.on('map:new', ({ cols, rows, name }) => {
    if (!isGMSocket()) return;
    const map = gs.createEmptyMap(cols, rows, name);
    gs.setMap(map);
    io.emit('state:full', { state: gs.getState(), isGM: false, roomId: ROOM_ID });
    socket.emit('state:full', { state: gs.getState(), isGM: true, roomId: ROOM_ID });
  });

  socket.on('map:save', ({ name }) => {
    if (!isGMSocket()) return;
    try {
      const filename = gs.saveMap(name);
      socket.emit('map:saved', { filename, name });
    } catch (e) {
      socket.emit('error:save', { message: e.message });
    }
  });

  socket.on('map:load', ({ filename }) => {
    if (!isGMSocket()) return;
    try {
      gs.loadMap(filename);
      io.emit('state:full', { state: gs.getState(), isGM: false, roomId: ROOM_ID });
      socket.emit('state:full', { state: gs.getState(), isGM: true, roomId: ROOM_ID });
    } catch (e) {
      socket.emit('error:load', { message: e.message });
    }
  });

  socket.on('state:save', ({ name }) => {
    if (!isGMSocket()) return;
    try {
      const filename = gs.saveGameState(name);
      socket.emit('state:saved', { filename, name });
    } catch (e) {
      socket.emit('error:save', { message: e.message });
    }
  });

  socket.on('state:load', ({ filename }) => {
    if (!isGMSocket()) return;
    try {
      gs.loadGameState(filename);
      io.emit('state:full', { state: gs.getState(), isGM: false, roomId: ROOM_ID });
      socket.emit('state:full', { state: gs.getState(), isGM: true, roomId: ROOM_ID });
    } catch (e) {
      socket.emit('error:load', { message: e.message });
    }
  });

  socket.on('map:list', () => {
    if (!isGMSocket()) return;
    socket.emit('map:list', {
      maps: gs.listSaves('map'),
      states: gs.listSaves('state'),
    });
  });

  // --- Player events ---

  socket.on('ping', ({ q, r }) => {
    io.emit('ping', { q, r, socketId: socket.id });
  });

  socket.on('disconnect', () => {
    gmSockets.delete(socket.id);
    console.log(`[disconnected] socket=${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  // Detect local IP for sharing
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let localIP = 'localhost';
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        localIP = addr.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }

  console.log('\n========================================');
  console.log('  Mythic Bastionland Online');
  console.log('========================================');
  console.log(`\n  GM URL (keep secret!):`);
  console.log(`  http://${localIP}:5173/?gm=${GM_TOKEN}`);
  console.log(`\n  Player URL (share with players):`);
  console.log(`  http://${localIP}:5173/?room=${ROOM_ID}`);
  console.log('\n========================================\n');
});
