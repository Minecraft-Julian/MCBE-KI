# MCBE-KI Website Agent

This folder contains the **website agent server** that acts as the central
communication hub between the Mosbach Minecraft addon and the browser-based
control panel.

## Architecture

```
[Minecraft BDS + Mosbach addon]
         │  POST /connect  (bot state JSON)
         ▼
┌─────────────────────────┐
│   Website Agent Server  │◄─── POST /instruct (actions from browser)
│       server.js         │
│                         │
│  OpenClaw Agent Logic:  │───► GET /connect SSE stream ──► Browser UI
│  - Processes bot state  │
│  - Queues actions       │───► GET /state    (JSON)      ──► Browser UI
│  - Auto-behaviours      │
│                         │───► WS /ws        (WebSocket) ──► Browser UI
└─────────────────────────┘
         │
         └── Returns action list to Mosbach POST /connect response
```

## Setup

1. Install dependencies:
   ```bash
   cd website
   npm install
   ```

2. Copy `../.env.example` to `../.env` and set `WEBSITE_PORT` (default: `3000`).

3. Start the server:
   ```bash
   npm start
   ```

4. Open `http://localhost:3000` in your browser to access the control panel.

## API Endpoints

### `POST /connect`
Receives the fake player's state from the Mosbach addon and returns a JSON
array of action objects to execute.

**Request body** (JSON):
```json
{
  "type": "bot_info",
  "name": "MosbachBot",
  "health": 20,
  "position": { "x": 0, "y": 64, "z": 0 },
  "dimension": "minecraft:overworld"
}
```

**Response** (JSON array):
```json
[
  { "action": "go_to", "x": 10, "y": 64, "z": -30 },
  { "action": "say", "message": "On my way!" }
]
```

### `GET /connect`
Server-Sent Events (SSE) stream. The browser subscribes here and receives
`bot_state` events whenever the bot reports in.

### `POST /instruct`
Queue one or more actions for the fake player. The actions are returned to
Mosbach on the next `/connect` poll.

**Request body**:
```json
{ "action": "say", "message": "Hello from the website!" }
```

### `GET /state`
Returns the latest known bot state as JSON.

### `WS /ws`
WebSocket endpoint. Send action objects as JSON strings; the server queues
them and broadcasts state updates.

## Supported Actions

See [Mosbach/README.md](../Mosbach/README.md#supported-actions) for the full
list of supported actions.
