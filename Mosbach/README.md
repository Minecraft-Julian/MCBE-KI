# Mosbach – Fake Player Addon

This folder contains a **Minecraft Bedrock Edition Script API** behaviour pack that:

1. Spawns a **fake / simulated player** (`MosbachBot`) using the
   [`@minecraft/server-gametest`](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-gametest/simulatedplayer)
   `SimulatedPlayer` API.  
   *(The approach is inspired by [ForestOfLight/Understudy](https://github.com/ForestOfLight/Understudy).)*

2. Every 2 seconds (40 ticks) **POSTs the bot's current state** (position,
   health, rotation, …) to the website agent's `/connect` endpoint.

3. **Reads the JSON action list** returned by the website agent and instructs
   the fake player to carry out those actions immediately.

---

## Requirements

| Component | Version |
|-----------|---------|
| Minecraft Bedrock Edition | 1.20.0 or newer |
| Bedrock Dedicated Server (BDS) | 1.20.0 or newer |
| `@minecraft/server` | 1.9.0 |
| `@minecraft/server-gametest` | 1.0.0-beta |
| `@minecraft/server-net` | 1.0.0-beta (BDS only) |

> **Note:** `@minecraft/server-net` (HTTP requests) is only available on
> **Bedrock Dedicated Server**. It is not available in the standard client
> or on Realms.

---

## Installation

1. Copy the entire `Mosbach/` folder into the `development_behavior_packs/`
   directory of your Bedrock Dedicated Server installation:
   ```
   <BDS root>/development_behavior_packs/Mosbach/
   ```

2. Activate the pack in `server.properties` (or via `worlds/<world>/world_behavior_packs.json`).

3. Set the website agent URL in `scripts/main.js`:
   ```js
   const AGENT_URL = 'http://<your-server-ip>:3000/connect';
   ```

4. Start (or restart) the server.

---

## Supported Actions

The website agent returns an array of action objects. Supported actions:

| `action`  | Additional fields              | Description                     |
|-----------|--------------------------------|---------------------------------|
| `say`     | `message: string`              | Fake player chats in-game       |
| `go_to`   | `x, y, z: number`             | Navigate to coordinates         |
| `follow`  | `player: string`               | Follow a named player           |
| `mine`    | `x, y, z: number`             | Break the block at position     |
| `place`   | `x, y, z: number`, `face?`    | Place held block                |
| `collect` | `item: string`                 | Navigate to nearest item entity |
| `attack`  | `targetType?: string`          | Attack nearest entity           |
| `stop`    | –                              | Stop all movement               |
| `jump`    | –                              | Jump                            |
| `look_at` | `x, y, z: number`             | Rotate towards position         |

---

## Communication Flow

```
[Minecraft BDS]                     [Website Agent]
  MosbachBot (SimulatedPlayer)
       │
       │  POST /connect
       │  { type:"bot_info", name, health, position, … }
       │ ─────────────────────────────────────────────────►
       │
       │  HTTP 200
       │  [{ action:"go_to", x:10, y:64, z:-30 }, …]
       │ ◄─────────────────────────────────────────────────
       │
       │  executeAction(…)
       ▼
  (bot moves / mines / chats)
```
