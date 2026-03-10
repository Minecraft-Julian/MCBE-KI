/**
 * Mosbach – MCBE-KI Fake Player Addon
 *
 * Runs inside Minecraft Bedrock (Dedicated Server with Script API enabled).
 *
 * Responsibilities:
 *   1. Spawns a fake player entity that can be controlled by AI instructions.
 *   2. Periodically POSTs world events to the website's /connect endpoint.
 *   3. Executes actions received back from the website (move, mine, collect, …).
 *
 * Requirements:
 *   - Minecraft Bedrock Dedicated Server >= 1.20.10
 *   - Script API modules: @minecraft/server ^1.9.0, @minecraft/server-net ^1.0.0-beta
 *   - Set WEBSITE_URL in the server's env / config (default: http://localhost:3000)
 *
 * Fake-player approach inspired by ForestOfLight/Understudy:
 *   https://github.com/ForestOfLight/Understudy
 */

import * as mc from '@minecraft/server';
import { HttpRequest, HttpRequestMethod, HttpClient } from '@minecraft/server-net';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** URL of the website agent server. Override via server properties or hard-code. */
const WEBSITE_URL = 'http://localhost:3000';

/** Name tag given to the fake-player entity so it can be identified later. */
const FAKE_PLAYER_TAG = 'mosbach_bot';

/** How often (in ticks) the addon polls/sends data to the website (20 ticks = 1 s). */
const POLL_INTERVAL_TICKS = 100; // 5 seconds

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {mc.Entity | null} Reference to the currently spawned fake-player entity. */
let fakePlayer = null;

/** Queue of pending events to send on the next poll tick. */
const pendingEvents = [];

// ---------------------------------------------------------------------------
// Fake player management
// (Inspired by ForestOfLight/Understudy – using a custom NPC entity type that
//  mimics player appearance while being fully script-controllable.)
// ---------------------------------------------------------------------------

/**
 * Spawn the fake player at the world spawn point, or re-use an existing one.
 *
 * The entity type `mosbach:fake_player` must be defined in the addon's
 * entity behaviour pack with `"is_stackable": false` and a player-like model.
 *
 * @param {mc.World} world
 */
function ensureFakePlayer(world) {
  if (fakePlayer && !fakePlayer.isValid()) {
    fakePlayer = null;
  }

  if (fakePlayer) return;

  // Try to find an already-existing bot entity tagged with FAKE_PLAYER_TAG
  for (const dim of [
    world.getDimension('overworld'),
    world.getDimension('nether'),
    world.getDimension('the_end'),
  ]) {
    const entities = dim.getEntities({ tags: [FAKE_PLAYER_TAG] });
    if (entities.length > 0) {
      fakePlayer = entities[0];
      mc.world.sendMessage(`[Mosbach] Re-attached to existing fake player at ${formatPos(fakePlayer.location)}.`);
      return;
    }
  }

  // Spawn a new bot at the world spawn
  const overworld = world.getDimension('overworld');
  const spawn = world.getDefaultSpawnLocation();
  fakePlayer = overworld.spawnEntity('mosbach:fake_player', spawn);
  fakePlayer.addTag(FAKE_PLAYER_TAG);
  fakePlayer.nameTag = 'MosbachBot';
  mc.world.sendMessage('[Mosbach] Fake player spawned.');
}

// ---------------------------------------------------------------------------
// Event collection
// ---------------------------------------------------------------------------

/**
 * Subscribe to world events and queue them as JSON payloads for the website.
 *
 * @param {mc.World} world
 */
function registerEventListeners(world) {
  // Chat messages
  world.beforeEvents.chatSend.subscribe((ev) => {
    if (ev.sender.hasTag(FAKE_PLAYER_TAG)) return; // ignore own messages
    pendingEvents.push({
      type: 'chat',
      player: ev.sender.name,
      message: ev.message,
    });
  });

  // Block changes (player breaks a block)
  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const { block, brokenBlockPermutation } = ev;
    pendingEvents.push({
      type: 'block_update',
      x: block.x,
      y: block.y,
      z: block.z,
      block: brokenBlockPermutation.type.id,
    });
  });

  // Block placements
  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    const { block } = ev;
    pendingEvents.push({
      type: 'block_update',
      x: block.x,
      y: block.y,
      z: block.z,
      block: block.typeId,
    });
  });
}

