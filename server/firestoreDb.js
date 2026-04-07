const admin = require('./firebaseAdmin');

const USE_FIRESTORE = admin !== null;

if (USE_FIRESTORE) {
  console.log('[Firebase] Firestore enabled for map storage.');
} else {
  console.log('[Firebase] Firestore disabled — using local file saves.');
}

const db = USE_FIRESTORE ? admin.firestore() : null;
const MAPS_COLLECTION = 'maps';
const STATES_COLLECTION = 'game-states';
const ROOMS_COLLECTION = 'rooms';

// --- Map CRUD ---

async function saveMap(name, mapData, uid) {
  if (!USE_FIRESTORE) return null;
  const docId = `${uid}_${sanitizeId(name)}`;
  await db.collection(MAPS_COLLECTION).doc(docId).set({
    name,
    uid,
    savedAt: Date.now(),
    data: mapData,
  });
  return docId;
}

async function loadMap(docId) {
  if (!USE_FIRESTORE) throw new Error('Firestore not available');
  const doc = await db.collection(MAPS_COLLECTION).doc(docId).get();
  if (!doc.exists) throw new Error('Map not found');
  return doc.data().data;
}

async function listMaps(uid) {
  if (!USE_FIRESTORE) return [];
  const snap = await db.collection(MAPS_COLLECTION)
    .where('uid', '==', uid)
    .get();
  return snap.docs
    .map(d => ({ id: d.id, name: d.data().name, savedAt: d.data().savedAt }))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

async function deleteMap(docId) {
  if (!USE_FIRESTORE) return;
  await db.collection(MAPS_COLLECTION).doc(docId).delete();
}

async function deleteGameState(docId) {
  if (!USE_FIRESTORE) return;
  await db.collection(STATES_COLLECTION).doc(docId).delete();
}

// --- Game State CRUD ---

async function saveGameState(name, stateData, uid) {
  if (!USE_FIRESTORE) return null;
  const docId = `${uid}_${sanitizeId(name)}`;
  await db.collection(STATES_COLLECTION).doc(docId).set({
    name,
    uid,
    savedAt: Date.now(),
    data: stateData,
  });
  return docId;
}

async function loadGameState(docId) {
  if (!USE_FIRESTORE) throw new Error('Firestore not available');
  const doc = await db.collection(STATES_COLLECTION).doc(docId).get();
  if (!doc.exists) throw new Error('Game state not found');
  return doc.data().data;
}

async function listGameStates(uid) {
  if (!USE_FIRESTORE) return [];
  const snap = await db.collection(STATES_COLLECTION)
    .where('uid', '==', uid)
    .get();
  return snap.docs
    .map(d => ({ id: d.id, name: d.data().name, savedAt: d.data().savedAt }))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

// --- Room CRUD ---

function generateInviteCode() {
  // 6 chars, uppercase, no confusing characters (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createRoom(gmUid, gmName, realmName) {
  const inviteCode = generateInviteCode();
  const data = {
    gmUid,
    gmName,
    realmName: realmName || 'New Realm',
    inviteCode,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    // lastState is written separately by autoSaveRoomState
  };

  if (USE_FIRESTORE) {
    const ref = await db.collection(ROOMS_COLLECTION).add(data);
    return { roomId: ref.id, inviteCode, realmName: data.realmName };
  } else {
    // Fallback: return an in-memory room ID
    const roomId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return { roomId, inviteCode, realmName: data.realmName };
  }
}

async function getRoom(roomId) {
  if (!USE_FIRESTORE) return null;
  const doc = await db.collection(ROOMS_COLLECTION).doc(roomId).get();
  if (!doc.exists) return null;
  return { roomId: doc.id, ...doc.data() };
}

async function getRoomByInviteCode(code) {
  if (!USE_FIRESTORE) return null;
  const snap = await db.collection(ROOMS_COLLECTION)
    .where('inviteCode', '==', code.toUpperCase())
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { roomId: doc.id, ...doc.data() };
}

async function getGMRooms(gmUid) {
  if (!USE_FIRESTORE) return [];
  const snap = await db.collection(ROOMS_COLLECTION)
    .where('gmUid', '==', gmUid)
    .get();
  return snap.docs
    .map(d => ({
      roomId: d.id,
      realmName: d.data().realmName,
      inviteCode: d.data().inviteCode,
      createdAt: d.data().createdAt,
      lastActiveAt: d.data().lastActiveAt,
    }))
    .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
}

async function autoSaveRoomState(roomId, stateSnapshot) {
  if (!USE_FIRESTORE) return;
  try {
    await db.collection(ROOMS_COLLECTION).doc(roomId).update({
      lastState: stateSnapshot,
      lastActiveAt: Date.now(),
    });
  } catch (e) {
    // Non-fatal — room may have been deleted
    console.warn(`[AutoSave] Failed for room ${roomId}:`, e.message);
  }
}

async function deleteRoom(roomId) {
  if (!USE_FIRESTORE) return;
  await db.collection(ROOMS_COLLECTION).doc(roomId).delete();
}

function sanitizeId(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
}

module.exports = {
  USE_FIRESTORE,
  // Maps
  saveMap,
  loadMap,
  listMaps,
  deleteMap,
  deleteGameState,
  // Game states
  saveGameState,
  loadGameState,
  listGameStates,
  // Rooms
  generateInviteCode,
  createRoom,
  getRoom,
  getRoomByInviteCode,
  getGMRooms,
  autoSaveRoomState,
  deleteRoom,
};
