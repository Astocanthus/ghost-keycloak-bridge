// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// logger.js
// Centralized logging module with Winston for structured log output
//
// Purpose:
//   - Provides consistent logging across all application modules
//   - Supports multiple log levels configurable via environment
//   - Outputs structured JSON logs for production, pretty logs for development
//
// Key Functions:
//   - logger.error(): Critical errors requiring immediate attention
//   - logger.warn(): Warning conditions that should be investigated
//   - logger.info(): General operational information
//   - logger.http(): HTTP request/response logging
//   - logger.debug(): Detailed debugging information
//
// Characteristics:
//   - Log level configurable via LOG_LEVEL environment variable
//   - Automatic format switching based on NODE_ENV
//   - Includes timestamp, level, and context in all log entries
// ============================================================================

import winston from 'winston';

// ---------------------------------------------------------------------------
// LOG LEVELS DEFINITION
// ---------------------------------------------------------------------------
// Custom levels following standard severity ordering (lower = more severe)

const levels = {
    error: 0,   // Critical errors - system failures, unrecoverable states
    warn: 1,    // Warnings - degraded functionality, recoverable issues
    info: 2,    // Info - general operational messages, lifecycle events
    http: 3,    // HTTP - request/response logging, API calls
    debug: 4    // Debug - detailed diagnostic information
};

// ---------------------------------------------------------------------------
// LOG COLORS (Development Console)
// ---------------------------------------------------------------------------

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'cyan',
    debug: 'gray'
};

winston.addColors(colors);

// ---------------------------------------------------------------------------
// LOG LEVEL CONFIGURATION
// ---------------------------------------------------------------------------
// Determined by LOG_LEVEL env var, defaults based on NODE_ENV

const getLogLevel = () => {
    const env = process.env.LOG_LEVEL;
    if (env && levels[env] !== undefined) {
        return env;
    }
    // Default: debug in development, info in production
    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

// ---------------------------------------------------------------------------
// LOG FORMATS
// ---------------------------------------------------------------------------

// Production format: JSON for log aggregators (ELK, Loki, CloudWatch)
const jsonFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Development format: Human-readable colored output
const devFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.colorize({ all: true }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
        const mod = module ? `[${module}]` : '';
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level} ${mod} ${message}${metaStr}`;
    })
);

// ---------------------------------------------------------------------------
// LOGGER INSTANCE
// ---------------------------------------------------------------------------

const logger = winston.createLogger({
    levels,
    level: getLogLevel(),
    format: process.env.NODE_ENV === 'production' ? jsonFormat : devFormat,
    transports: [
        new winston.transports.Console({
            stderrLevels: ['error']
        })
    ],
    // Don't exit on handled exceptions
    exitOnError: false
});

// ---------------------------------------------------------------------------
// CHILD LOGGER FACTORY
// ---------------------------------------------------------------------------
// Creates module-specific loggers with automatic context

/**
 * Creates a child logger with module context.
 * @param {string} moduleName - Name of the module (e.g., 'members', 'staff', 'db')
 * @returns {winston.Logger} Child logger instance
 * 
 * @example
 * const log = createLogger('members');
 * log.info('User authenticated', { email: 'user@example.com' });
 * // Output: 10:30:45.123 info [members] User authenticated {"email":"user@example.com"}
 */
export const createLogger = (moduleName) => {
    return logger.child({ module: moduleName });
};

// ---------------------------------------------------------------------------
// DEFAULT EXPORT
// ---------------------------------------------------------------------------

export default logger;