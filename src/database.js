'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

let supabase = null;

/**
 * Initialise the Supabase client.
 * Can be called multiple times safely; subsequent calls are no-ops.
 *
 * Required Supabase tables (run in Supabase SQL editor):
 *
 *   create table world_info (
 *     id int default 1 primary key check (id = 1),
 *     seed text, version text, language text,
 *     updated_at timestamptz default now()
 *   );
 *   create table world_objects (
 *     id uuid default gen_random_uuid() primary key,
 *     type text not null, x numeric not null, y numeric, z numeric not null,
 *     metadata jsonb default '{}'::jsonb,
 *     created_at timestamptz default now()
 *   );
 *   create table block_updates (
 *     id uuid default gen_random_uuid() primary key,
 *     x numeric not null, y numeric not null, z numeric not null,
 *     block text not null, created_at timestamptz default now()
 *   );
 *   create table bots (
 *     bot_id text primary key,
 *     info jsonb default '{}'::jsonb,
 *     updated_at timestamptz default now()
 *   );
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function init() {
  if (supabase) return supabase;
  supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
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
// World info
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
      id: 1,
      seed: String(worldInfo.seed),
      version: worldInfo.version || '',
      language: worldInfo.language || '',
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`saveWorldInfo: ${error.message}`);
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
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`getWorldInfo: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// World objects (trees, villages, ruins)
// ---------------------------------------------------------------------------

/**
 * Add a world object.
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
  const row = { type, x, z, metadata: rest };
  if (y !== null) row.y = y;

  const { data, error } = await getDb()
    .from('world_objects')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(`saveWorldObject: ${error.message}`);
  return data.id;
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
  if (error) throw new Error(`getWorldObjects: ${error.message}`);
  return (data || []).map(({ id, type: t, x, y, z, metadata }) => ({
    id,
    type: t,
    x,
    ...(y !== null && y !== undefined ? { y } : {}),
    z,
    ...metadata,
  }));
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
    .insert({ x, y, z, block })
    .select('id')
    .single();
  if (error) throw new Error(`saveBlockUpdate: ${error.message}`);
  return data.id;
}

/**
 * Retrieve all stored block updates.
 *
 * @returns {Promise<object[]>}
 */
async function getBlockUpdates() {
  const { data, error } = await getDb().from('block_updates').select('*');
  if (error) throw new Error(`getBlockUpdates: ${error.message}`);
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
    .upsert({ bot_id: botId, info, updated_at: new Date().toISOString() });
  if (error) throw new Error(`saveBotInfo: ${error.message}`);
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
    .select('info')
    .eq('bot_id', botId)
    .maybeSingle();
  if (error) throw new Error(`getBotInfo: ${error.message}`);
  return data ? data.info : null;
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
