const fs = require('fs');
const path = require('path');

const SAVES_DIR = path.join(__dirname, 'saves');

const VALID_TERRAINS = new Set([
  'castle','crag','forest','fortress','glade','heath',
  'hills','lake','marsh','meadow','peaks','plains',
  'tower','town','valley','empty',
]);

const VALID_SPECIALS = new Set([
  'curses','dwellings','hazards','monuments','ruins','sanctums',
]);

function makeHex(q, r, terrain = 'empty') {
  return {
    q, r,
    terrain: VALID_TERRAINS.has(terrain) ? terrain : 'empty',
    specialTile: null,
    label: '',
    revealed: false,
    special: '',
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

class GameState {
  constructor(savedState) {
    if (savedState) {
      // Restore from persisted data
      this.state = {
        map: savedState.map || createEmptyMap(),
        players: savedState.players || [],
        partyMarker: savedState.partyMarker || { q: 0, r: 0 },
      };
    } else {
      const map = createEmptyMap();
      this.state = {
        map,
        players: [],
        partyMarker: { q: Math.floor(map.cols / 2), r: Math.floor(map.rows / 2) },
      };
    }
    this.undoStack = [];
  }

  getState() { return this.state; }

  setMap(map) {
    this.state.map = map;
    this.state.players = [];
    this.state.partyMarker = {
      q: Math.floor(map.cols / 2),
      r: Math.floor(map.rows / 2),
    };
  }

  movePartyMarker(q, r) {
    this.state.partyMarker = { q, r };
  }

  _pushUndo(key) {
    const prev = this.state.map.hexes[key];
    if (!prev) return;
    this.undoStack.push({ key, hex: structuredClone(prev) });
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  undo() {
    if (this.undoStack.length === 0) return null;
    const { key, hex } = this.undoStack.pop();
    if (!this.state.map.hexes[key]) return null;
    this.state.map.hexes[key] = hex;
    return { key, hex };
  }

  updateTerrain(key, terrain, label) {
    if (!this.state.map.hexes[key]) return false;
    this._pushUndo(key);
    this.state.map.hexes[key] = {
      ...this.state.map.hexes[key],
      terrain: VALID_TERRAINS.has(terrain) ? terrain : this.state.map.hexes[key].terrain,
      label: label !== undefined ? label : this.state.map.hexes[key].label,
    };
    return true;
  }

  updateSpecialTile(key, specialTile) {
    if (!this.state.map.hexes[key]) return false;
    this._pushUndo(key);
    const val = specialTile ? specialTile.toLowerCase() : null;
    this.state.map.hexes[key].specialTile = (val && VALID_SPECIALS.has(val)) ? val : null;
    return true;
  }

  updateHexLabel(key, label) {
    if (!this.state.map.hexes[key]) return false;
    this.state.map.hexes[key].label = label;
    return true;
  }

  updateHexSpecial(key, special) {
    if (!this.state.map.hexes[key]) return false;
    this.state.map.hexes[key].special = special;
    return true;
  }

  toggleReveal(key) {
    if (!this.state.map.hexes[key]) return false;
    this.state.map.hexes[key].revealed = !this.state.map.hexes[key].revealed;
    return true;
  }

  toggleSpecialReveal(key) {
    if (!this.state.map.hexes[key]) return false;
    this.state.map.hexes[key].specialRevealed = !this.state.map.hexes[key].specialRevealed;
    return true;
  }

  addPlayer(player) {
    if (this.state.players.find(p => p.id === player.id)) return;
    this.state.players.push(player);
  }

  movePlayer(id, q, r) {
    const player = this.state.players.find(p => p.id === id);
    if (!player) return false;
    player.q = q;
    player.r = r;
    return true;
  }

  removePlayer(id) {
    this.state.players = this.state.players.filter(p => p.id !== id);
  }

  updatePlayer(id, updates) {
    const player = this.state.players.find(p => p.id === id);
    if (!player) return false;
    Object.assign(player, updates);
    return true;
  }

  // Snapshot for Firestore auto-save
  toSnapshot() {
    return {
      map: this.state.map,
      players: this.state.players,
      partyMarker: this.state.partyMarker,
    };
  }

  // --- Local file persistence (fallback) ---

  listSaves(type) {
    try {
      const files = fs.readdirSync(SAVES_DIR);
      return files
        .filter(f => f.startsWith(type + '-') && f.endsWith('.json'))
        .map(f => ({ filename: f, name: f.replace(`${type}-`, '').replace('.json', '') }));
    } catch {
      return [];
    }
  }

  saveMap(name) {
    ensureSavesDir();
    const filename = `map-${sanitize(name)}.json`;
    fs.writeFileSync(
      path.join(SAVES_DIR, filename),
      JSON.stringify(this.state.map, null, 2)
    );
    return filename;
  }

  loadMap(filename) {
    const data = fs.readFileSync(path.join(SAVES_DIR, filename), 'utf8');
    const map = JSON.parse(data);
    this.setMap(map);
    return map;
  }

  saveGameState(name) {
    ensureSavesDir();
    const saveData = {
      mapId: this.state.map.id,
      mapName: this.state.map.name,
      map: this.state.map,
      players: this.state.players,
      partyMarker: this.state.partyMarker,
    };
    const filename = `state-${sanitize(name)}.json`;
    fs.writeFileSync(
      path.join(SAVES_DIR, filename),
      JSON.stringify(saveData, null, 2)
    );
    return filename;
  }

  loadGameState(filename) {
    const data = fs.readFileSync(path.join(SAVES_DIR, filename), 'utf8');
    const saveData = JSON.parse(data);
    this.state.map = saveData.map;
    this.state.players = saveData.players || [];
    this.state.partyMarker = saveData.partyMarker || {
      q: Math.floor(this.state.map.cols / 2),
      r: Math.floor(this.state.map.rows / 2),
    };
    return this.state;
  }
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
}

function ensureSavesDir() {
  if (!fs.existsSync(SAVES_DIR)) fs.mkdirSync(SAVES_DIR, { recursive: true });
}

module.exports = {
  GameState,
  createEmptyMap,
  VALID_TERRAINS,
  VALID_SPECIALS,
};
