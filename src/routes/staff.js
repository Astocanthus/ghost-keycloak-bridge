// Author : Benjamin Romeo (Astocanthus)
// Contact : contact@low-layer.com

// ============================================================================
// staff.js
// Express router for Ghost admin panel authentication via Keycloak OIDC
//
// Purpose:
//   - Handles SSO login for Ghost staff users (admins, editors, authors)
//   - Creates native Ghost admin sessions via direct database injection
//   - Signs session cookies using Ghost's internal secret
//
// Key Functions:
//   - GET /login: Initiates OIDC authorization flow
//   - GET /callback: Validates user, creates session, sets signed cookie
//   - generateGhostSessionId(): Creates URL-safe session identifiers
//   - signCookie(): Implements Ghost's express-session signature format
//
// Characteristics:
//   - Requires user to pre-exist in Ghost users table (no auto-provisioning)
//   - Session validity: 180 days (15552000000ms)
//   - Cookie path restricted to /ghost for admin panel isolation
// ============================================================================

import express from 'express';
import crypto from 'crypto';
import { query } from '../lib/db.js';
import { generateObjectId } from '../lib/utils.js';

// ---------------------------------------------------------------------------
// SESSION ID GENERATOR
// ---------------------------------------------------------------------------
// Creates URL-safe base64 session identifiers matching Ghost's format.

/**
 * Generates a 32-character URL-safe session ID.
 * @returns {string} Base64 URL-safe session identifier
 */
const generateGhostSessionId = () => {
  return crypto.randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

// ---------------------------------------------------------------------------
// COOKIE SIGNATURE
// ---------------------------------------------------------------------------
// Implements express-session compatible HMAC-SHA256 signature.

/**
 * Signs a cookie value using Ghost's expected signature format.
 * Format: s:<value>.<base64-signature>
 * @param {string} val - Value to sign
 * @param {string} secret - Ghost admin_session_secret
 * @returns {string} Signed cookie string
 */
const signCookie = (val, secret) => {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(val)
    .digest('base64')
    .replace(/=+$/, '');
  return 's:' + val + '.' + signature;
};

// ---------------------------------------------------------------------------
// ROUTER FACTORY
// ---------------------------------------------------------------------------
// Returns an Express router configured with the provided OIDC client.

export default function (oidcClient) {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // LOGIN ENDPOINT
  // ---------------------------------------------------------------------------
  // Redirects staff user to Keycloak authorization endpoint.

  router.get('/login', (req, res) => {
    res.redirect(oidcClient.authorizationUrl({
      scope: 'openid email profile',
      redirect_uri: process.env.STAFF_CALLBACK_URL
    }));
  });

  // ---------------------------------------------------------------------------
  // OIDC CALLBACK ENDPOINT
  // ---------------------------------------------------------------------------
  // Validates staff user exists in Ghost, creates admin session, sets cookie.

  router.get('/callback', async (req, res) => {
    try {
      const params = oidcClient.callbackParams(req);
      const tokenSet = await oidcClient.callback(process.env.STAFF_CALLBACK_URL, params);
      const email = tokenSet.claims().email;

      // Verify user exists in Ghost with active-ish status
      const users = await query(
        "SELECT id FROM users WHERE email = ? AND status IN ('active', 'warn-1', 'warn-2', 'warn-3', 'locked')",
        [email]
      );

      if (users.length === 0) {
        return res.redirect('/auth/admin/login?error=user_not_found');
      }

      const userId = users[0].id;

      // Retrieve Ghost's session signing secret from database
      const settings = await query("SELECT value FROM settings WHERE `key` = 'admin_session_secret'");

      if (settings.length === 0) {
        console.error('❌ Fatal: admin_session_secret not found in database');
        return res.redirect('/auth/admin/login?error=fatal_config');
      }

      const ghostSessionSecret = settings[0].value;

      // Generate session identifiers and timestamps
      const sessionId = generateGhostSessionId();
      const rowId = generateObjectId();
      const now = new Date();
      const expiresAt = new Date(Date.now() + 15552000000); // 180 days

      // Extract real client IP (respects X-Real-IP from Nginx)
      let userIp = req.headers['x-real-ip']
        || req.headers['x-forwarded-for']
        || req.socket.remoteAddress
        || '127.0.0.1';

      // Handle proxy chains: take first IP (original client)
      if (userIp.includes(',')) {
        userIp = userIp.split(',')[0].trim();
      }

      const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';
      const origin = (process.env.BLOG_PUBLIC_URL || '').replace(/\/$/, '');

      // Build session data JSON matching Ghost's expected schema
      const sessionData = JSON.stringify({
        cookie: {
          originalMaxAge: 15552000000,
          expires: expiresAt.toISOString(),
          secure: true,
          httpOnly: true,
          path: '/ghost',
          sameSite: 'none'
        },
        user_id: userId,
        origin: origin,
        user_agent: userAgent,
        ip: userIp,
        verified: true
      });

      // Insert session record into Ghost sessions table
      await query(
        `INSERT INTO sessions (id, session_id, user_id, session_data, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
        [rowId, sessionId, userId, sessionData, now, now]
      );

      // Sign and set the admin session cookie
      const signedCookie = signCookie(sessionId, ghostSessionSecret);

      res.cookie('ghost-admin-api-session', signedCookie, {
        httpOnly: true,
        secure: true,
        path: '/ghost',
        maxAge: 15552000000,
        sameSite: 'none'
      });

      console.log(`🚀 Admin session created for ${email} (IP: ${userIp})`);
      res.redirect(`${process.env.BLOG_PUBLIC_URL}/ghost/`);

    } catch (err) {
      console.error('❌ Staff callback error:', err);
      res.redirect('/auth/admin/login?error=fatal');
    }
  });

  return router;
}