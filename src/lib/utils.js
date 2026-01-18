// Author : Benjamin Romeo (Astocanthus)
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

// ---------------------------------------------------------------------------
// ID GENERATORS
// ---------------------------------------------------------------------------
// Functions to create unique identifiers matching Ghost's internal formats.

/**
 * Generates a 24-character hexadecimal ID for Ghost database records.
 * Mirrors MongoDB ObjectId format used by Ghost's data layer.
 * @returns {string} 24-char hex string
 */
export const generateObjectId = () => crypto.randomBytes(12).toString('hex');

/**
 * Generates a RFC 4122 compliant UUID v4.
 * Used for member UUID fields and external references.
 * @returns {string} UUID string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export const generateUUID = () => crypto.randomUUID();

/**
 * Generates a URL-safe base64 token for magic link authentication.
 * Replaces +/= with URL-safe characters for query string compatibility.
 * @returns {string} 32-char URL-safe token
 */
export const generateMagicToken = () => {
  return crypto.randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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
  return `s:${cookieSignature.sign(sessionId, secret)}`;
};