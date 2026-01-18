// Author : Benjamin Romeo (Astocanthus)
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
import { query } from '../lib/db.js';
import { generateObjectId, generateUUID, generateMagicToken } from '../lib/utils.js';

// ---------------------------------------------------------------------------
// GHOST ADMIN API HELPER
// ---------------------------------------------------------------------------
// Manual implementation that follows redirects (SDK doesn't handle 301)

function createGhostApi(baseUrl, publicUrl, adminKey) {
  if (!adminKey || !adminKey.includes(':')) {
    console.error('❌ Invalid GHOST_ADMIN_API_KEY format! Expected: id:secret');
    console.error(`   Got: ${adminKey}`);
    throw new Error('GHOST_ADMIN_API_KEY must be in format id:secret');
  }

  const [id, secret] = adminKey.split(':');

  console.log(`   🔐 API Key ID: ${id}`);
  console.log(`   🔐 API Secret length: ${secret?.length || 0} chars`);

  // Generate JWT for Ghost Admin API authentication
  const generateToken = () => {
    const iat = Math.floor(Date.now() / 1000);
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

    // Extract hostname from public URL for Host header
    // Ghost redirects if Host doesn't match its configured url
    const publicHost = new URL(publicUrl).host;

    console.log(`   🌐 Ghost API request: ${url}`);
    console.log(`   🏠 Host header: ${publicHost}`);
    console.log(`   🔑 Token (first 50 chars): ${token.substring(0, 50)}...`);

    const response = await fetch(url, {
      ...options,
      redirect: 'manual',  // Don't follow redirects - we want to catch them
      headers: {
        'Authorization': `Ghost ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Host': publicHost,                    // Spoof the hostname
        'X-Forwarded-Proto': 'https',          // Tell Ghost we're already on HTTPS
        'X-Forwarded-Host': publicHost,        // Reinforce the hostname
        ...options.headers
      }
    });

    console.log(`   📨 Response: ${response.status} ${response.statusText}`);

    // If Ghost still redirects, something is wrong
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      console.error(`   ⚠️ Ghost redirected to: ${location}`);
      throw new Error(`Ghost redirected instead of responding. Location: ${location}`);
    }

    const text = await response.text();

    // Debug: show first 300 chars of response
    console.log(`   📄 Response body (first 300 chars): ${text.substring(0, 300)}`);

    if (!response.ok) {
      throw new Error(`Ghost API error ${response.status}: ${text.substring(0, 200)}`);
    }

    // Try to parse as JSON
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Ghost returned HTML instead of JSON. Response: ${text.substring(0, 200)}`);
    }
  };

  return {
    members: {
      browse: async (params = {}) => {
        const query = new URLSearchParams(params).toString();
        const data = await apiRequest(`/members/?${query}`);
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

export default function (oidcClient) {
  const router = express.Router();

  // Public URL for browser redirects (external)
  const blogUrl = (process.env.BLOG_PUBLIC_URL || '').replace(/\/$/, '');

  // Internal URL for Ghost API calls (Docker network)
  const ghostInternalUrl = (process.env.GHOST_INTERNAL_URL || blogUrl).replace(/\/$/, '');

  const apiKey = process.env.GHOST_ADMIN_API_KEY;

  console.log(`📡 Ghost API Config:`);
  console.log(`   Public URL (redirects): ${blogUrl}`);
  console.log(`   Internal URL (API): ${ghostInternalUrl}`);
  console.log(`   Key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING!'}`);

  // Custom Ghost API client that follows redirects
  const ghost = createGhostApi(ghostInternalUrl, blogUrl, apiKey);

  // ---------------------------------------------------------------------------
  // DEBUG ENDPOINT
  // ---------------------------------------------------------------------------
  // Test Ghost API connectivity: GET /auth/member/debug

  router.get('/debug', async (req, res) => {
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

    // Test Ghost API
    try {
      const members = await ghost.members.browse({ limit: 1 });
      results.tests.ghostApi = {
        success: true,
        responseType: typeof members,
        isArray: Array.isArray(members),
        count: Array.isArray(members) ? members.length : null
      };
    } catch (err) {
      results.tests.ghostApi = {
        success: false,
        error: err.message
      };
    }

    res.json(results);
  });

  // ---------------------------------------------------------------------------
  // LOGIN ENDPOINT
  // ---------------------------------------------------------------------------
  // Redirects user to Keycloak authorization endpoint.
  // Supports ?action=signup to redirect to Keycloak registration page.

  router.get('/login', (req, res) => {
    const action = req.query.action;
    let endpoint = oidcClient.issuer.metadata.authorization_endpoint;

    const params = new URLSearchParams({
      client_id: oidcClient.metadata.client_id,
      redirect_uri: process.env.MEMBER_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid email profile'
    });

    // Keycloak registration endpoint follows pattern: /auth -> /registrations
    if (action === 'signup') {
      endpoint = endpoint.replace(/\/auth$/, '/registrations');
    }

    res.redirect(`${endpoint}?${params.toString()}`);
  });

  // ---------------------------------------------------------------------------
  // LOGOUT ENDPOINT
  // ---------------------------------------------------------------------------
  // Performs local cookie cleanup and Keycloak Single Logout (SLO).
  // Uses stored id_token to bypass Keycloak logout confirmation screen.

  router.get('/logout', (req, res) => {
    const idToken = req.cookies['kc_member_id_token'];

    // Clear local session cookies
    res.clearCookie('ghost-members-ssr', { path: '/' });
    res.clearCookie('kc_member_id_token');

    const endSessionEndpoint = oidcClient.issuer.metadata.end_session_endpoint;

    if (endSessionEndpoint) {
      const params = new URLSearchParams({
        client_id: oidcClient.metadata.client_id,
        post_logout_redirect_uri: blogUrl
      });

      // id_token_hint allows logout without user confirmation
      if (idToken) {
        params.append('id_token_hint', idToken);
      }

      return res.redirect(`${endSessionEndpoint}?${params.toString()}`);
    }

    res.redirect(blogUrl);
  });

  // ---------------------------------------------------------------------------
  // OIDC CALLBACK ENDPOINT
  // ---------------------------------------------------------------------------
  // Processes authorization code, provisions member, and issues magic link.

  router.get('/callback', async (req, res) => {
    console.log('🔔 Callback triggered');
    console.log(`   Query params: ${JSON.stringify(req.query)}`);
    console.log(`   MEMBER_CALLBACK_URL: ${process.env.MEMBER_CALLBACK_URL}`);

    try {
      const params = oidcClient.callbackParams(req);
      console.log('📥 OIDC params extracted');

      const tokenSet = await oidcClient.callback(process.env.MEMBER_CALLBACK_URL, params);
      console.log('🎫 Token received from Keycloak');

      // Store id_token for SLO (avoids Keycloak confirmation prompt on logout)
      res.cookie('kc_member_id_token', tokenSet.id_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 3600000
      });

      const userEmail = tokenSet.claims().email;
      const userName = tokenSet.claims().name;

      console.log(`🔍 Looking up member: ${userEmail}`);
      console.log(`   Calling: ${ghostInternalUrl}/ghost/api/admin/members/`);

      // Auto-provision: create Ghost member if not exists
      let members;
      try {
        const browseResult = await ghost.members.browse({ filter: `email:'${userEmail}'` });
        console.log(`📦 Ghost API raw response type: ${typeof browseResult}`);
        console.log(`📦 Ghost API raw response: ${JSON.stringify(browseResult)?.substring(0, 200)}`);
        members = browseResult;
      } catch (apiErr) {
        console.error('❌ Ghost API browse error:', apiErr.message);
        console.error('   Full error:', apiErr);
        throw new Error(`Ghost API unreachable: ${apiErr.message}`);
      }

      // Handle case where API returns unexpected response
      if (!Array.isArray(members)) {
        console.error('❌ Ghost API returned non-array:', typeof members, members);
        throw new Error('Ghost API returned invalid response');
      }

      console.log(`📊 Members found: ${members.length}`);

      if (members.length === 0) {
        console.log(`➕ Creating new member: ${userEmail}`);
        await ghost.members.add({
          email: userEmail,
          name: userName
        });
      } else {
        console.log(`✅ Member found: ${userEmail}`);
      }

      // Generate magic link token and insert into Ghost tokens table
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

      // Redirect to Ghost magic link handler for session establishment
      res.redirect(`${blogUrl}/members/?token=${token}`);

    } catch (err) {
      console.error('❌ Member callback error:', err.message);
      console.error('   Stack:', err.stack);
      res.status(500).send(`Authentication failed: ${err.message}`);
    }
  });

  return router;
}