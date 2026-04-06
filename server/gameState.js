const fs = require('fs');
const path = require('path');

const SAVES_DIR = path.join(__dirname, 'saves');

// Valid regular terrain tile names (must match filenames in regular_tiles/ without extension)
const VALID_TERRAINS = new Set([
  'castle','crag','forest','fortress','glade','heath',
  'hills','lake','marsh','meadow','peaks','plains',
  'tower','town','valley','empty',
]);

// Valid special tile names (lowercase, must match filenames in special_tiles/ without extension)
const VALID_SPECIALS = new Set([
  'curses','dwellings','hazards','monuments','ruins','sanctums',
]);

function makeHex(q, r, terrain = 'empty') {
  return {
    q, r,
    terrain: VALID_TERRAINS.has(terrain) ? terrain : 'empty',
    specialTile: null,   // one of VALID_SPECIALS, or null
    label: '',
    revealed: false,
    special: '',         // GM text note
    specialRevealed: false,
  };
}

function createEmptyMap(cols = 10, rows = 8, name = 'New Realm') {
  const hexes = {};
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const key = `${q},${r}`;
      hexes[key] = makeHex(q, r);
    }
  }
  return {
    id: `map-${Date.now()}`,
    name,
    cols,
    rows,
    hexes,
  };
}

// Game state: the live play state on top of a map
let state = {
  map: createEmptyMap(),
  players: [],      // { id, name, color, q, r }
};

function getState() {
  return state;
}

function setMap(map) {
  state.map = map;
  // Reset players when loading a new map
  state.players = [];
}

function updateTerrain(key, terrain, label) {
  if (!state.map.hexes[key]) return false;
  state.map.hexes[key] = {
    ...state.map.hexes[key],
    terrain: VALID_TERRAINS.has(terrain) ? terrain : state.map.hexes[key].terrain,
    label: label !== undefined ? label : state.map.hexes[key].label,
  };
  return true;
}

function updateSpecialTile(key, specialTile) {
  if (!state.map.hexes[key]) return false;
  // null clears it; otherwise validate
  const val = specialTile ? specialTile.toLowerCase() : null;
  state.map.hexes[key].specialTile = (val && VALID_SPECIALS.has(val)) ? val : null;
  return true;
}

function updateHexLabel(key, label) {
  if (!state.map.hexes[key]) return false;
  state.map.hexes[key].label = label;
  return true;
}

function updateHexSpecial(key, special) {
  if (!state.map.hexes[key]) return false;
  state.map.hexes[key].special = special;
  return true;
}

function toggleReveal(key) {
  if (!state.map.hexes[key]) return false;
  state.map.hexes[key].revealed = !state.map.hexes[key].revealed;
  return true;
}

function toggleSpecialReveal(key) {
  if (!state.map.hexes[key]) return false;
  state.map.hexes[key].specialRevealed = !state.map.hexes[key].specialRevealed;
  return true;
}

function addPlayer(player) {
  const existing = state.players.find(p => p.id === player.id);
  if (existing) return;
  state.players.push(player);
}

function movePlayer(id, q, r) {
  const player = state.players.find(p => p.id === id);
  if (!player) return false;
  player.q = q;
  player.r = r;
  return true;
}

function removePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
}

function updatePlayer(id, updates) {
  const player = state.players.find(p => p.id === id);
  if (!player) return false;
  Object.assign(player, updates);
  return true;
}

// --- Persistence ---

function listSaves(type) {
  // type: 'map' | 'state'
  try {
    const files = fs.readdirSync(SAVES_DIR);
    return files
      .filter(f => f.startsWith(type + '-') && f.endsWith('.json'))
      .map(f => ({ filename: f, name: f.replace(`${type}-`, '').replace('.json', '') }));
  } catch {
    return [];
  }
}

function saveMap(name) {
  const filename = `map-${sanitize(name)}.json`;
  fs.writeFileSync(
    path.join(SAVES_DIR, filename),
    JSON.stringify(state.map, null, 2)
  );
  return filename;
}

function loadMap(filename) {
  const data = fs.readFileSync(path.join(SAVES_DIR, filename), 'utf8');
  const map = JSON.parse(data);
  setMap(map);
  return map;
}

function saveGameState(name) {
  const saveData = {
    mapId: state.map.id,
    mapName: state.map.name,
    map: state.map,
    players: state.players,
  };
  const filename = `state-${sanitize(name)}.json`;
  fs.writeFileSync(
    path.join(SAVES_DIR, filename),
    JSON.stringify(saveData, null, 2)
  );
  return filename;
}

function loadGameState(filename) {
  const data = fs.readFileSync(path.join(SAVES_DIR, filename), 'utf8');
  const saveData = JSON.parse(data);
  state.map = saveData.map;
  state.players = saveData.players || [];
  return state;
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
}

module.exports = {
  VALID_TERRAINS,
  VALID_SPECIALS,
  getState,
  setMap,
  createEmptyMap,
  updateTerrain,
  updateSpecialTile,
  updateHexLabel,
  updateHexSpecial,
  toggleReveal,
  toggleSpecialReveal,
  addPlayer,
  movePlayer,
  removePlayer,
  updatePlayer,
  listSaves,
  saveMap,
  loadMap,
  saveGameState,
  loadGameState,
};
