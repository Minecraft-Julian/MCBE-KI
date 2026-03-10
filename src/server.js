'use strict';

/**
 * WebSocket server
 *
 * Listens for incoming connections from Minecraft bots (fake players).
 * Each connected bot communicates using a simple JSON protocol:
 *
 * Client → Server (incoming messages):
 *   { type: "world_info",   seed, version, language }
 *   { type: "chat",         player, message }
 *   { type: "block_update", x, y, z, block }
 *   { type: "object",       objectType, x, [y], z, ...extra }
 *   { type: "bot_info",     ...state }
 *
 * Server → Client (outgoing actions):
 *   { action: "say",     message }
 *   { action: "follow",  player }
 *   { action: "mine",    x, y, z }
 *   { action: "collect", item }
 *   { action: "go_to",   x, y, z }
 */

const { WebSocketServer } = require('ws');
const Agent = require('./agent');
const World = require('./world');

// Shared world instance across all bot connections
const sharedWorld = new World();
let worldLoaded = false;

/**
 * Create and start the WebSocket server.
 *
 * @param {number} port
 * @returns {WebSocketServer}
 */
function createServer(port) {
  const wss = new WebSocketServer({ port });

  wss.on('listening', () => {
    console.log(`[Server] WebSocket server listening on port ${port}`);
  });

  wss.on('connection', (socket, request) => {
    const remoteAddress = request.socket.remoteAddress;
    console.log(`[Server] New connection from ${remoteAddress}`);

    // Use the remote address as a temporary bot ID until bot_info provides one
    let botId = remoteAddress;
    const agent = new Agent(sharedWorld, botId);

    // Load world data from database once
    if (!worldLoaded) {
      worldLoaded = true;
      sharedWorld.load().catch((err) => {
        console.error('[Server] Failed to load world data from database:', err.message);
      });
    }

    socket.on('message', async (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        console.warn('[Server] Received non-JSON message, ignoring.');
        return;
      }

      // Allow bots to self-identify
      if (event.type === 'bot_info' && event.name) {
        botId = event.name;
        agent.botId = botId;
      }

      let actions;
      try {
        actions = await agent.handleEvent(event);
      } catch (err) {
        console.error(`[Agent:${botId}] Error handling event "${event.type}":`, err.message);
        return;
      }

      for (const action of actions) {
        try {
          socket.send(JSON.stringify(action));
        } catch (sendErr) {
          console.error(`[Server] Failed to send action to ${botId}:`, sendErr.message);
        }
      }
    });

    socket.on('close', () => {
      console.log(`[Server] Connection closed: ${botId}`);
    });

    socket.on('error', (err) => {
      console.error(`[Server] Socket error for ${botId}:`, err.message);
    });
  });

  return wss;
}

module.exports = { createServer, sharedWorld };
