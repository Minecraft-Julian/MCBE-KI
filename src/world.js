'use strict';

/**
 * World data manager.
 *
 * Maintains an in-memory representation of the current world state, built from:
 *   1. The world seed (which defines the original terrain)
 *   2. Known world objects (trees, villages, ruins)
 *   3. Block updates (player / bot actions that deviate from the seed world)
 *
 * The class also exposes helpers to persist and restore state via the
 * database module.
 */

const db = require('./database');

class World {
  constructor() {
    /** @type {object|null} */
    this.info = null;

    /** @type {Map<string, object>} key = "x,y,z" */
    this._blockUpdates = new Map();

    /** @type {object[]} */
    this._objects = [];
  }

  // -------------------------------------------------------------------------
  // Initialisation
  // -------------------------------------------------------------------------

  /**
   * Load existing world info and data from the database into memory.
   *
   * @returns {Promise<void>}
   */
  async load() {
    this.info = await db.getWorldInfo();

    const [objects, blockUpdates] = await Promise.all([
      db.getWorldObjects(),
      db.getBlockUpdates(),
    ]);

    this._objects = objects;
    this._blockUpdates = new Map(
      blockUpdates.map((u) => [World._blockKey(u.x, u.y, u.z), u]),
    );
  }

  // -------------------------------------------------------------------------
  // World info (seed, version, language)
  // -------------------------------------------------------------------------

  /**
   * Set and persist world info received on first connection.
   *
   * @param {object} worldInfo  { seed, version, language }
   * @returns {Promise<void>}
   */
  async setInfo(worldInfo) {
    this.info = { ...worldInfo };
    await db.saveWorldInfo(worldInfo);
  }

  // -------------------------------------------------------------------------
  // World objects
  // -------------------------------------------------------------------------

  /**
   * Register a world object and persist it.
   *
   * @param {object} obj  { type, x, [y], z, ...extra }
   * @returns {Promise<string>} Database document ID
   */
  async addObject(obj) {
    const id = await db.saveWorldObject(obj);
    this._objects.push({ id, ...obj });
    return id;
  }

  /**
   * Query in-memory objects, optionally by type.
   *
   * @param {string} [type]
   * @returns {object[]}
   */
  getObjects(type) {
    if (!type) return [...this._objects];
    return this._objects.filter((o) => o.type === type);
  }

  /**
   * Find the nearest object of the given type to a position.
   *
   * @param {'tree'|'village'|'ruin'|string} type
   * @param {number} x
   * @param {number} z
   * @returns {object|null}
   */
  getNearestObject(type, x, z) {
    const candidates = this.getObjects(type);
    if (!candidates.length) return null;

    let nearest = null;
    let minDist = Infinity;

    for (const obj of candidates) {
      const dist = Math.hypot(obj.x - x, obj.z - z);
      if (dist < minDist) {
        minDist = dist;
        nearest = obj;
      }
    }
    return nearest;
  }

  // -------------------------------------------------------------------------
  // Block updates
  // -------------------------------------------------------------------------

  /**
   * Record a block change and persist it.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {string} block
   * @returns {Promise<string>} Database document ID
   */
  async setBlock(x, y, z, block) {
    const key = World._blockKey(x, y, z);
    this._blockUpdates.set(key, { x, y, z, block });
    return db.saveBlockUpdate({ x, y, z, block });
  }

  /**
   * Look up the current block at a position (returns undefined if unchanged
   * from the seed world).
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {string|undefined}
   */
  getBlock(x, y, z) {
    const entry = this._blockUpdates.get(World._blockKey(x, y, z));
    return entry ? entry.block : undefined;
  }

  /**
   * Return all recorded block updates as an array.
   *
   * @returns {object[]}
   */
  getAllBlockUpdates() {
    return [...this._blockUpdates.values()];
  }

  // -------------------------------------------------------------------------
  // Static helpers
  // -------------------------------------------------------------------------

  /** @param {number} x @param {number} y @param {number} z @returns {string} */
  static _blockKey(x, y, z) {
    return `${x},${y},${z}`;
  }
}

module.exports = World;
