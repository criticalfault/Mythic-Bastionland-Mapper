import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { GameState, createEmptyMap, VALID_TERRAINS, VALID_SPECIALS } = require('../gameState');

// ─────────────────────────────────────────────
// createEmptyMap
// ─────────────────────────────────────────────
describe('createEmptyMap', () => {
  it('creates the right number of hexes', () => {
    const map = createEmptyMap(5, 4, 'Test');
    expect(Object.keys(map.hexes)).toHaveLength(20);
  });

  it('uses default dimensions when none provided', () => {
    const map = createEmptyMap();
    expect(map.cols).toBe(10);
    expect(map.rows).toBe(8);
    expect(Object.keys(map.hexes)).toHaveLength(80);
  });

  it('sets correct name and id', () => {
    const map = createEmptyMap(3, 3, 'My Realm');
    expect(map.name).toBe('My Realm');
    expect(map.id).toMatch(/^map-\d+/);
  });

  it('all hexes start as empty and unrevealed', () => {
    const map = createEmptyMap(3, 3);
    for (const hex of Object.values(map.hexes)) {
      expect(hex.terrain).toBe('empty');
      expect(hex.revealed).toBe(false);
      expect(hex.specialTile).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────
// GameState construction
// ─────────────────────────────────────────────
describe('GameState constructor', () => {
  it('creates a fresh state with empty map by default', () => {
    const gs = new GameState();
    const { map, players, partyMarker } = gs.getState();
    expect(map.cols).toBe(10);
    expect(players).toHaveLength(0);
    expect(partyMarker).toMatchObject({ q: 5, r: 4 });
  });

  it('restores from a saved snapshot', () => {
    const saved = {
      map: createEmptyMap(4, 4, 'Saved'),
      players: [{ id: 'p1', name: 'Knight', q: 1, r: 1, color: '#fff' }],
      partyMarker: { q: 2, r: 2 },
    };
    const gs = new GameState(saved);
    expect(gs.getState().map.name).toBe('Saved');
    expect(gs.getState().players).toHaveLength(1);
    expect(gs.getState().partyMarker).toEqual({ q: 2, r: 2 });
  });
});

// ─────────────────────────────────────────────
// Terrain & special tile updates
// ─────────────────────────────────────────────
describe('updateTerrain', () => {
  let gs;
  beforeEach(() => { gs = new GameState(); });

  it('sets a valid terrain', () => {
    expect(gs.updateTerrain('0,0', 'forest')).toBe(true);
    expect(gs.getState().map.hexes['0,0'].terrain).toBe('forest');
  });

  it('ignores invalid terrain names, keeps original', () => {
    gs.updateTerrain('0,0', 'forest');
    gs.updateTerrain('0,0', 'volcano');
    expect(gs.getState().map.hexes['0,0'].terrain).toBe('forest');
  });

  it('returns false for a non-existent hex key', () => {
    expect(gs.updateTerrain('99,99', 'forest')).toBe(false);
  });

  it('updates label alongside terrain', () => {
    gs.updateTerrain('1,1', 'hills', 'Dragon Hill');
    expect(gs.getState().map.hexes['1,1'].label).toBe('Dragon Hill');
  });
});

describe('updateSpecialTile', () => {
  let gs;
  beforeEach(() => { gs = new GameState(); });

  it('sets a valid special tile', () => {
    gs.updateSpecialTile('0,0', 'ruins');
    expect(gs.getState().map.hexes['0,0'].specialTile).toBe('ruins');
  });

  it('is case-insensitive', () => {
    gs.updateSpecialTile('0,0', 'Sanctums');
    expect(gs.getState().map.hexes['0,0'].specialTile).toBe('sanctums');
  });

  it('clears the special tile when passed null', () => {
    gs.updateSpecialTile('0,0', 'ruins');
    gs.updateSpecialTile('0,0', null);
    expect(gs.getState().map.hexes['0,0'].specialTile).toBeNull();
  });

  it('ignores invalid special names', () => {
    gs.updateSpecialTile('0,0', 'ruins');
    gs.updateSpecialTile('0,0', 'dragons');
    expect(gs.getState().map.hexes['0,0'].specialTile).toBeNull();
  });
});

// ─────────────────────────────────────────────
// Reveal
// ─────────────────────────────────────────────
describe('toggleReveal', () => {
  let gs;
  beforeEach(() => { gs = new GameState(); });

  it('toggles revealed on and off', () => {
    gs.toggleReveal('0,0');
    expect(gs.getState().map.hexes['0,0'].revealed).toBe(true);
    gs.toggleReveal('0,0');
    expect(gs.getState().map.hexes['0,0'].revealed).toBe(false);
  });

  it('returns false for missing key', () => {
    expect(gs.toggleReveal('99,99')).toBe(false);
  });
});

describe('toggleSpecialReveal', () => {
  let gs;
  beforeEach(() => { gs = new GameState(); });

  it('toggles specialRevealed on and off', () => {
    gs.toggleSpecialReveal('1,1');
    expect(gs.getState().map.hexes['1,1'].specialRevealed).toBe(true);
    gs.toggleSpecialReveal('1,1');
    expect(gs.getState().map.hexes['1,1'].specialRevealed).toBe(false);
  });
});

// ─────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────
describe('player management', () => {
  let gs;
  const player = { id: 'p1', name: 'Aldric', color: '#f00', q: 0, r: 0 };

  beforeEach(() => { gs = new GameState(); });

  it('adds a player', () => {
    gs.addPlayer(player);
    expect(gs.getState().players).toHaveLength(1);
    expect(gs.getState().players[0].name).toBe('Aldric');
  });

  it('does not add the same player twice', () => {
    gs.addPlayer(player);
    gs.addPlayer(player);
    expect(gs.getState().players).toHaveLength(1);
  });

  it('moves a player', () => {
    gs.addPlayer(player);
    gs.movePlayer('p1', 3, 4);
    expect(gs.getState().players[0]).toMatchObject({ q: 3, r: 4 });
  });

  it('returns false when moving non-existent player', () => {
    expect(gs.movePlayer('ghost', 0, 0)).toBe(false);
  });

  it('removes a player', () => {
    gs.addPlayer(player);
    gs.removePlayer('p1');
    expect(gs.getState().players).toHaveLength(0);
  });

  it('updates player properties', () => {
    gs.addPlayer(player);
    gs.updatePlayer('p1', { color: '#0f0', name: 'Sir Aldric' });
    expect(gs.getState().players[0].color).toBe('#0f0');
    expect(gs.getState().players[0].name).toBe('Sir Aldric');
  });
});

// ─────────────────────────────────────────────
// Party marker
// ─────────────────────────────────────────────
describe('movePartyMarker', () => {
  it('updates the party marker position', () => {
    const gs = new GameState();
    gs.movePartyMarker(3, 7);
    expect(gs.getState().partyMarker).toEqual({ q: 3, r: 7 });
  });
});

// ─────────────────────────────────────────────
// Undo
// ─────────────────────────────────────────────
describe('undo', () => {
  let gs;
  beforeEach(() => { gs = new GameState(); });

  it('returns null when nothing to undo', () => {
    expect(gs.undo()).toBeNull();
  });

  it('restores terrain after updateTerrain', () => {
    gs.updateTerrain('0,0', 'forest');
    gs.undo();
    expect(gs.getState().map.hexes['0,0'].terrain).toBe('empty');
  });

  it('restores special tile after updateSpecialTile', () => {
    gs.updateSpecialTile('0,0', 'ruins');
    gs.undo();
    expect(gs.getState().map.hexes['0,0'].specialTile).toBeNull();
  });

  it('undoes multiple steps in correct order', () => {
    gs.updateTerrain('0,0', 'forest');
    gs.updateTerrain('0,0', 'lake');
    gs.undo();
    expect(gs.getState().map.hexes['0,0'].terrain).toBe('forest');
    gs.undo();
    expect(gs.getState().map.hexes['0,0'].terrain).toBe('empty');
    expect(gs.undo()).toBeNull();
  });

  it('returns the restored key and hex', () => {
    gs.updateTerrain('2,3', 'hills');
    const result = gs.undo();
    expect(result).not.toBeNull();
    expect(result.key).toBe('2,3');
    expect(result.hex.terrain).toBe('empty');
  });

  it('caps the undo stack at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      gs.updateTerrain('0,0', i % 2 === 0 ? 'forest' : 'hills');
    }
    for (let i = 0; i < 50; i++) gs.undo();
    expect(gs.undo()).toBeNull();
  });

  it('does not push to undo stack when hex is invalid', () => {
    gs.updateTerrain('99,99', 'forest');
    expect(gs.undo()).toBeNull();
  });
});

// ─────────────────────────────────────────────
// setMap
// ─────────────────────────────────────────────
describe('setMap', () => {
  it('replaces the map and resets players and party marker', () => {
    const gs = new GameState();
    gs.addPlayer({ id: 'p1', name: 'X', color: '#fff', q: 0, r: 0 });
    const newMap = createEmptyMap(6, 6, 'New');
    gs.setMap(newMap);
    expect(gs.getState().map.name).toBe('New');
    expect(gs.getState().players).toHaveLength(0);
    expect(gs.getState().partyMarker).toEqual({ q: 3, r: 3 });
  });
});

// ─────────────────────────────────────────────
// toSnapshot
// ─────────────────────────────────────────────
describe('toSnapshot', () => {
  it('returns a plain object with map, players, partyMarker', () => {
    const gs = new GameState();
    gs.updateTerrain('0,0', 'castle');
    gs.addPlayer({ id: 'p1', name: 'X', color: '#fff', q: 0, r: 0 });
    const snap = gs.toSnapshot();
    expect(snap).toHaveProperty('map');
    expect(snap).toHaveProperty('players');
    expect(snap).toHaveProperty('partyMarker');
    expect(snap.map.hexes['0,0'].terrain).toBe('castle');
  });

  it('snapshot can reconstruct an equivalent GameState', () => {
    const gs = new GameState();
    gs.updateTerrain('1,1', 'lake');
    gs.movePartyMarker(2, 2);
    const snap = gs.toSnapshot();
    const gs2 = new GameState(snap);
    expect(gs2.getState().map.hexes['1,1'].terrain).toBe('lake');
    expect(gs2.getState().partyMarker).toEqual({ q: 2, r: 2 });
  });
});

// ─────────────────────────────────────────────
// Valid sets
// ─────────────────────────────────────────────
describe('VALID_TERRAINS and VALID_SPECIALS', () => {
  it('VALID_TERRAINS includes expected values', () => {
    ['castle', 'forest', 'plains', 'empty', 'lake'].forEach(t => {
      expect(VALID_TERRAINS.has(t)).toBe(true);
    });
  });

  it('VALID_SPECIALS includes expected values', () => {
    ['ruins', 'sanctums', 'hazards', 'dwellings'].forEach(s => {
      expect(VALID_SPECIALS.has(s)).toBe(true);
    });
  });

  it('VALID_TERRAINS does not include junk', () => {
    expect(VALID_TERRAINS.has('volcano')).toBe(false);
    expect(VALID_TERRAINS.has('')).toBe(false);
  });
});
