'use strict';

require('dotenv').config();

/** @type {number} WebSocket server listening port */
const PORT = parseInt(process.env.PORT, 10) || 8080;

/** @type {string|undefined} Base64-encoded Firebase service account JSON */
const FIREBASE_CREDENTIALS_BASE64 = process.env.FIREBASE_CREDENTIALS_BASE64 || '';

/** @type {string|undefined} Path to Firebase service account JSON file */
const FIREBASE_CREDENTIALS_PATH = process.env.FIREBASE_CREDENTIALS_PATH || '';

/** @type {string|undefined} Firebase project ID */
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';

/** @type {string|undefined} Firebase Realtime Database URL */
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || '';

module.exports = {
  PORT,
  FIREBASE_CREDENTIALS_BASE64,
  FIREBASE_CREDENTIALS_PATH,
  FIREBASE_PROJECT_ID,
  FIREBASE_DATABASE_URL,
};
