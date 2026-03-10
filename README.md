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
[Minecraft BDS]
  Mosbach addon (fake player)
         │
         │  POST /connect
         ▼
[Website Agent]  (website/server.js)
  OpenClaw agent logic
  Browser control panel
         │
         │  WebSocket
         ▼
[MCBE-KI Agent Server]  (src/index.js)
  AI logic, world state
         │
         ▼
[Supabase (PostgreSQL)]
  Persistent storage
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
| **Supabase** | All data is persisted in a Supabase (PostgreSQL) database |
| **Mosbach addon** | Minecraft Bedrock addon that spawns a fake player and talks to the website agent |
| **Website agent** | Browser-based OpenClaw agent to monitor and control the fake player |

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
│   ├── index.js      – Entry point (starts the WebSocket server)
│   ├── server.js     – WebSocket server
│   ├── agent.js      – AI agent (event analysis + action decisions)
│   ├── world.js      – In-memory world model (seed + objects + block updates)
│   ├── database.js   – Supabase integration
│   └── config.js     – Configuration (reads .env)
├── test/
│   ├── agent.test.js – Unit tests for the AI agent
│   └── world.test.js – Unit tests for the world model
├── Mosbach/
│   ├── manifest.json – Minecraft Bedrock addon manifest
│   ├── scripts/
│   │   └── main.js   – Fake player + HTTP polling logic
│   └── README.md     – Mosbach addon setup guide
├── website/
│   ├── server.js     – Express server (OpenClaw agent + /connect endpoint)
│   ├── public/
│   │   └── index.html – Browser control panel UI
│   ├── package.json
│   └── README.md     – Website agent setup guide
├── .env.example      – Example environment variables
└── package.json
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

1. Create a project at <https://supabase.com>
2. Open the **SQL editor** and run the following to create the required tables:

```sql
-- World metadata (single row)
create table world_info (
  id int default 1 primary key check (id = 1),
  seed text,
  version text,
  language text,
  updated_at timestamptz default now()
);

-- Trees, villages, ruins
create table world_objects (
  id uuid default gen_random_uuid() primary key,
  type text not null,
  x numeric not null,
  y numeric,
  z numeric not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Block changes relative to the seed world
create table block_updates (
  id uuid default gen_random_uuid() primary key,
  x numeric not null,
  y numeric not null,
  z numeric not null,
  block text not null,
  created_at timestamptz default now()
);

-- Bot state
create table bots (
  bot_id text primary key,
  info jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
```

3. Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
PORT=8080

# From Supabase: Project Settings → API
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 3. Start the WebSocket agent server

```bash
npm start
```

The WebSocket server listens on `ws://localhost:8080` (or the configured port).

---

## Mosbach Addon (Fake Player)

See [`Mosbach/README.md`](Mosbach/README.md) for detailed setup instructions.

The addon creates a `SimulatedPlayer` in Minecraft Bedrock Edition and polls
the website agent's `/connect` endpoint every 2 seconds. The website agent
returns action instructions which the fake player then executes.

---

## Website Agent

See [`website/README.md`](website/README.md) for detailed setup instructions.

```bash
cd website
npm install
npm start
# Open http://localhost:3000
```

The website agent:
- Receives bot state from the Mosbach addon (`POST /connect`)
- Streams live updates to the browser via SSE (`GET /connect`)
- Accepts action instructions from the browser (`POST /instruct`)
- Returns action lists back to the fake player

---

## WebSocket Protocol (Agent Server ↔ Minecraft)

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

## Supabase Data Structure

| Table | Primary Key | Description |
|---|---|---|
| `world_info` | `id` (fixed = 1) | World seed, version, language |
| `world_objects` | `id` (UUID) | Trees, villages, ruins |
| `block_updates` | `id` (UUID) | Block changes vs. seed world |
| `bots` | `bot_id` (text) | Bot state (health, position, …) |

---

## Running Tests

```bash
npm test
```

All tests use the Node.js built-in test runner and do **not** require a Supabase connection.


