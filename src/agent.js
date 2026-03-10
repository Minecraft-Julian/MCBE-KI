'use strict';

/**
 * KI Agent
 *
 * The agent receives events from the Minecraft bot, analyses them, and
 * returns a list of actions for the bot to execute.
 *
 * Supported incoming event types:
 *   - "world_info"   : { seed, version, language }
 *   - "chat"         : { player, message }
 *   - "block_update" : { x, y, z, block }
 *   - "object"       : { objectType, x, [y], z, ...extra }
 *   - "bot_info"     : arbitrary bot state update (may include { position: { x, y, z } })
 *
 * Supported outgoing action types:
 *   - "say"          : { message }
 *   - "follow"       : { player }
 *   - "mine"         : { x, y, z }
 *   - "collect"      : { item }
 *   - "go_to"        : { x, y, z }
 *
 * Recognised chat commands:
 *   "help"                     – list available commands
 *   "follow me"                – follow the sender
 *   "go to <x> <y> <z>"       – navigate to coordinates
 *   "mine <x> <y> <z>"        – mine the block at coordinates
 *   "collect <item>"           – collect an item
 *   "find tree|village|ruin"   – report nearest object of that type
 *   "stop"                     – stop current activity
 */

const db = require('./database');

class Agent {
  /**
   * @param {import('./world')} world  Shared World instance
   * @param {string} botId            Unique identifier for this bot
   */
  constructor(world, botId) {
    this.world = world;
    this.botId = botId;
    /** @type {{ x: number, y: number, z: number }|null} Last known bot position */
    this.position = null;
  }

  // -------------------------------------------------------------------------
  // Public entry point
  // -------------------------------------------------------------------------

  /**
   * Process a single incoming event and return an array of actions to perform.
   *
   * @param {object} event
   * @param {string} event.type
   * @returns {Promise<object[]>}  Array of action objects
   */
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

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  /**
   * Handle initial world info sent by Minecraft on connect.
   *
   * @param {{ seed: string|number, version: string, language: string }} event
   * @returns {Promise<object[]>}
   */
  async _onWorldInfo(event) {
    const { seed, version, language } = event;
    await this.world.setInfo({ seed, version, language });

    const greeting = language && language.startsWith('de')
      ? 'Hallo! KI-Agent verbunden.'
      : 'Hello! KI agent connected.';

    return [{ action: 'say', message: greeting }];
  }

  /**
   * Analyse an incoming chat message and decide what to do.
   *
   * Recognised commands:
   *   "help"                     – list available commands
   *   "follow me"                – follow the sender
   *   "go to <x> <y> <z>"       – navigate to coordinates
   *   "mine <x> <y> <z>"        – mine the block at coordinates
   *   "collect <item>"           – collect an item
   *   "find tree|village|ruin"   – report nearest object of that type
   *   "stop"                     – stop current activity
   *
   * @param {{ player: string, message: string }} event
   * @returns {Promise<object[]>}
   */
  async _onChat(event) {
    const { player, message } = event;
    const text = (message || '').trim().toLowerCase();
    const actions = [];

    if (text === 'help') {
      actions.push({
        action: 'say',
        message:
          'Available commands: help | follow me | go to <x> <y> <z> | mine <x> <y> <z> | collect <item> | find tree|village|ruin | stop',
      });
      return actions;
    }

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
      return this._findNearestObject(findMatch[1]);
    }

    if (text === 'stop') {
      actions.push({ action: 'say', message: 'Stopping current activity.' });
      return actions;
    }

    // Unknown message – acknowledge it and hint at help
    actions.push({
      action: 'say',
      message: `I don't understand that command. Type "help" to see available commands.`,
    });
    return actions;
  }

  /**
   * Handle a block-update event: record it in the world model.
   *
   * @param {{ x: number, y: number, z: number, block: string }} event
   * @returns {Promise<object[]>}
   */
  async _onBlockUpdate(event) {
    const { x, y, z, block } = event;
    await this.world.setBlock(x, y, z, block);
    return [];
  }

  /**
   * Handle discovery of a new world object.
   *
   * @param {object} event  { objectType, x, [y], z, ...extra }
   * @returns {Promise<object[]>}
   */
  async _onObject(event) {
    const { type: _eventType, objectType, ...rest } = event;
    await this.world.addObject({ type: objectType, ...rest });
    return [];
  }

  /**
   * Update bot state in the database and keep position in memory.
   *
   * @param {object} event  Arbitrary bot state fields; may include { position: { x, y, z } }
   * @returns {Promise<object[]>}
   */
  async _onBotInfo(event) {
    const { type: _type, ...info } = event;
    if (
      info.position &&
      typeof info.position.x === 'number' &&
      typeof info.position.y === 'number' &&
      typeof info.position.z === 'number'
    ) {
      this.position = { x: info.position.x, y: info.position.y, z: info.position.z };
    }
    await db.saveBotInfo(this.botId, info);
    return [];
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Find the nearest object of a given type and report it as a chat message.
   * Uses the bot's last known position for distance calculation when available.
   *
   * @param {'tree'|'village'|'ruin'} type
   * @returns {object[]}
   */
  _findNearestObject(type) {
    let obj;
    if (this.position) {
      obj = this.world.getNearestObject(type, this.position.x, this.position.z);
    } else {
      const objects = this.world.getObjects(type);
      obj = objects.length ? objects[0] : null;
    }

    if (!obj) {
      return [{ action: 'say', message: `No ${type} found in my database yet.` }];
    }
    const coords = obj.y != null
      ? `${obj.x} ${obj.y} ${obj.z}`
      : `${obj.x} ? ${obj.z}`;
    return [{ action: 'say', message: `Nearest ${type} is at ${coords}.` }];
  }
}

module.exports = Agent;
