// Copyright (C) - LOW-LAYER
// Contact : contact@low-layer.com

// ============================================================================
// utils.js
// Cryptographic utilities for Ghost session and token generation
//
// Purpose:
//   - Provides secure random ID generators compatible with Ghost's data model
//   - Implements Ghost-compatible cookie signature algorithm
//
// Key Functions:
//   - generateObjectId(): Creates 24-char hex IDs for database primary keys
//   - generateUUID(): Creates RFC 4122 compliant UUIDs
//   - generateMagicToken(): Creates URL-safe base64 tokens for magic links
//   - signGhostCookie(): Signs session cookies using Ghost's expected format
//
// Characteristics:
//   - Uses Node.js crypto module for CSPRNG (cryptographically secure)
//   - All outputs are URL-safe (no +, /, or = characters)
//   - Cookie signature compatible with Ghost's express-session middleware
// ============================================================================

import crypto from 'crypto';
import cookieSignature from 'cookie-signature';
import { createLogger } from './logger.js';

const log = createLogger('utils');

// ---------------------------------------------------------------------------
// ID GENERATORS
// ---------------------------------------------------------------------------
// Functions to create unique identifiers matching Ghost's internal formats.

/**
 * Generates a 24-character hexadecimal ID for Ghost database records.
 * Mirrors MongoDB ObjectId format used by Ghost's data layer.
 * @returns {string} 24-char hex string
 */
export const generateObjectId = () => {
    const id = crypto.randomBytes(12).toString('hex');
    log.debug('Generated ObjectId', { id: id.substring(0, 8) + '...' });
    return id;
};

/**
 * Generates a RFC 4122 compliant UUID v4.
 * Used for member UUID fields and external references.
 * @returns {string} UUID string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export const generateUUID = () => {
    const uuid = crypto.randomUUID();
    log.debug('Generated UUID', { uuid: uuid.substring(0, 8) + '...' });
    return uuid;
};

/**
 * Generates a URL-safe base64 token for magic link authentication.
 * Replaces +/= with URL-safe characters for query string compatibility.
 * @returns {string} 32-char URL-safe token
 */
export const generateMagicToken = () => {
    const token = crypto.randomBytes(24)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    log.debug('Generated magic token', { tokenPrefix: token.substring(0, 8) + '...' });
    return token;
};

// ---------------------------------------------------------------------------
// COOKIE SIGNATURE
// ---------------------------------------------------------------------------
// Implements Ghost's expected cookie signature format for session validation.

/**
 * Signs a session ID using Ghost's cookie signature format.
 * Produces cookies in the format: s:<sessionId>.<signature>
 * @param {string} sessionId - The session identifier to sign
 * @param {string} secret - The Ghost admin_session_secret
 * @returns {string} Signed cookie value prefixed with 's:'
 */
export const signGhostCookie = (sessionId, secret) => {
    const signed = `s:${cookieSignature.sign(sessionId, secret)}`;
    log.debug('Cookie signed', { sessionIdPrefix: sessionId.substring(0, 8) + '...' });
    return signed;
};

// ---------------------------------------------------------------------------
// SESSION ID GENERATOR
// ---------------------------------------------------------------------------

/**
 * Generates a 32-character URL-safe session ID for Ghost admin sessions.
 * @returns {string} Base64 URL-safe session identifier
 */
export const generateSessionId = () => {
    const sessionId = crypto.randomBytes(24)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    log.debug('Generated session ID', { prefix: sessionId.substring(0, 8) + '...' });
    return sessionId;
};