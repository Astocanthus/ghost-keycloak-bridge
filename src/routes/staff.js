// Copyright (C) - LOW-LAYER
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
//
// Characteristics:
//   - Requires user to pre-exist in Ghost users table (no auto-provisioning)
//   - Session validity: 180 days (15552000000ms)
//   - Cookie path restricted to /ghost for admin panel isolation
// ============================================================================

import express from 'express';
import crypto from 'crypto';
import { query } from '../lib/db.js';
import { generateObjectId, generateSessionId } from '../lib/utils.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('staff');

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

    const blogUrl = (process.env.BLOG_PUBLIC_URL || '').replace(/\/$/, '');

    log.info('Staff routes initialized', { blogUrl });

    // ---------------------------------------------------------------------------
    // LOGIN ENDPOINT
    // ---------------------------------------------------------------------------

    router.get('/login', (req, res) => {
        const authUrl = oidcClient.authorizationUrl({
            scope: 'openid email profile',
            redirect_uri: process.env.STAFF_CALLBACK_URL
        });

        log.info('Staff login redirect', {
            redirectUri: process.env.STAFF_CALLBACK_URL
        });

        res.redirect(authUrl);
    });

    // ---------------------------------------------------------------------------
    // OIDC CALLBACK ENDPOINT
    // ---------------------------------------------------------------------------

    router.get('/callback', async (req, res) => {
        log.http('Staff callback received', { query: Object.keys(req.query) });

        try {
            const params = oidcClient.callbackParams(req);
            const tokenSet = await oidcClient.callback(process.env.STAFF_CALLBACK_URL, params);
            const email = tokenSet.claims().email;

            log.info('Staff token received', { email });

            // Verify user exists in Ghost
            const users = await query(
                "SELECT id FROM users WHERE email = ? AND status IN ('active', 'warn-1', 'warn-2', 'warn-3', 'locked')",
                [email]
            );

            if (users.length === 0) {
                log.warn('Staff user not found in Ghost', { email });
                return res.redirect('/auth/admin/login?error=user_not_found');
            }

            const userId = users[0].id;
            log.debug('Staff user found', { email, userId });

            // Retrieve Ghost session secret
            const settings = await query("SELECT value FROM settings WHERE `key` = 'admin_session_secret'");

            if (settings.length === 0) {
                log.error('admin_session_secret not found in Ghost settings');
                return res.redirect('/auth/admin/login?error=fatal_config');
            }

            const ghostSessionSecret = settings[0].value;

            // Generate session data
            const sessionId = generateSessionId();
            const rowId = generateObjectId();
            const now = new Date();
            const expiresAt = new Date(Date.now() + 15552000000); // 180 days

            // Extract real client IP
            let userIp = req.headers['x-real-ip']
                || req.headers['x-forwarded-for']
                || req.socket.remoteAddress
                || '127.0.0.1';

            if (userIp.includes(',')) {
                userIp = userIp.split(',')[0].trim();
            }

            const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';

            log.debug('Session metadata', {
                clientIp: userIp,
                userAgent: userAgent.substring(0, 50)
            });

            // Build session JSON
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
                origin: blogUrl,
                user_agent: userAgent,
                ip: userIp,
                verified: true
            });

            // Insert session into database
            await query(
                `INSERT INTO sessions (id, session_id, user_id, session_data, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [rowId, sessionId, userId, sessionData, now, now]
            );

            log.info('Staff session created', {
                email,
                userId,
                sessionId: sessionId.substring(0, 8) + '...',
                expiresAt: expiresAt.toISOString()
            });

            // Sign and set cookie
            const signedCookie = signCookie(sessionId, ghostSessionSecret);

            res.cookie('ghost-admin-api-session', signedCookie, {
                httpOnly: true,
                secure: true,
                path: '/ghost',
                maxAge: 15552000000,
                sameSite: 'none'
            });

            log.info('Staff login successful, redirecting to admin', { email });
            res.redirect(`${blogUrl}/ghost/`);

        } catch (err) {
            log.error('Staff callback failed', {
                error: err.message,
                stack: err.stack
            });
            res.redirect('/auth/admin/login?error=fatal');
        }
    });

    return router;
}