'use strict';

/**
 * MCBE-KI Website Agent Server
 *
 * This Express server acts as the central communication hub between the
 * Mosbach Minecraft addon (fake player) and the browser-based OpenClaw agent.
 *
 * Endpoints:
 *   POST /connect   – Receives bot state from Mosbach, returns action list.
 *   GET  /connect   – Server-Sent Events (SSE) stream for the browser UI.
 *   GET  /          – Serves the web UI (public/index.html).
 *
 * Architecture:
 *
 *   Mosbach (Minecraft) ──POST /connect──► Agent logic ──► action list
 *                                              │
 *                                              ▼
 *                                      SSE to browser UI
 *                                              │
 *                                              ▼
 *                               Browser sends instructions via POST /instruct
 */

require('dotenv').config({ path: '../.env' });

const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = parseInt(process.env.WEBSITE_PORT, 10) || 3000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// In-memory agent state
// ---------------------------------------------------------------------------

/** Latest known bot state received from Mosbach. */
let botState = null;

/** Pending action queue – consumed on next /connect POST. */
const pendingActions = [];

/** SSE clients (browser UI connections). */
const sseClients = new Set();

/**
 * Broadcast an event to all connected SSE browser clients.
 *
 * @param {string} event  Event name
 * @param {object} data   JSON-serialisable payload
 */
function broadcastSSE(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(message);
  }
}

// ---------------------------------------------------------------------------
// OpenClaw-style agent logic
// ---------------------------------------------------------------------------

/**
 * Process an incoming bot_info event and decide what actions to issue.
 *
 * This is the central "OpenClaw agent" logic. It:
 *   1. Updates the in-memory bot state.
 *   2. Broadcasts the new state to the browser UI via SSE.
 *   3. Flushes any pending actions that were enqueued by the browser UI.
 *   4. Adds autonomous actions based on the bot state (e.g. auto-eat at low health).
 *
 * @param {object} event  Parsed JSON body from Mosbach POST /connect
 * @returns {object[]}    Array of action objects to send back to Mosbach
 */
function processEvent(event) {
  botState = { ...event, receivedAt: Date.now() };

  // Push state update to browser UI
  broadcastSSE('bot_state', botState);

  // Consume pending actions that were queued by the browser UI
  const actions = pendingActions.splice(0);

  // -------------------------------------------------------------------------
  // Autonomous agent behaviour (OpenClaw-style decision logic)
  // -------------------------------------------------------------------------

  const health = event.health ?? 20;

  // Auto-warn player when health is critical
  if (health <= 4 && !actions.some((a) => a.action === 'say')) {
    actions.push({ action: 'say', message: 'Warning: my health is critical!' });
  }

  // If no actions are queued, send a periodic heartbeat message
  if (actions.length === 0) {
    // Intentionally empty – return [] to keep the bot idle unless instructed.
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /connect
 * Receives the fake player's current state from the Mosbach addon.
 * Returns a JSON array of action instructions.
 */
app.post('/connect', (req, res) => {
  const event = req.body;
  if (!event || typeof event !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const actions = processEvent(event);
  res.json(actions);
});

/**
 * GET /connect
 * Server-Sent Events stream – the browser UI subscribes here to receive
 * live bot state updates pushed from the server.
 */
app.get('/connect', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  sseClients.add(res);

  // Send current bot state immediately on connect
  if (botState) {
    res.write(`event: bot_state\ndata: ${JSON.stringify(botState)}\n\n`);
  }

  req.on('close', () => {
    sseClients.delete(res);
  });
});

/**
 * POST /instruct
 * Accepts action instructions from the browser UI and queues them for the
 * next Mosbach /connect poll.
 *
 * Body: single action object OR array of action objects
 * Example: { "action": "go_to", "x": 10, "y": 64, "z": -30 }
 */
app.post('/instruct', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const actions = Array.isArray(body) ? body : [body];
  for (const action of actions) {
    if (action && typeof action.action === 'string') {
      pendingActions.push(action);
    }
  }

  res.json({ queued: pendingActions.length });
});

/**
 * GET /state
 * Returns the latest known bot state (useful for polling from the browser).
 */
app.get('/state', (req, res) => {
  res.json(botState ?? {});
});

// ---------------------------------------------------------------------------
// WebSocket server (optional – for real-time browser communication)
// ---------------------------------------------------------------------------

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[Website Agent] Browser WebSocket connected');

  // Send current bot state on connect
  if (botState) {
    ws.send(JSON.stringify({ event: 'bot_state', data: botState }));
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Browser sends an action via WebSocket
    if (msg && typeof msg.action === 'string') {
      pendingActions.push(msg);
      broadcastSSE('action_queued', msg);
    }
  });

  ws.on('close', () => console.log('[Website Agent] Browser WebSocket disconnected'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`[Website Agent] Listening on http://localhost:${PORT}`);
  console.log(`  POST /connect  – Mosbach bot state receiver`);
  console.log(`  GET  /connect  – Browser SSE stream`);
  console.log(`  POST /instruct – Queue actions for the fake player`);
  console.log(`  GET  /state    – Latest bot state (JSON)`);
  console.log(`  WS   /ws       – WebSocket for the browser UI`);
});

module.exports = { app, httpServer };
