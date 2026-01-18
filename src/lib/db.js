// Copyright (C) - LOW-LAYER
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
import { createLogger } from './logger.js';

const log = createLogger('db');

// ---------------------------------------------------------------------------
// CONNECTION POOL INITIALIZATION
// ---------------------------------------------------------------------------
// Creates a persistent connection pool to the Ghost database.
// Pool automatically handles connection lifecycle and reconnection.

const poolConfig = {
    host: process.env.DB_HOST || 'ghost-db',
    user: process.env.DB_USER || 'ghost',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'ghost',
    port: parseInt(process.env.DB_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

log.debug('Initializing database pool', {
    host: poolConfig.host,
    database: poolConfig.database,
    port: poolConfig.port
});

const pool = mysql.createPool(poolConfig);

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
export const query = async (sql, params = []) => {
    const startTime = Date.now();

    try {
        const [results] = await pool.execute(sql, params);
        const duration = Date.now() - startTime;

        log.debug('Query executed', {
            sql: sql.substring(0, 100),
            params: params.length,
            rows: Array.isArray(results) ? results.length : 1,
            duration: `${duration}ms`
        });

        return results;
    } catch (err) {
        log.error('Query failed', {
            sql: sql.substring(0, 100),
            error: err.message,
            code: err.code
        });
        throw err;
    }
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
    log.debug('Fetching Ghost db_hash');
    const rows = await query("SELECT value FROM settings WHERE `key` = 'db_hash'");

    if (rows.length > 0) {
        log.debug('Ghost db_hash retrieved');
        return rows[0].value;
    }

    log.warn('Ghost db_hash not found in settings');
    return null;
};

/**
 * Checks if the Ghost instance has any active staff users.
 * Used to detect fresh installations requiring setup.
 * @returns {Promise<boolean>} True if no active staff exists
 */
export const isStaffEmpty = async () => {
    log.debug('Checking for active staff users');
    const rows = await query("SELECT count(*) as count FROM users WHERE status = 'active'");
    const isEmpty = rows[0].count === 0;

    log.debug('Staff check complete', { activeUsers: rows[0].count, isEmpty });
    return isEmpty;
};

// ---------------------------------------------------------------------------
// CONNECTION TEST
// ---------------------------------------------------------------------------

/**
 * Tests database connectivity.
 * @returns {Promise<boolean>} True if connection successful
 */
export const testConnection = async () => {
    try {
        await query('SELECT 1');
        log.info('Database connection verified');
        return true;
    } catch (err) {
        log.error('Database connection failed', { error: err.message });
        return false;
    }
};