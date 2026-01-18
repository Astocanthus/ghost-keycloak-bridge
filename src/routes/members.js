// Copyright (C) - LOW-LAYER
// Contact : contact@low-layer.com

// ============================================================================
// members.js
// Express router for Ghost member authentication via Keycloak OIDC
//
// Purpose:
//   - Handles SSO login/logout flow for blog members (subscribers)
//   - Auto-provisions Ghost members on first Keycloak login
//   - Generates magic link tokens for native Ghost session establishment
//
// Key Functions:
//   - GET /login: Initiates OIDC authorization (supports signup redirect)
//   - GET /logout: Clears local cookies and triggers Keycloak SLO
//   - GET /callback: Processes OIDC response and provisions Ghost member
//
// Characteristics:
//   - Uses Ghost Admin API for member management
//   - Stores id_token in cookie for logout without confirmation prompt
//   - Magic token inserted directly into Ghost tokens table for seamless auth
// ============================================================================

import express from 'express';
import jwt from 'jsonwebtoken';
import { authorizationCodeGrant } from 'openid-client';
import { query } from '../lib/db.js';
import { generateObjectId, generateUUID, generateMagicToken } from '../lib/utils.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('members');

// ---------------------------------------------------------------------------
// GHOST ADMIN API HELPER
// ---------------------------------------------------------------------------
// Manual implementation that handles redirects (SDK doesn't handle 301)

