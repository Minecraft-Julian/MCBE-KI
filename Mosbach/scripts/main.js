/**
 * Mosbach – Fake Player Agent
 *
 * Creates a SimulatedPlayer (fake player) in Minecraft Bedrock Edition and
 * keeps it in sync with the MCBE-KI website agent via HTTP polling.
 *
 * Architecture:
 *   Mosbach (Minecraft addon)  ←→  Website Agent (/connect endpoint)
 *
 * The fake player:
 *   - POSTs its current state to the website's /connect endpoint every tick cycle.
 *   - Reads the action instructions returned in the response body.
 *   - Executes those instructions (move, mine, place, say, etc.).
 *
 * Based on the SimulatedPlayer pattern from ForestOfLight/Understudy.
 * See: https://github.com/ForestOfLight/Understudy
 *
 * Requires Minecraft Bedrock Edition 1.20+ with:
 *   - @minecraft/server  1.9.0
 *   - @minecraft/server-gametest  1.0.0-beta
 *   - @minecraft/server-net  1.0.0-beta
 */

import * as mc from '@minecraft/server';
import * as gt from '@minecraft/server-gametest';
import { HttpRequest, HttpRequestMethod, HttpClient } from '@minecraft/server-net';

// ---------------------------------------------------------------------------
// Configuration – change AGENT_URL to your hosted website address.
// ---------------------------------------------------------------------------

/** Full URL of the /connect endpoint on the website agent. */
const AGENT_URL = 'http://localhost:3000/connect';

/**
 * How many game ticks to wait between sends (20 ticks = 1 second).
 * Reduce for more responsive control; increase to reduce server load.
 */
const POLL_INTERVAL_TICKS = 40;

/** Name displayed for the fake player in-game. */
const FAKE_PLAYER_NAME = 'MosbachBot';

// ---------------------------------------------------------------------------
// Fake-player lifecycle
// ---------------------------------------------------------------------------

/** @type {gt.SimulatedPlayer|null} */
let fakePlayer = null;

/** @type {number} Tick counter for polling throttle. */
let ticksSincePoll = 0;

/**
 * Spawn the fake player into the overworld at a sensible position.
 * If a player with the same name already exists we reuse it.
 *
 * @returns {gt.SimulatedPlayer}
 */
function spawnFakePlayer() {
  const overworld = mc.world.getDimension('overworld');

  // Attempt to find an already-spawned simulated player by name.
  for (const entity of overworld.getEntities({ type: 'minecraft:player' })) {
    if (entity.name === FAKE_PLAYER_NAME && entity instanceof gt.SimulatedPlayer) {
      return entity;
    }
  }

  // Spawn at world origin at surface level.
  const spawnLocation = { x: 0, y: 64, z: 0 };
  const player = gt.GameTestSequence
    ? gt.SimulatedPlayer.create(FAKE_PLAYER_NAME, spawnLocation, overworld)
    : overworld.spawnSimulatedPlayer(spawnLocation, FAKE_PLAYER_NAME);

  mc.world.sendMessage(`§a[Mosbach] Fake player "${FAKE_PLAYER_NAME}" spawned.`);
  return player;
}

// ---------------------------------------------------------------------------
// State serialisation
// ---------------------------------------------------------------------------

/**
 * Collect the current state of the fake player to send to the website agent.
 *
 * @param {gt.SimulatedPlayer} player
 * @returns {object}
 */
function getPlayerState(player) {
  const loc = player.location;
  const vel = player.getVelocity();
  const rot = player.getRotation();

  return {
    type: 'bot_info',
    name: player.name,
    health: player.getComponent('health')?.currentValue ?? 20,
    position: { x: Math.round(loc.x), y: Math.round(loc.y), z: Math.round(loc.z) },
    velocity: { x: vel.x, y: vel.y, z: vel.z },
    rotation: { pitch: rot.x, yaw: rot.y },
    dimension: player.dimension.id,
  };
}

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

/**
 * Execute an action instruction received from the website agent.
 *
 * @param {gt.SimulatedPlayer} player
 * @param {{ action: string, [key: string]: unknown }} instruction
 */
