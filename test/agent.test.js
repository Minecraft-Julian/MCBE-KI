'use strict';

/**
 * Unit tests for Agent class (src/agent.js)
 *
 * Uses Node.js built-in test runner (node --test).
 * Database and World are stubbed.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Stub the database module
// ---------------------------------------------------------------------------
const dbStub = {
  saveWorldInfo: async () => {},
  saveWorldObject: async () => 'obj-id',
  saveBlockUpdate: async () => 'blk-id',
  saveBotInfo: async () => {},
  getWorldInfo: async () => null,
  getWorldObjects: async () => [],
  getBlockUpdates: async () => [],
};

require.cache[require.resolve('../src/database')] = {
  id: require.resolve('../src/database'),
  filename: require.resolve('../src/database'),
  loaded: true,
  exports: dbStub,
};

const World = require('../src/world');
const Agent = require('../src/agent');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeAgent() {
  const world = new World();
  return { agent: new Agent(world, 'testBot'), world };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent', () => {
  describe('handleEvent – world_info', () => {
    it('saves world info and returns a greeting (English)', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'world_info',
        seed: '123456789',
        version: '1.21',
        language: 'en',
      });

      assert.equal(actions.length, 1);
      assert.equal(actions[0].action, 'say');
      assert.ok(actions[0].message.toLowerCase().includes('hello'));
    });

    it('returns a German greeting when language starts with "de"', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'world_info',
        seed: '42',
        version: '1.21',
        language: 'de',
      });

      assert.equal(actions[0].action, 'say');
      assert.ok(actions[0].message.toLowerCase().includes('hallo'));
    });
  });

  describe('handleEvent – chat', () => {
    it('"follow me" triggers a follow action', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'chat',
        player: 'Steve',
        message: 'follow me',
      });

      assert.ok(actions.some((a) => a.action === 'follow' && a.player === 'Steve'));
      assert.ok(actions.some((a) => a.action === 'say'));
    });

    it('"go to <x> <y> <z>" triggers a go_to action', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'chat',
        player: 'Alex',
        message: 'go to 10 64 -30',
      });

      const goTo = actions.find((a) => a.action === 'go_to');
      assert.ok(goTo);
      assert.equal(goTo.x, 10);
      assert.equal(goTo.y, 64);
      assert.equal(goTo.z, -30);
    });

    it('"mine <x> <y> <z>" triggers a mine action', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'chat',
        player: 'Alex',
        message: 'mine -5 60 0',
      });

      const mine = actions.find((a) => a.action === 'mine');
      assert.ok(mine);
      assert.equal(mine.x, -5);
      assert.equal(mine.y, 60);
      assert.equal(mine.z, 0);
    });

    it('"collect <item>" triggers a collect action', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'chat',
        player: 'Alex',
        message: 'collect diamond',
      });

      const collect = actions.find((a) => a.action === 'collect');
      assert.ok(collect);
      assert.equal(collect.item, 'diamond');
    });

    it('"find tree" reports nearest tree if one is known', async () => {
      const { agent, world } = makeAgent();
      dbStub.saveWorldObject = async () => 'tree-id';
      await world.addObject({ type: 'tree', x: 50, y: 64, z: 50 });

      const actions = await agent.handleEvent({
        type: 'chat',
        player: 'Steve',
        message: 'find tree',
      });

      const say = actions.find((a) => a.action === 'say');
      assert.ok(say);
      assert.ok(say.message.includes('tree'));
      assert.ok(say.message.includes('50'));
    });

    it('"find village" reports no village when none known', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'chat',
        player: 'Steve',
        message: 'find village',
      });

      assert.ok(actions[0].message.includes('No village'));
    });

    it('"stop" returns a say action', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({ type: 'chat', player: 'X', message: 'stop' });
      assert.ok(actions.some((a) => a.action === 'say'));
    });

    it('unrecognised message returns a fallback say action', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'chat',
        player: 'X',
        message: 'do something weird',
      });
      assert.ok(actions.some((a) => a.action === 'say'));
    });

    it('is case-insensitive for commands', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'chat',
        player: 'Steve',
        message: 'Follow Me',
      });
      assert.ok(actions.some((a) => a.action === 'follow'));
    });
  });

  describe('handleEvent – block_update', () => {
    it('records the block change and returns no actions', async () => {
      const { agent, world } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'block_update',
        x: 18,
        y: 92,
        z: -3,
        block: 'air',
      });

      assert.equal(actions.length, 0);
      assert.equal(world.getBlock(18, 92, -3), 'air');
    });
  });

  describe('handleEvent – object', () => {
    it('records the world object and returns no actions', async () => {
      const { agent, world } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'object',
        objectType: 'tree',
        x: 0,
        y: 64,
        z: 0,
        species: 'oak',
        variant: 7,
      });

      assert.equal(actions.length, 0);
      assert.equal(world.getObjects('tree').length, 1);
    });
  });

  describe('handleEvent – bot_info', () => {
    it('persists bot info and returns no actions', async () => {
      let savedId = null;
      let savedInfo = null;
      dbStub.saveBotInfo = async (id, info) => { savedId = id; savedInfo = info; };

      const { agent } = makeAgent();
      const actions = await agent.handleEvent({
        type: 'bot_info',
        health: 20,
        position: { x: 0, y: 64, z: 0 },
      });

      assert.equal(actions.length, 0);
      assert.equal(savedId, 'testBot');
      assert.equal(savedInfo.health, 20);
    });
  });

  describe('handleEvent – unknown type', () => {
    it('returns an empty array for unknown event types', async () => {
      const { agent } = makeAgent();
      const actions = await agent.handleEvent({ type: 'unknown_event' });
      assert.deepEqual(actions, []);
    });
  });
});
