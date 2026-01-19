// Copyright (C) - LOW-LAYER
// Contact : contact@low-layer.com

// ============================================================================
// server.js
// Main entry point for the Ghost Keycloak Bridge multi-realm SSO service
//
// Purpose:
//   - Initializes dual OIDC clients for Member and Staff authentication realms
//   - Configures Express middleware and routing
//   - Starts the HTTP server for reverse proxy integration
//
// Key Functions:
//   - Discovers Keycloak OIDC metadata for both realms dynamically
//   - Mounts /auth/member and /auth/admin route handlers
//   - Enables trust proxy for X-Forwarded-* header processing
//
// Characteristics:
//   - Async bootstrap: waits for OIDC discovery before accepting requests
//   - Requires environment variables for both Member and Staff realms
//   - Default port: 3000 (configurable via PORT env var)
// ============================================================================

import express from 'express';
import cookieParser from 'cookie-parser';
import { discovery } from 'openid-client';
import memberRoutes from './routes/members.js';
import staffRoutes from './routes/staff.js';
import { createLogger } from './lib/logger.js';
import healthRouter, { setStartupComplete } from './routes/health.js';

const log = createLogger('server');

// ---------------------------------------------------------------------------
// EXPRESS APPLICATION SETUP
// ---------------------------------------------------------------------------
// Initializes Express with proxy trust for Nginx/Traefik header forwarding.

const app = express();
const PORT = process.env.PORT || 3000;

app.enable('trust proxy');
app.use(cookieParser());
app.use(healthRouter);

// ---------------------------------------------------------------------------
// OIDC CLIENT INITIALIZATION
// ---------------------------------------------------------------------------
// Discovers and configures OpenID Connect clients for both authentication realms.

async function start() {
  log.info('Starting Ghost Keycloak Bridge...');
  log.debug('Configuration loaded', {
    port: PORT,
    blogUrl: process.env.BLOG_PUBLIC_URL,
    ghostInternalUrl: process.env.GHOST_INTERNAL_URL,
    memberIssuer: process.env.MEMBER_KEYCLOAK_ISSUER,
    staffIssuer: process.env.STAFF_KEYCLOAK_ISSUER
  });

  try {
    // Member Realm: handles blog subscribers and free/paid members
    log.info('Discovering Member OIDC issuer...', { issuer: process.env.MEMBER_KEYCLOAK_ISSUER });
    const memberConfig = await discovery(
      new URL(process.env.MEMBER_KEYCLOAK_ISSUER),
      process.env.MEMBER_CLIENT_ID,
      process.env.MEMBER_CLIENT_SECRET
    );
    log.info('Member OIDC client initialized');

    // Staff Realm: handles Ghost admin panel access (editors, authors, admins)
    log.info('Discovering Staff OIDC issuer...', { issuer: process.env.STAFF_KEYCLOAK_ISSUER });
    const staffConfig = await discovery(
      new URL(process.env.STAFF_KEYCLOAK_ISSUER),
      process.env.STAFF_CLIENT_ID,
      process.env.STAFF_CLIENT_SECRET
    );
    log.info('Staff OIDC client initialized');

    // ---------------------------------------------------------------------------
    // ROUTE MOUNTING
    // ---------------------------------------------------------------------------
    // Attaches realm-specific route handlers with their respective OIDC clients.

    app.use('/auth/member', memberRoutes(memberConfig));
    app.use('/auth/admin', staffRoutes(staffConfig));
    setStartupComplete();
    log.debug('Routes mounted', { paths: ['/auth/member', '/auth/admin'] });

    // ---------------------------------------------------------------------------
    // HEALTH CHECK ENDPOINT
    // ---------------------------------------------------------------------------

    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // ---------------------------------------------------------------------------
    // SERVER START
    // ---------------------------------------------------------------------------
    // Binds to configured port after successful OIDC discovery.

    app.listen(PORT, () => {
      log.info('Ghost Keycloak Bridge started', { port: PORT });
    });

  } catch (err) {
    log.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

start();