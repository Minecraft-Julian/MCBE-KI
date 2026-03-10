'use strict';

/**
 * MCBE-KI Website Agent Server
 *
 * Express HTTP server that acts as the central communication hub between the
 * Mosbach Minecraft addon and the Supabase database.
 *
 * POST /connect
 *   Receives a JSON array of events from the Mosbach addon.
 *   Each event is processed by the Agent and a list of actions is returned.
 *
 * Example request body:
 *   [
 *     { "type": "world_info", "seed": "123456789", "version": "1.21", "language": "de" },
 *     { "type": "chat", "player": "Steve", "message": "follow me" }
 *   ]
 *
 * Example response body:
 *   [
 *     { "action": "say", "message": "Following Steve." },
 *     { "action": "follow", "player": "Steve" }
 *   ]
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Supabase initialisation
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Database helpers (Supabase)
// ---------------------------------------------------------------------------

const database = {
  async saveWorldInfo(worldInfo) {
    const { error } = await supabase.from('world_info').upsert({
      id: 'singleton',
      seed: String(worldInfo.seed),
      version: worldInfo.version || '',
      language: worldInfo.language || '',
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },

  async getWorldInfo() {
    const { data, error } = await supabase
      .from('world_info')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async saveWorldObject(obj) {
    const { type, x, y = null, z, ...rest } = obj;
    const row = { type, x, z, ...rest, created_at: new Date().toISOString() };
    if (y !== null) row.y = y;
    const { data, error } = await supabase
      .from('world_objects')
      .insert(row)
      .select('id')
      .single();
    if (error) throw error;
    return String(data.id);
  },

  async getWorldObjects(type) {
    let query = supabase.from('world_objects').select('*');
    if (type) query = query.eq('type', type);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async saveBlockUpdate(blockUpdate) {
    const { x, y, z, block } = blockUpdate;
    const { data, error } = await supabase
      .from('block_updates')
      .insert({ x, y, z, block, timestamp: new Date().toISOString() })
      .select('id')
      .single();
    if (error) throw error;
    return String(data.id);
  },

  async getBlockUpdates() {
    const { data, error } = await supabase.from('block_updates').select('*');
    if (error) throw error;
    return data || [];
  },

  async saveBotInfo(botId, info) {
    const { error } = await supabase
      .from('bots')
      .upsert({ id: botId, ...info, updated_at: new Date().toISOString() });
    if (error) throw error;
  },

  async getBotInfo(botId) {
    const { data, error } = await supabase
      .from('bots')
      .select('*')
      .eq('id', botId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};

// ---------------------------------------------------------------------------
// World model (in-memory)
// ---------------------------------------------------------------------------

class World {
  constructor() {
    this.info = null;
    this._blockUpdates = new Map();
    this._objects = [];
  }

  async load() {
    this.info = await database.getWorldInfo();
    const [objects, blockUpdates] = await Promise.all([
      database.getWorldObjects(),
      database.getBlockUpdates(),
    ]);
    this._objects = objects;
    this._blockUpdates = new Map(
      blockUpdates.map((u) => [`${u.x},${u.y},${u.z}`, u]),
    );
  }

  async setInfo(worldInfo) {
    this.info = { ...worldInfo };
    await database.saveWorldInfo(worldInfo);
  }

  async addObject(obj) {
    const id = await database.saveWorldObject(obj);
    this._objects.push({ id, ...obj });
    return id;
  }

  getObjects(type) {
    if (!type) return [...this._objects];
    return this._objects.filter((o) => o.type === type);
  }

  async setBlock(x, y, z, block) {
    this._blockUpdates.set(`${x},${y},${z}`, { x, y, z, block });
    return database.saveBlockUpdate({ x, y, z, block });
  }
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

class Agent {
  constructor(world, botId) {
    this.world = world;
    this.botId = botId;
  }

  async handleEvent(event) {
    switch (event.type) {
      case 'world_info':
        return this._onWorldInfo(event);
      case 'chat':
        return this._onChat(event);
      case 'block_update':
        return this._onBlockUpdate(event);
      case 'object':
        return this._onObject(event);
      case 'bot_info':
        return this._onBotInfo(event);
      default:
        return [];
    }
  }

  async _onWorldInfo(event) {
    const { seed, version, language } = event;
    await this.world.setInfo({ seed, version, language });
    const greeting = language && language.startsWith('de')
      ? 'Hallo! KI-Agent verbunden.'
      : 'Hello! KI agent connected.';
    return [{ action: 'say', message: greeting }];
  }

  async _onChat(event) {
    const { player, message } = event;
    const text = (message || '').trim().toLowerCase();
    const actions = [];

    if (text === 'follow me') {
      actions.push({ action: 'follow', player });
      actions.push({ action: 'say', message: `Following ${player}.` });
      return actions;
    }

    const goToMatch = text.match(/^go to (-?\d+) (-?\d+) (-?\d+)$/);
    if (goToMatch) {
      const [, x, y, z] = goToMatch.map(Number);
      actions.push({ action: 'go_to', x, y, z });
      actions.push({ action: 'say', message: `Going to ${x} ${y} ${z}.` });
      return actions;
    }

    const mineMatch = text.match(/^mine (-?\d+) (-?\d+) (-?\d+)$/);
    if (mineMatch) {
      const [, x, y, z] = mineMatch.map(Number);
      actions.push({ action: 'mine', x, y, z });
      actions.push({ action: 'say', message: `Mining block at ${x} ${y} ${z}.` });
      return actions;
    }

    const collectMatch = text.match(/^collect (.+)$/);
    if (collectMatch) {
      const item = collectMatch[1].trim();
      actions.push({ action: 'collect', item });
      actions.push({ action: 'say', message: `Collecting ${item}.` });
      return actions;
    }

    const findMatch = text.match(/^find (tree|village|ruin)$/);
    if (findMatch) {
      const type = findMatch[1];
      const objects = this.world.getObjects(type);
      if (!objects.length) {
        return [{ action: 'say', message: `No ${type} found in my database yet.` }];
      }
      const obj = objects[0];
      const coords = obj.y != null ? `${obj.x} ${obj.y} ${obj.z}` : `${obj.x} ? ${obj.z}`;
      return [{ action: 'say', message: `Nearest ${type} is at ${coords}.` }];
    }

    if (text === 'stop') {
      return [{ action: 'say', message: 'Stopping current activity.' }];
    }

    actions.push({
      action: 'say',
      message: `[${player}] ${message} – I don't understand that command yet.`,
    });
    return actions;
  }

  async _onBlockUpdate(event) {
    const { x, y, z, block } = event;
    await this.world.setBlock(x, y, z, block);
    return [];
  }

  async _onObject(event) {
    const { type: _eventType, objectType, ...rest } = event;
    await this.world.addObject({ type: objectType, ...rest });
    return [];
  }

  async _onBotInfo(event) {
    const { type: _type, ...info } = event;
    await database.saveBotInfo(this.botId, info);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// Shared world instance and agent map (keyed by bot name)
const sharedWorld = new World();
const agents = new Map();

/** Promise that resolves when the world has finished loading from Supabase. */
let worldLoadPromise = null;

