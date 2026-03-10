# MCBE-KI

An AI agent that controls bots (fake players) in **Minecraft Bedrock Edition**.
The AI runs outside the game on a server and communicates with the Minecraft modpack via a WebSocket connection.

The AI can:

- Chat with players
- Control bots
- Collect resources
- Execute tasks autonomously

---

## System Architecture

```
Minecraft Bot (Fake Player)
        ↓
WebSocket connection
        ↓
Agent Server (AI logic – this project)
        ↓
Firebase (Firestore)
        ↓
Response back to Minecraft
```

---

## Features

| Feature | Description |
|---|---|
| **World info** | Stores the world seed, game version, and host language on first connect |
| **World objects** | Tracks trees, villages, ruins in the database |
| **Block updates** | Records every block change vs. the original seed world |
| **World reconstruction** | Current world = seed world + objects + block updates |
| **Chat commands** | The bot understands natural commands from players |
| **Firebase Firestore** | All data is persisted in Firebase |

### Supported chat commands

| Command | Action |
|---|---|
| `follow me` | Bot follows the sender |
| `go to <x> <y> <z>` | Bot navigates to coordinates |
| `mine <x> <y> <z>` | Bot mines the block at coordinates |
| `collect <item>` | Bot collects the specified item |
| `find tree\|village\|ruin` | Bot reports the nearest known object |
| `stop` | Bot stops current activity |

---

## Project Structure

```
MCBE-KI/
├── src/
│   ├── index.js      – Entry point (starts the server)
│   ├── server.js     – WebSocket server
│   ├── agent.js      – AI agent (event analysis + action decisions)
│   ├── world.js      – In-memory world model (seed + objects + block updates)
│   ├── database.js   – Firebase Firestore integration
│   └── config.js     – Configuration (reads .env)
├── test/
│   ├── agent.test.js – Unit tests for the AI agent
│   └── world.test.js – Unit tests for the world model
├── .env.example      – Example environment variables
└── package.json
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Firebase

1. Create a Firebase project at <https://console.firebase.google.com>
2. Enable **Firestore** (Native mode)
3. Generate a service account key: *Project Settings → Service Accounts → Generate new private key*
4. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
# WebSocket port
PORT=8080

# Option A – base64-encoded service account JSON
FIREBASE_CREDENTIALS_BASE64=<base64 string>

# Option B – path to service account JSON file
FIREBASE_CREDENTIALS_PATH=/path/to/serviceAccount.json

# Firebase project ID
FIREBASE_PROJECT_ID=your-project-id
```

### 3. Start the server

```bash
npm start
```

The WebSocket server listens on `ws://localhost:8080` (or the configured port).

---

## WebSocket Protocol

### Client → Server (Minecraft → AI)

```jsonc
// Sent once on connect
{ "type": "world_info", "seed": "123456789", "version": "1.21", "language": "de" }

// Chat message from a player
{ "type": "chat", "player": "Steve", "message": "follow me" }

// A block changed (e.g. player mined something)
{ "type": "block_update", "x": 18, "y": 92, "z": -3, "block": "air" }

// A world object was discovered
{ "type": "object", "objectType": "tree", "x": 0, "y": 64, "z": 0, "species": "oak", "variant": 7 }

// Bot state update
{ "type": "bot_info", "name": "MyBot", "health": 20, "position": { "x": 0, "y": 64, "z": 0 } }
```

### Server → Client (AI → Minecraft)

```jsonc
{ "action": "say",     "message": "Hello! KI agent connected." }
{ "action": "follow",  "player": "Steve" }
{ "action": "go_to",   "x": 10, "y": 64, "z": -30 }
{ "action": "mine",    "x": -5, "y": 60, "z": 0 }
{ "action": "collect", "item": "diamond" }
```

---

## Firebase Data Structure

| Collection | Document | Description |
|---|---|---|
| `world/info` | single document | World seed, version, language |
| `worldObjects` | one per object | Trees, villages, ruins |
| `blockUpdates` | one per change | Block changes vs. seed world |
| `bots/<botId>` | one per bot | Bot state (health, position, …) |

---

## Running Tests

```bash
npm test
```

All tests use the Node.js built-in test runner and do **not** require a Firebase connection.

