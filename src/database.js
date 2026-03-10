'use strict';

const fs = require('fs');
const admin = require('firebase-admin');
const config = require('./config');

let db = null;

/**
 * Initialise the Firebase Admin SDK.
 * Can be called multiple times safely; subsequent calls are no-ops.
 *
 * @returns {admin.firestore.Firestore} Firestore instance
 */
function init() {
  if (db) return db;

  let credential;

  if (config.FIREBASE_CREDENTIALS_BASE64) {
    const json = Buffer.from(config.FIREBASE_CREDENTIALS_BASE64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json);
    credential = admin.credential.cert(serviceAccount);
  } else if (config.FIREBASE_CREDENTIALS_PATH) {
    const serviceAccount = JSON.parse(fs.readFileSync(config.FIREBASE_CREDENTIALS_PATH, 'utf8'));
    credential = admin.credential.cert(serviceAccount);
  } else {
    // Fall back to Application Default Credentials (useful in CI / GCP)
    credential = admin.credential.applicationDefault();
  }

  const appOptions = { credential };
  if (config.FIREBASE_PROJECT_ID) appOptions.projectId = config.FIREBASE_PROJECT_ID;
  if (config.FIREBASE_DATABASE_URL) appOptions.databaseURL = config.FIREBASE_DATABASE_URL;

  if (!admin.apps.length) {
    admin.initializeApp(appOptions);
  }

  db = admin.firestore();
  return db;
}

/**
 * Returns the Firestore instance, initialising it on first call.
 *
 * @returns {admin.firestore.Firestore}
 */
function getDb() {
  return db || init();
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
  await getDb().collection('world').doc('info').set(
    {
      seed: String(worldInfo.seed),
      version: worldInfo.version || '',
      language: worldInfo.language || '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Read the stored world info.
 *
 * @returns {Promise<object|null>}
 */
async function getWorldInfo() {
  const snap = await getDb().collection('world').doc('info').get();
  return snap.exists ? snap.data() : null;
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
 * @returns {Promise<string>} Document ID
 */
async function saveWorldObject(obj) {
  const { type, x, y = null, z, ...rest } = obj;
  const data = { type, x, z, ...rest };
  if (y !== null) data.y = y;
  data.createdAt = admin.firestore.FieldValue.serverTimestamp();

  const ref = await getDb().collection('worldObjects').add(data);
  return ref.id;
}

/**
 * Query world objects, optionally filtered by type.
 *
 * @param {string} [type]
 * @returns {Promise<object[]>}
 */
async function getWorldObjects(type) {
  let query = getDb().collection('worldObjects');
  if (type) query = query.where('type', '==', type);
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
 * @returns {Promise<string>} Document ID
 */
async function saveBlockUpdate(blockUpdate) {
  const { x, y, z, block } = blockUpdate;
  const ref = await getDb().collection('blockUpdates').add({
    x,
    y,
    z,
    block,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Retrieve all stored block updates.
 *
 * @returns {Promise<object[]>}
 */
async function getBlockUpdates() {
  const snap = await getDb().collection('blockUpdates').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  await getDb().collection('bots').doc(botId).set(
    { ...info, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/**
 * Retrieve stored info for a bot.
 *
 * @param {string} botId
 * @returns {Promise<object|null>}
 */
async function getBotInfo(botId) {
  const snap = await getDb().collection('bots').doc(botId).get();
  return snap.exists ? snap.data() : null;
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
