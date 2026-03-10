'use strict';

/**
 * Unit tests for World class (src/world.js)
 *
 * Uses Node.js built-in test runner (node --test).
 * The database module is stubbed so no Firebase connection is needed.
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

// ---------------------------------------------------------------------------
// Stub the database module before requiring World
// ---------------------------------------------------------------------------
const dbStub = {
  getWorldInfo: async () => null,
  getWorldObjects: async () => [],
  getBlockUpdates: async () => [],
  saveWorldInfo: async () => {},
  saveWorldObject: async (obj) => 'stub-id',
  saveBlockUpdate: async () => 'stub-block-id',
  saveBotInfo: async () => {},
};

// Inject the stub via require cache manipulation
require.cache[require.resolve('../src/database')] = {
  id: require.resolve('../src/database'),
  filename: require.resolve('../src/database'),
  loaded: true,
  exports: dbStub,
};

const World = require('../src/world');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('World', () => {
  let world;

  beforeEach(() => {
    world = new World();
  });

  describe('load()', () => {
    it('loads world info and data from the database', async () => {
      dbStub.getWorldInfo = async () => ({ seed: '42', version: '1.21', language: 'de' });
      dbStub.getWorldObjects = async () => [
        { id: '1', type: 'tree', x: 10, y: 64, z: 20, species: 'oak' },
      ];
      dbStub.getBlockUpdates = async () => [
        { id: 'b1', x: 5, y: 60, z: 5, block: 'air' },
      ];

      await world.load();

      assert.deepEqual(world.info, { seed: '42', version: '1.21', language: 'de' });
      assert.equal(world.getObjects('tree').length, 1);
      assert.equal(world.getBlock(5, 60, 5), 'air');
    });
  });

  describe('setInfo()', () => {
    it('stores world info in memory and persists it', async () => {
      let saved = null;
      dbStub.saveWorldInfo = async (info) => { saved = info; };

      await world.setInfo({ seed: '99', version: '1.20', language: 'en' });

      assert.equal(world.info.seed, '99');
      assert.deepEqual(saved, { seed: '99', version: '1.20', language: 'en' });
    });
  });

  describe('addObject() / getObjects()', () => {
    it('adds a tree and retrieves it by type', async () => {
      dbStub.saveWorldObject = async () => 'id-tree';

      const id = await world.addObject({ type: 'tree', x: 0, y: 64, z: 0, species: 'birch' });
      assert.equal(id, 'id-tree');

      const trees = world.getObjects('tree');
      assert.equal(trees.length, 1);
      assert.equal(trees[0].species, 'birch');
    });

    it('returns all objects when no type filter is given', async () => {
      dbStub.saveWorldObject = async () => 'id-any';
      await world.addObject({ type: 'tree', x: 0, y: 64, z: 0 });
      await world.addObject({ type: 'village', x: 100, z: 200 });

      assert.equal(world.getObjects().length, 2);
    });
  });

  describe('getNearestObject()', () => {
    it('returns null when no objects of that type exist', () => {
      assert.equal(world.getNearestObject('tree', 0, 0), null);
    });

    it('returns the nearest object by XZ distance', async () => {
      dbStub.saveWorldObject = async () => 'id-n';
      await world.addObject({ type: 'tree', x: 10, y: 64, z: 10 });
      await world.addObject({ type: 'tree', x: 100, y: 64, z: 100 });

      const nearest = world.getNearestObject('tree', 0, 0);
      assert.equal(nearest.x, 10);
    });
  });

  describe('setBlock() / getBlock()', () => {
    it('records and retrieves a block update', async () => {
      dbStub.saveBlockUpdate = async () => 'id-block';
      await world.setBlock(5, 70, -3, 'air');
      assert.equal(world.getBlock(5, 70, -3), 'air');
    });

    it('returns undefined for positions not yet changed', () => {
      assert.equal(world.getBlock(0, 0, 0), undefined);
    });
  });

  describe('getAllBlockUpdates()', () => {
    it('returns all recorded block updates', async () => {
      dbStub.saveBlockUpdate = async () => 'id-blk';
      await world.setBlock(1, 2, 3, 'stone');
      await world.setBlock(4, 5, 6, 'air');

      const updates = world.getAllBlockUpdates();
      assert.equal(updates.length, 2);
    });
  });
});