function createGhostApi(baseUrl, publicUrl, adminKey) {
  if (!adminKey || !adminKey.includes(':')) {
    log.error('Invalid GHOST_ADMIN_API_KEY format', { expected: 'id:secret' });
    throw new Error('GHOST_ADMIN_API_KEY must be in format id:secret');
  }

  const [id, secret] = adminKey.split(':');

  log.debug('Ghost API client initialized', {
    baseUrl,
    publicUrl,
    keyId: id,
    secretLength: secret?.length || 0
  });

  // Generate JWT for Ghost Admin API authentication
  const generateToken = () => {
    return jwt.sign({}, Buffer.from(secret, 'hex'), {
      keyid: id,
      algorithm: 'HS256',
      expiresIn: '5m',
      audience: '/admin/'
    });
  };

  const apiRequest = async (endpoint, options = {}) => {
    const token = generateToken();
    const url = `${baseUrl}/ghost/api/admin${endpoint}`;
    const publicHost = new URL(publicUrl).host;

    log.http('Ghost API request', {
      method: options.method || 'GET',
      url,
      host: publicHost
    });

    const response = await fetch(url, {
      ...options,
      redirect: 'manual',
      headers: {
        'Authorization': `Ghost ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Host': publicHost,
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': publicHost,
        ...options.headers
      }
    });

    log.http('Ghost API response', {
      status: response.status,
      statusText: response.statusText
    });

    // Handle redirects as errors
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      log.warn('Ghost API redirected', { location });
      throw new Error(`Ghost redirected to: ${location}`);
    }

    const text = await response.text();

    if (!response.ok) {
      log.error('Ghost API error', {
        status: response.status,
        body: text.substring(0, 200)
      });
      throw new Error(`Ghost API error ${response.status}: ${text.substring(0, 200)}`);
    }

    // Parse JSON response
    try {
      const data = JSON.parse(text);
      log.debug('Ghost API success', { endpoint });
      return data;
    } catch (e) {
      log.error('Ghost API returned invalid JSON', {
        bodyPreview: text.substring(0, 100)
      });
      throw new Error(`Ghost returned HTML instead of JSON`);
    }
  };

  return {
    members: {
      browse: async (params = {}) => {
        const queryStr = new URLSearchParams(params).toString();
        const data = await apiRequest(`/members/?${queryStr}`);
        return data.members || [];
      },
      add: async (member) => {
        const data = await apiRequest('/members/', {
          method: 'POST',
          body: JSON.stringify({ members: [member] })
        });
        return data.members?.[0];
      }
    }
  };
}

// ---------------------------------------------------------------------------
// ROUTER FACTORY
// ---------------------------------------------------------------------------
// Returns an Express router configured with the provided OIDC client.

export default function (oidcConfig) {
  const router = express.Router();

  // URL configuration
  const blogUrl = (process.env.BLOG_PUBLIC_URL || '').replace(/\/$/, '');
  const ghostInternalUrl = (process.env.GHOST_INTERNAL_URL || blogUrl).replace(/\/$/, '');
  const apiKey = process.env.GHOST_ADMIN_API_KEY;

  log.info('Member routes initialized', {
    blogUrl,
    ghostInternalUrl,
    apiKeyPresent: !!apiKey
  });

  // Ghost API client
  const ghost = createGhostApi(ghostInternalUrl, blogUrl, apiKey);

  // ---------------------------------------------------------------------------
  // DEBUG ENDPOINT
  // ---------------------------------------------------------------------------

  router.get('/debug', async (req, res) => {
    log.debug('Debug endpoint called');

    const results = {
      config: {
        blogUrl,
        ghostInternalUrl,
        apiKeyPresent: !!apiKey,
        apiKeyPrefix: apiKey ? apiKey.substring(0, 10) : null,
        memberCallbackUrl: process.env.MEMBER_CALLBACK_URL
      },
      tests: {}
    };

    try {
      const members = await ghost.members.browse({ limit: 1 });
      results.tests.ghostApi = {
        success: true,
        responseType: typeof members,
        isArray: Array.isArray(members),
        count: Array.isArray(members) ? members.length : null
      };
      log.info('Debug: Ghost API test passed');
    } catch (err) {
      results.tests.ghostApi = {
        success: false,
        error: err.message
      };
      log.warn('Debug: Ghost API test failed', { error: err.message });
    }

    res.json(results);
  });

  // ---------------------------------------------------------------------------
  // LOGIN ENDPOINT
  // ---------------------------------------------------------------------------

  router.get('/login', (req, res) => {
    const action = req.query.action;
    const metadata = oidcConfig.serverMetadata();
    let endpoint = metadata.authorization_endpoint;

    const params = new URLSearchParams({
      client_id: process.env.MEMBER_CLIENT_ID,
      redirect_uri: process.env.MEMBER_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile'
    });

    // Keycloak registration endpoint
    if (action === 'signup') {
      endpoint = endpoint.replace(/\/auth$/, '/registrations');
      log.info('Login redirect (signup mode)', { endpoint });
    } else {
      log.info('Login redirect', { endpoint });
    }

    res.redirect(`${endpoint}?${params.toString()}`);
  });

  // ---------------------------------------------------------------------------
  // LOGOUT ENDPOINT
  // ---------------------------------------------------------------------------

  router.get('/logout', (req, res) => {
    const idToken = req.cookies['kc_member_id_token'];

    log.info('Logout initiated', { hasIdToken: !!idToken });

    // Clear local cookies
    res.clearCookie('ghost-members-ssr', { path: '/' });
    res.clearCookie('kc_member_id_token');

    const endSessionEndpoint = oidcConfig.serverMetadata().end_session_endpoint;

    if (endSessionEndpoint) {
      const params = new URLSearchParams({
        client_id: process.env.MEMBER_CLIENT_ID,
        post_logout_redirect_uri: blogUrl
      });

      if (idToken) {
        params.append('id_token_hint', idToken);
      }

      log.debug('Redirecting to Keycloak logout', { endpoint: endSessionEndpoint });
      return res.redirect(`${endSessionEndpoint}?${params.toString()}`);
    }

    log.debug('No end_session_endpoint, redirecting to blog');
    res.redirect(blogUrl);
  });

  // ---------------------------------------------------------------------------
  // OIDC CALLBACK ENDPOINT
  // ---------------------------------------------------------------------------

  router.get('/callback', async (req, res) => {
    log.http('Callback received', { query: Object.keys(req.query) });

    try {
      const currentUrl = new URL(req.protocol + '://' + req.get('host') + req.originalUrl);
      log.debug('OIDC params extracted');

      const tokenSet = await authorizationCodeGrant(oidcConfig, currentUrl, {
        redirect_uri: process.env.MEMBER_CALLBACK_URL
      });
      const claims = tokenSet.claims();
      log.info('Token received from Keycloak');

      // Store id_token for SLO
      res.cookie('kc_member_id_token', tokenSet.id_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 3600000
      });

      const userEmail = claims.email;
      const userName = claims.name;

      log.info('Processing member authentication', { email: userEmail });

      // Check if member exists
      let members;
      try {
        members = await ghost.members.browse({ filter: `email:'${userEmail}'` });
      } catch (apiErr) {
        log.error('Ghost API browse failed', { error: apiErr.message });
        throw new Error(`Ghost API unreachable: ${apiErr.message}`);
      }

      if (!Array.isArray(members)) {
        log.error('Ghost API returned invalid response', { type: typeof members });
        throw new Error('Ghost API returned invalid response');
      }

      // Auto-provision member
      if (members.length === 0) {
        log.info('Creating new member', { email: userEmail, name: userName });
        await ghost.members.add({
          email: userEmail,
          name: userName
        });
      } else {
        log.debug('Member exists', { email: userEmail, memberId: members[0].id });
      }

      // Generate magic token
      const token = generateMagicToken();
      const now = new Date();

      await query(
        `INSERT INTO tokens (id, token, uuid, data, created_at, updated_at, used_count, otc_used_count) 
                 VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
        [
          generateObjectId(),
          token,
          generateUUID(),
          JSON.stringify({ email: userEmail, type: 'signin' }),
          now,
          now
        ]
      );

      log.info('Magic token created, redirecting', { email: userEmail });
      res.redirect(`${blogUrl}/members/?token=${token}`);

    } catch (err) {
      log.error('Callback failed', {
        error: err.message,
        stack: err.stack
      });
      res.status(500).send(`Authentication failed: ${err.message}`);
    }
  });

  return router;
}