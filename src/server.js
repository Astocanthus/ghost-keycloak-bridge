// Author : Benjamin Romeo (Astocanthus)
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
import { Issuer } from 'openid-client';
import memberRoutes from './routes/members.js';
import staffRoutes from './routes/staff.js';

// ---------------------------------------------------------------------------
// EXPRESS APPLICATION SETUP
// ---------------------------------------------------------------------------
// Initializes Express with proxy trust for Nginx/Traefik header forwarding.

const app = express();
const PORT = process.env.PORT || 3000;

app.enable('trust proxy');
app.use(cookieParser());

// ---------------------------------------------------------------------------
// OIDC CLIENT INITIALIZATION
// ---------------------------------------------------------------------------
// Discovers and configures OpenID Connect clients for both authentication realms.

async function start() {
  // Member Realm: handles blog subscribers and free/paid members
  const memberIssuer = await Issuer.discover(process.env.MEMBER_KEYCLOAK_ISSUER);
  const memberClient = new memberIssuer.Client({
    client_id: process.env.MEMBER_CLIENT_ID,
    client_secret: process.env.MEMBER_CLIENT_SECRET
  });

  // Staff Realm: handles Ghost admin panel access (editors, authors, admins)
  const staffIssuer = await Issuer.discover(process.env.STAFF_KEYCLOAK_ISSUER);
  const staffClient = new staffIssuer.Client({
    client_id: process.env.STAFF_CLIENT_ID,
    client_secret: process.env.STAFF_CLIENT_SECRET
  });

  // ---------------------------------------------------------------------------
  // ROUTE MOUNTING
  // ---------------------------------------------------------------------------
  // Attaches realm-specific route handlers with their respective OIDC clients.

  app.use('/auth/member', memberRoutes(memberClient));
  app.use('/auth/admin', staffRoutes(staffClient));

  // ---------------------------------------------------------------------------
  // SERVER START
  // ---------------------------------------------------------------------------
  // Binds to configured port after successful OIDC discovery.

  app.listen(PORT, () => {
    console.log(`✅ Ghost Keycloak Bridge started on port ${PORT}`);
  });
}

start();