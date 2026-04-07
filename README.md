# Mythic Bastionland Online

A real-time, browser-based map tool for playing **Mythic Bastionland** remotely. Anyone can sign in with Google, create a Realm, and invite their players with a short code. The GM controls everything — building the hex map, revealing tiles, placing special locations, and moving tokens. Players connect and watch the map update live.

---

## Features

- **Multi-GM / multi-room** — any signed-in user can create their own Realm; multiple groups can run simultaneously on the same server
- **Lobby** — create a Realm, get a 6-character invite code, and share it with players
- **Live hex map** — all connected players see GM changes instantly via WebSockets
- **Build mode** — paint terrain tiles by clicking or dragging across hexes; right-click to place special locations on top
- **Play mode** — reveal hexes to players one at a time; right-click to reveal a hex's special location
- **Fog of war** — players only see revealed hexes; unrevealed hexes are fogged
- **Player tokens** — GM adds named tokens with colours and drags them across the map
- **Party token** — a shared gold knight (♞) the GM can move to show where the group is
- **Dice roller** — d4/d6/d8/d10/d12/d20, up to 5 of each, rolled server-side and broadcast to the whole room with animated faces
- **Pings** — anyone can click a hex to send a pulsing ping visible to everyone in the room
- **Save / Load** — save the map layout or the full game state (revealed tiles, player positions) and reload later
- **Export PNG** — export the map as a GM or Player version at 2× resolution
- **Auto-save** — room state is automatically saved to Firestore when the GM disconnects

---

## Tile Assets

Place your own tile images inside:

```
client/src/assets/regular_tiles/   ← terrain tiles (one per terrain type)
client/src/assets/special_tiles/   ← special location overlays
```

Images must be `.jpg` files. The filename (without extension, lowercased) becomes the terrain name shown in the toolbar. The project ships with:

| Regular Tiles | Special Tiles |
|---|---|
| castle, crag, forest, fortress | curses, dwellings |
| glade, heath, hills, lake | hazards, monuments |
| marsh, meadow, peaks, plains | ruins, sanctums |
| tower, town, valley | |

---

## Setup

### Requirements

