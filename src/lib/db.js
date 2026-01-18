// Author : Benjamin Romeo (Astocanthus)
// Contact : contact@low-layer.com

// ============================================================================
// db.js
// MySQL database connection pool and query utilities for Ghost integration
//
// Purpose:
//   - Provides a reusable connection pool to the Ghost MySQL/MariaDB database
//   - Exposes helper functions for session management and configuration lookups
//
// Key Functions:
//   - query(): Executes parameterized SQL statements with automatic escaping
//   - fetchGhostSecret(): Retrieves the db_hash for cookie signature validation
//   - isStaffEmpty(): Checks for active admin users (setup detection)
//
// Characteristics:
//   - Uses mysql2/promise for async/await compatibility
//   - Connection pool auto-manages idle connections
//   - Environment-driven configuration with sensible defaults
// ============================================================================

import mysql from 'mysql2/promise';

// ---------------------------------------------------------------------------
// CONNECTION POOL INITIALIZATION
// ---------------------------------------------------------------------------
// Creates a persistent connection pool to the Ghost database.
// Pool automatically handles connection lifecycle and reconnection.

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'ghost-db',
  user: process.env.DB_USER || 'ghost',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'ghost',
  port: parseInt(process.env.DB_PORT || '3306')
});

// ---------------------------------------------------------------------------
// QUERY EXECUTOR
// ---------------------------------------------------------------------------
// Executes prepared statements with automatic parameter binding.

/**
 * Executes a parameterized SQL query against the Ghost database.
 * @param {string} sql - SQL statement with ? placeholders
 * @param {Array} params - Values to bind to placeholders
 * @returns {Promise<Array>} Query results
 */
export const query = async (sql, params) => {
  const [results] = await pool.execute(sql, params);
  return results;
};

// ---------------------------------------------------------------------------
// GHOST CONFIGURATION HELPERS
// ---------------------------------------------------------------------------
// Utility functions to retrieve Ghost-specific settings from the database.

/**
 * Retrieves the Ghost database hash used for internal signatures.
 * @returns {Promise<string|null>} The db_hash value or null if not found
 */
export const fetchGhostSecret = async () => {
  const rows = await query("SELECT value FROM settings WHERE `key` = 'db_hash'");
  return rows.length > 0 ? rows[0].value : null;
};

/**
 * Checks if the Ghost instance has any active staff users.
 * Used to detect fresh installations requiring setup.
 * @returns {Promise<boolean>} True if no active staff exists
 */
export const isStaffEmpty = async () => {
  const rows = await query("SELECT count(*) as count FROM users WHERE status = 'active'");
  return rows[0].count === 0;
};