'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

let supabase = null;

/**
 * Initialise the Supabase client.
 * Can be called multiple times safely; subsequent calls are no-ops.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function init() {
  if (supabase) return supabase;
  supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
  return supabase;
}

/**
 * Returns the Supabase client, initialising it on first call.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getDb() {
  return supabase || init();
}

// ---------------------------------------------------------------------------
// World seed
// ---------------------------------------------------------------------------

/**
 * Persist the world seed and basic metadata received when the bot first connects.
 *
 * @param {object} worldInfo
 * @param {string|number} worldInfo.seed
 * @param {string} worldInfo.version
 * @param {string} worldInfo.language
 * @returns {Promise<void>}
 */
async function saveWorldInfo(worldInfo) {
  const { error } = await getDb()
    .from('world_info')
    .upsert({
      id: 'singleton',
      seed: String(worldInfo.seed),
      version: worldInfo.version || '',
      language: worldInfo.language || '',
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

/**
 * Read the stored world info.
 *
 * @returns {Promise<object|null>}
 */
async function getWorldInfo() {
  const { data, error } = await getDb()
    .from('world_info')
    .select('*')
    .eq('id', 'singleton')
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// World objects (trees, villages, ruins)
// ---------------------------------------------------------------------------

/**
 * Add or update a world object.
 *
 * @param {object} obj
 * @param {'tree'|'village'|'ruin'} obj.type
 * @param {number} obj.x
 * @param {number} [obj.y]
 * @param {number} obj.z
 * @param {object} [rest]   Additional type-specific fields (e.g. species, variant)
 * @returns {Promise<string>} Row ID
 */
async function saveWorldObject(obj) {
  const { type, x, y = null, z, ...rest } = obj;
  const row = { type, x, z, ...rest, created_at: new Date().toISOString() };
  if (y !== null) row.y = y;

  const { data, error } = await getDb()
    .from('world_objects')
    .insert(row)
    .select('id')
    .single();
  if (error) throw error;
  return String(data.id);
}

/**
 * Query world objects, optionally filtered by type.
 *
 * @param {string} [type]
 * @returns {Promise<object[]>}
 */
async function getWorldObjects(type) {
  let query = getDb().from('world_objects').select('*');
  if (type) query = query.eq('type', type);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Block updates
// ---------------------------------------------------------------------------

/**
 * Record a block change relative to the original seed world.
 *
 * @param {object} blockUpdate
 * @param {number} blockUpdate.x
 * @param {number} blockUpdate.y
 * @param {number} blockUpdate.z
 * @param {string} blockUpdate.block  Block type string, e.g. "air", "stone"
 * @returns {Promise<string>} Row ID
 */
async function saveBlockUpdate(blockUpdate) {
  const { x, y, z, block } = blockUpdate;
  const { data, error } = await getDb()
    .from('block_updates')
    .insert({ x, y, z, block, timestamp: new Date().toISOString() })
    .select('id')
    .single();
  if (error) throw error;
  return String(data.id);
}

/**
 * Retrieve all stored block updates.
 *
 * @returns {Promise<object[]>}
 */
async function getBlockUpdates() {
  const { data, error } = await getDb().from('block_updates').select('*');
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Bot information
// ---------------------------------------------------------------------------

/**
 * Persist or update information about a connected bot.
 *
 * @param {string} botId   Unique identifier for this bot (e.g. player name)
 * @param {object} info    Arbitrary bot state data
 * @returns {Promise<void>}
 */
async function saveBotInfo(botId, info) {
  const { error } = await getDb()
    .from('bots')
    .upsert({ id: botId, ...info, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/**
 * Retrieve stored info for a bot.
 *
 * @param {string} botId
 * @returns {Promise<object|null>}
 */
async function getBotInfo(botId) {
  const { data, error } = await getDb()
    .from('bots')
    .select('*')
    .eq('id', botId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = {
  init,
  getDb,
  saveWorldInfo,
  getWorldInfo,
  saveWorldObject,
  getWorldObjects,
  saveBlockUpdate,
  getBlockUpdates,
  saveBotInfo,
  getBotInfo,
};