// ---------------------------------------------------------------------------
// Sending & receiving data
// ---------------------------------------------------------------------------

/**
 * Send all queued events plus the current bot state to the website /connect
 * endpoint and process the returned actions.
 */
async function pollWebsite() {
  if (!fakePlayer || !fakePlayer.isValid()) return;

  const loc = fakePlayer.location;
  const botInfo = {
    type: 'bot_info',
    name: fakePlayer.nameTag,
    position: { x: Math.round(loc.x), y: Math.round(loc.y), z: Math.round(loc.z) },
  };

  const events = [...pendingEvents, botInfo];
  pendingEvents.length = 0;

  const body = JSON.stringify(events);

  const req = new HttpRequest(`${WEBSITE_URL}/connect`);
  req.method = HttpRequestMethod.Post;
  req.headers = [{ key: 'Content-Type', value: 'application/json' }];
  req.body = body;

  let response;
  try {
    const client = new HttpClient();
    response = await client.request(req);
  } catch (err) {
    mc.world.sendMessage(`[Mosbach] HTTP error: ${err}`);
    return;
  }

  if (!response || !response.body) return;

  let actions;
  try {
    actions = JSON.parse(response.body);
  } catch {
    return;
  }

  if (!Array.isArray(actions)) return;

  for (const action of actions) {
    executeAction(action);
  }
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

/**
 * Execute a single action object received from the website agent.
 *
 * @param {{ action: string, [key: string]: any }} action
 */
function executeAction(action) {
  if (!fakePlayer || !fakePlayer.isValid()) return;

  switch (action.action) {
    case 'say':
      mc.world.sendMessage(`[MosbachBot] ${action.message}`);
      break;

    case 'go_to': {
      const dest = { x: action.x, y: action.y, z: action.z };
      fakePlayer.teleport(dest, { dimension: fakePlayer.dimension });
      break;
    }

    case 'mine': {
      const dim = fakePlayer.dimension;
      const block = dim.getBlock({ x: action.x, y: action.y, z: action.z });
      if (block) {
        dim.runCommand(`setblock ${action.x} ${action.y} ${action.z} air destroy`);
      }
      break;
    }

    case 'collect':
      // Collect nearby items matching the given type
      fakePlayer.dimension.runCommand(
        `execute as @e[type=item,name="${action.item}",r=5] at @s run tp @s ${formatPos(fakePlayer.location)}`,
      );
      break;

    case 'follow': {
      const targets = mc.world
        .getDimension('overworld')
        .getPlayers({ name: action.player });
      if (targets.length > 0) {
        const target = targets[0];
        fakePlayer.teleport(target.location, { dimension: target.dimension });
      }
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Format a vector3 location as "x y z".
 *
 * @param {{ x: number, y: number, z: number }} loc
 * @returns {string}
 */
function formatPos(loc) {
  return `${Math.round(loc.x)} ${Math.round(loc.y)} ${Math.round(loc.z)}`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

mc.system.run(() => {
  ensureFakePlayer(mc.world);
  registerEventListeners(mc.world);

  // Send initial world_info event
  // Note: The Bedrock Script API does not expose the world seed or game version
  // in the scripting environment, so these fields are set to 'unknown'.
  pendingEvents.push({
    type: 'world_info',
    version: 'unknown',
    language: 'en',
  });

  // Poll the website on a fixed interval
  mc.system.runInterval(async () => {
    try {
      await pollWebsite();
    } catch (err) {
      mc.world.sendMessage(`[Mosbach] Poll error: ${err}`);
    }
  }, POLL_INTERVAL_TICKS);
});
