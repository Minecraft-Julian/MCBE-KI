'use strict';

require('dotenv').config();

/** @type {number} WebSocket server listening port */
const PORT = parseInt(process.env.PORT, 10) || 8080;

/** @type {string} Supabase project URL (e.g. https://<project>.supabase.co) */
const SUPABASE_URL = process.env.SUPABASE_URL || '';

/** @type {string} Supabase anon/service-role API key */
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

module.exports = {
  PORT,
  SUPABASE_URL,
  SUPABASE_KEY,
};