function ensureWorldLoaded() {
  if (!worldLoadPromise) {
    worldLoadPromise = sharedWorld.load().catch((err) => {
      console.error('[Server] Failed to load world data from Supabase:', err.message);
      // Reset so the next request can try again
      worldLoadPromise = null;
    });
  }
  return worldLoadPromise;
}

/**
 * GET /health – simple liveness check.
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * POST /connect
 *
 * Accepts an array of events from the Mosbach addon.
 * Returns an array of actions to execute.
 */
app.post('/connect', async (req, res) => {
  // Ensure world data is loaded before processing any events
  await ensureWorldLoaded();

  const events = req.body;
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'Request body must be a JSON array of events.' });
  }

  // Determine bot ID from bot_info events (or fall back to IP)
  let botId = req.ip;
  for (const ev of events) {
    if (ev.type === 'bot_info' && ev.name) {
      botId = ev.name;
      break;
    }
  }

  if (!agents.has(botId)) {
    agents.set(botId, new Agent(sharedWorld, botId));
  }
  const agent = agents.get(botId);

  const allActions = [];
  for (const event of events) {
    try {
      const actions = await agent.handleEvent(event);
      allActions.push(...actions);
    } catch (err) {
      console.error(`[Agent:${botId}] Error handling event "${event.type}":`, err.message);
    }
  }

  res.json(allActions);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT, 10) || 3000;

app.listen(PORT, () => {
  console.log(`[Server] MCBE-KI website agent listening on port ${PORT}`);
});

module.exports = app;
