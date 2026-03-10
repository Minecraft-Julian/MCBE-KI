'use strict';

require('dotenv').config();

/** @type {number} WebSocket server listening port */
const PORT = parseInt(process.env.PORT, 10) || 8080;

/** @type {string} Supabase project URL (e.g. https://xxxx.supabase.co) */
const SUPABASE_URL = process.env.SUPABASE_URL || '';

/** @type {string} Supabase service role key (for server-side use only) */
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = {
  PORT,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
};