- [Node.js](https://nodejs.org/) v18 or newer
- A [Firebase](https://firebase.google.com/) project with **Authentication** (Google sign-in) and **Firestore** enabled

### 1. Firebase setup

1. Go to [Firebase Console](https://console.firebase.google.com/) → your project
2. Enable **Authentication → Google** as a sign-in provider
3. Enable **Firestore Database** (start in production mode is fine)
4. Go to **Project Settings → Service Accounts → Generate new private key** and save the file as:
   ```
   server/service-account.json
   ```
5. Go to **Project Settings → General** and copy your web app's Firebase config into `client/src/firebase.js` (already configured for this project)

### 2. Environment variables

Create a `.env` file in the project root:

```
# The Firebase UID of the user who should have GM access is no longer needed —
# any signed-in user can create a Realm. Leave this file empty or add PORT:

PORT=3000
```

> The old `GM_UID` and `GM_TOKEN` variables are no longer used. Role is determined per-room.

### 3. Firestore indexes

Deploy the required composite indexes once:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:indexes
```

Or open the Firebase Console → Firestore → Indexes and create them manually if prompted by an error link.

### 4. Install & run

```bash
cd mythic-bastionland-online
npm run install:all
npm run dev
```

The server starts on **port 3000** and the client dev server on **port 5173**.

```
========================================
  Mythic Bastionland Online
========================================

  Auth: Firebase (Google OAuth2)
  Multi-GM mode: any signed-in user can create a realm!

  App URL: http://192.168.x.x:5173/
========================================
```

Share `http://192.168.x.x:5173/` with everyone — GMs and players alike sign in with the same URL.

---

## How it works (user flow)

### As a GM

1. Open the app URL and sign in with Google.
2. In the **Lobby**, go to **My Realms** → type a realm name → click **+ Create Realm**.
3. You enter the map. In the header, click the **🔑** button to reveal your 6-character invite code (e.g. `AB12CD`).
4. Click **📋** to copy a direct join link — send this to your players.
5. Your realm persists in Firestore. Next time, just re-enter it from the Lobby.

### As a Player

1. Open the app URL and sign in with Google.
2. In the **Lobby**, go to **Join Realm** → enter the 6-character code from your GM → click **Join Realm**.
3. Or use the direct link the GM shared — it will auto-fill the code.

---

## Without Firebase (local / offline mode)

If `server/service-account.json` is missing, the server falls back to:
- **No auth verification** — everyone connecting is treated as a player; rooms are created in memory only
- **Local file saves** — maps and states are saved as JSON in `server/saves/`
- **No persistence across restarts** — in-memory rooms are lost when the server stops

This is useful for local LAN play where you don't need cloud saves.

---

## Building the Map (GM)

1. You start in **Build Map** mode by default (toggle in the top-right header).
2. In the **Terrain** tab on the left, click a tile to select it.
3. **Click** any hex to paint that terrain. **Click and drag** to paint multiple hexes.
4. In the **Specials** tab, select a special tile then **right-click** any hex to place it on top of the terrain.
5. Right-click again with **None** selected to remove a special from a hex.
6. Use **+ New Map** in the Terrain tab to create a fresh map with custom dimensions.

---

## Running the Session (GM)

1. Switch to **Play Mode** using the toggle in the header.
2. **Left-click** a hex to reveal it to players (click again to hide it).
3. **Right-click** a hex to reveal its special location to players (click again to hide it).
4. Use the **Players** tab to add named tokens with colours. Drag tokens directly on the map to move them.
5. Drag the gold **party token** (♞) to show where the group is exploring.
6. Use the **Files** tab to save and reload map layouts or full game states mid-session.

---

## Saving & Loading

In the **Files** tab:

| Button | What it saves |
|---|---|
| **Save Map** | The map layout only (terrain, specials, labels) — no reveal state or players |
| **Save State** | Everything: map layout + which tiles are revealed + player positions |

With Firestore enabled, saves are stored in the cloud linked to your account. Without Firestore they go to `server/saves/` as JSON files.

Room state is also **auto-saved** to Firestore whenever the GM disconnects.

---

## Dice Roller

Click **🎲** in the header to open the dice panel.

- Select how many of each die type (d4 / d6 / d8 / d10 / d12 / d20) to roll
- Click **Roll** — results are rolled server-side and broadcast to everyone in the room with animated faces
- **Max roll** shows in gold; **1** shows as a fumble in red
- Non-GM players set their name and colour (saved in the browser) so everyone can see who rolled

---

## Exporting PNG

In the **Files** tab, under **Export PNG**:

- **GM Map** — full map, all terrain and specials visible, with dimming on unrevealed hexes and ✦ markers on hidden specials
- **Player Map** — only revealed hexes show terrain; unrevealed hexes are fully fogged; specials only appear if the GM has revealed them

Exports are 2× resolution for clean printing or sharing.

---

## Project Structure

```
mythic-bastionland-online/
├── server/
│   ├── index.js              — Express + Socket.io server (multi-room)
│   ├── gameState.js          — GameState class: map state, save/load
│   ├── firestoreDb.js        — Firestore CRUD (maps, states, rooms)
│   ├── firebaseAdmin.js      — Firebase Admin SDK init
│   └── saves/                — Local JSON save files (auto-created)
├── client/
│   ├── src/
│   │   ├── App.jsx               — Root component, socket listeners, game UI
│   │   ├── socket.js             — Socket.io client singleton
│   │   ├── firebase.js           — Firebase client SDK config
│   │   ├── tiles.js              — Tile image imports via Vite glob
│   │   ├── components/
│   │   │   ├── Lobby.jsx         — Room creation / join screen
│   │   │   ├── HexMap.jsx        — SVG hex grid, pan/zoom, drag-to-paint
│   │   │   ├── HexTile.jsx       — Individual hex rendering
│   │   │   ├── GMToolbar.jsx     — Terrain picker, players, files
│   │   │   ├── PlayerToken.jsx   — Draggable player token
│   │   │   ├── PartyToken.jsx    — Shared party marker (♞)
│   │   │   ├── DicePanel.jsx     — Dice configuration drawer
│   │   │   ├── DiceResults.jsx   — Animated roll result overlay
│   │   │   └── PingOverlay.jsx   — Animated ping rings
│   │   ├── utils/
│   │   │   └── exportMap.js      — PNG export utility
│   │   └── assets/
│   │       ├── regular_tiles/    — Terrain JPGs
│   │       └── special_tiles/    — Special location JPGs
│   └── index.html
├── firebase.json             — Firebase CLI config (index deployment)
├── firestore.indexes.json    — Composite index definitions
├── package.json              — Root scripts (dev, install:all)
└── README.md
```

---

## Controls Reference

| Action | GM | Player |
|---|---|---|
| Left-click hex (Build) | Paint selected terrain | — |
| Left-click hex (Play) | Reveal / hide hex | Ping location |
| Right-click hex (Build) | Place / clear special tile | — |
| Right-click hex (Play) | Reveal / hide special | — |
| Drag player token | Move token | — |
| Drag party token (♞) | Move party marker | — |
| Middle-click + drag | Pan map | Pan map |
| Alt + drag | Pan map | Pan map |
| Scroll wheel | Zoom in / out | Zoom in / out |