function executeAction(player, instruction) {
  switch (instruction.action) {
    case 'say': {
      player.chat(String(instruction.message ?? ''));
      break;
    }

    case 'go_to': {
      const dest = new mc.Vector3(
        Number(instruction.x),
        Number(instruction.y),
        Number(instruction.z),
      );
      player.navigateToLocation(dest);
      break;
    }

    case 'follow': {
      // Find the target player by name and navigate towards them.
      const target = mc.world
        .getDimension('overworld')
        .getEntities({ type: 'minecraft:player', name: String(instruction.player) })
        .find(Boolean);
      if (target) {
        player.navigateToEntity(target);
      }
      break;
    }

    case 'mine': {
      const minePos = new mc.Vector3(
        Number(instruction.x),
        Number(instruction.y),
        Number(instruction.z),
      );
      player.breakBlock(minePos);
      break;
    }

    case 'place': {
      // Place the item currently held in the main hand.
      const placePos = new mc.Vector3(
        Number(instruction.x),
        Number(instruction.y),
        Number(instruction.z),
      );
      player.placeBlock(placePos, instruction.face ?? mc.Direction.Up);
      break;
    }

    case 'collect': {
      // Move towards the nearest matching item entity.
      const itemName = String(instruction.item ?? '');
      const nearby = player.dimension.getEntities({
        location: player.location,
        maxDistance: 32,
        type: 'minecraft:item',
      });
      for (const entity of nearby) {
        const itemComp = entity.getComponent('item');
        if (itemComp && itemComp.itemStack.typeId.includes(itemName)) {
          player.navigateToEntity(entity);
          break;
        }
      }
      break;
    }

    case 'attack': {
      // Attack the nearest entity matching the optional type filter.
      const type = instruction.targetType ? String(instruction.targetType) : undefined;
      const entities = player.dimension.getEntities({
        location: player.location,
        maxDistance: 4,
        ...(type ? { type } : {}),
      });
      if (entities.length > 0) {
        player.attackEntity(entities[0]);
      }
      break;
    }

    case 'stop': {
      player.stopMoving();
      break;
    }

    case 'jump': {
      player.jump();
      break;
    }

    case 'look_at': {
      const lookTarget = new mc.Vector3(
        Number(instruction.x),
        Number(instruction.y),
        Number(instruction.z),
      );
      player.lookAtLocation(lookTarget);
      break;
    }

    default:
      mc.world.sendMessage(`§e[Mosbach] Unknown action: ${instruction.action}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP communication with the website agent
// ---------------------------------------------------------------------------

/**
 * Send the fake player's current state to the website agent and process
 * the returned action instructions.
 *
 * @param {gt.SimulatedPlayer} player
 */
async function pollAgent(player) {
  const state = getPlayerState(player);
  const body = JSON.stringify(state);

  const request = new HttpRequest(AGENT_URL);
  request.method = HttpRequestMethod.Post;
  request.headers = [{ key: 'Content-Type', value: 'application/json' }];
  request.body = body;
  request.timeout = 5; // seconds

  let response;
  try {
    response = await new HttpClient().request(request);
  } catch (err) {
    mc.world.sendMessage(`§c[Mosbach] HTTP error: ${err}`);
    return;
  }

  if (response.status < 200 || response.status >= 300) {
    mc.world.sendMessage(`§c[Mosbach] Agent responded with status ${response.status}`);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch {
    // No or invalid JSON – nothing to do.
    return;
  }

  // The website agent can return either a single action object or an array.
  const actions = Array.isArray(payload) ? payload : [payload];
  for (const action of actions) {
    if (action && typeof action.action === 'string') {
      executeAction(player, action);
    }
  }
}

// ---------------------------------------------------------------------------
// World tick hook – entry point
// ---------------------------------------------------------------------------

mc.world.afterEvents.worldInitialize.subscribe(() => {
  mc.world.sendMessage('§a[Mosbach] Addon loaded – spawning fake player…');
  fakePlayer = spawnFakePlayer();
});

mc.system.runInterval(() => {
  if (!fakePlayer) return;

  ticksSincePoll += 1;
  if (ticksSincePoll < POLL_INTERVAL_TICKS) return;
  ticksSincePoll = 0;

  // Fire-and-forget; errors are caught inside pollAgent.
  pollAgent(fakePlayer);
}, 1);
