# MCBE-KI

An AI agent that controls bots (fake players) in **Minecraft Bedrock Edition**.
The AI runs on a website server and communicates with the Minecraft modpack via a
periodic HTTP connection from the **Mosbach** addon.

The AI can:

- Chat with players
- Control bots
- Collect resources
- Execute tasks autonomously

---

## System Architecture

```
Minecraft Bot (Fake Player) – Mosbach addon
        ↓  POST /connect
Website Agent Server (Express + AI logic)
        ↓
Supabase (PostgreSQL)
        ↓
Response (actions JSON) back to Minecraft
```

---

## Repository Structure

```
MCBE-KI/
├── src/
│   ├── index.js      – Entry point (starts the WebSocket server)
│   ├── server.js     – WebSocket server
│   ├── agent.js      – AI agent (event analysis + action decisions)
│   ├── world.js      – In-memory world model (seed + objects + block updates)
│   ├── database.js   – Supabase integration
│   └── config.js     – Configuration (reads .env)
├── website/
│   ├── server.js     – Express HTTP server exposing POST /connect
│   └── package.json  – Website-specific dependencies
├── Mosbach/
│   ├── manifest.json – Minecraft Bedrock addon manifest
│   └── scripts/
│       └── main.js   – Script API code: fake player + HTTP polling
├── test/
│   ├── agent.test.js – Unit tests for the AI agent
│   └── world.test.js – Unit tests for the world model
├── .env.example      – Example environment variables
└── package.json
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
| **Supabase** | All data is persisted in Supabase (PostgreSQL) |

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

## Setup

### 1. Install dependencies

```bash
# Agent server dependencies
npm install

# Website server dependencies
cd website && npm install && cd ..
```

### 2. Configure Supabase

1. Create a project at <https://supabase.com>
2. In the SQL editor run the following DDL to create the required tables:

```sql
-- World info (one row, always id = 'singleton')
create table world_info (
  id       text primary key,
  seed     text,
  version  text,
  language text,
  updated_at timestamptz default now()
);

-- World objects (trees, villages, ruins)
create table world_objects (
  id         bigint generated always as identity primary key,
  type       text,
  x          numeric,
  y          numeric,
  z          numeric,
  species    text,
  variant    int,
  created_at timestamptz default now()
);

-- Block updates
create table block_updates (
  id        bigint generated always as identity primary key,
  x         numeric,
  y         numeric,
  z         numeric,
  block     text,
  timestamp timestamptz default now()
);

-- Bot state
create table bots (
  id         text primary key,
  health     numeric,
  position   jsonb,
  updated_at timestamptz default now()
);
```

3. Copy `.env.example` to `.env` (in both the root and `website/`) and fill in your values:

```bash
cp .env.example .env
cp website/.env.example website/.env
```

```env
# WebSocket / agent server port (default: 8080)
PORT=8080

# Supabase project URL
SUPABASE_URL=https://<project-ref>.supabase.co

# Supabase API key (service-role recommended for server-side use)
SUPABASE_KEY=your-supabase-key
```

### 3. Start the website agent server

```bash
cd website && npm start
```

The server listens on `http://localhost:3000` (or the configured `PORT`).

### 4. Install the Mosbach addon

1. Copy the `Mosbach/` folder into your Minecraft Bedrock server's `behavior_packs/` directory.
2. Activate the pack in `world_settings.json` / the server config.
3. Set `WEBSITE_URL` at the top of `Mosbach/scripts/main.js` to point to your website server (e.g. `http://your-server:3000`).
4. Start the Bedrock Dedicated Server.

The addon will automatically spawn a fake player, collect world events, and exchange them with the website agent every 5 seconds.

---

## HTTP Protocol (website ↔ Mosbach addon)

### Mosbach → Website  `POST /connect`

Request body: a JSON **array** of event objects.

```jsonc
[
  // Sent once on first connect
  { "type": "world_info", "seed": "123456789", "version": "1.21", "language": "de" },

  // Chat message from a player
  { "type": "chat", "player": "Steve", "message": "follow me" },

  // A block changed
  { "type": "block_update", "x": 18, "y": 92, "z": -3, "block": "air" },

  // Current bot state (sent on every poll)
  { "type": "bot_info", "name": "MosbachBot", "position": { "x": 0, "y": 64, "z": 0 } }
]
```

### Website → Mosbach  (response body)

A JSON **array** of action objects.

```jsonc
[
  { "action": "say",     "message": "Following Steve." },
  { "action": "follow",  "player": "Steve" },
  { "action": "go_to",   "x": 10, "y": 64, "z": -30 },
  { "action": "mine",    "x": -5, "y": 60, "z": 0 },
  { "action": "collect", "item": "diamond" }
]
```

---

## Supabase Data Structure

| Table | Key column | Description |
|---|---|---|
| `world_info` | `id = 'singleton'` | World seed, version, language |
| `world_objects` | auto `id` | Trees, villages, ruins |
| `block_updates` | auto `id` | Block changes vs. seed world |
| `bots` | `id` (bot name) | Bot state (health, position, …) |

---

## Running Tests

```bash
npm test
```

All tests use the Node.js built-in test runner and do **not** require a Supabase connection.

