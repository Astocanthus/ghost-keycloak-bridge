# Changelog

All notable changes to the Ghost Keycloak Bridge project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-01-18

### Added

- **Admin UI Injection Script** (`ghost-sso/6.x/custom-start.sh`)
  - Automatically patches Ghost Admin login page at container startup
  - Injects "Login with OIDC (Staff)" button directly on the login form
  - Uses MutationObserver for dynamic injection on SPA navigation
  - Idempotent: skips patching if button already exists
  - Version-specific folder structure (`ghost-sso/6.x/`) for Ghost version compatibility

- **Docker/Kubernetes Deployment Support**
  - Volume mount examples for Docker Compose
  - ConfigMap examples for Kubernetes deployments

---

## [1.0.0] - 2026-01-17

### Added

- **Dual-Realm Authentication**
  - Separate OIDC clients for Members (subscribers) and Staff (admins)
  - Automatic OIDC issuer discovery at startup

- **Member SSO** (`src/routes/members.js`)
  - Auto-provisioning of Ghost members via Admin API
  - Magic link token generation for native session establishment
  - `id_token` storage for seamless Keycloak Single Logout (SLO)
  - Support for signup redirect (`?action=signup`)
  - Custom fetch-based Ghost API client (replaces `@tryghost/admin-api` SDK)
  - HTTP header spoofing (`Host`, `X-Forwarded-Proto`, `X-Forwarded-Host`) for Docker environments
  - Debug endpoint (`/auth/member/debug`) for API connectivity testing

- **Staff SSO** (`src/routes/staff.js`)
  - Direct session injection into Ghost `sessions` table
  - User validation against Ghost `users` table (active status check)
  - Native cookie signing with `admin_session_secret`
  - Real IP extraction from `X-Real-IP` / `X-Forwarded-For` headers

- **Database Layer** (`src/lib/db.js`)
  - MySQL connection pooling with `mysql2/promise`
  - Query helper with parameterized statements
  - Ghost secret retrieval utilities

- **Cryptographic Utilities** (`src/lib/utils.js`)
  - Ghost-compatible ObjectId generation (24-char hex)
  - UUID v4 generation
  - URL-safe magic token generation
  - Cookie signature implementation

- **Docker Container**
  - Node.js 22 Alpine base image (~50MB)
  - Rootless execution as `node` user (UID 1000)
  - Production-only dependencies

- **Environment Configuration**
  - `GHOST_INTERNAL_URL` for Docker network API calls
  - `BLOG_PUBLIC_URL` for browser redirects
  - Separated internal/external URL handling

- **Documentation**
  - Comprehensive README with architecture diagrams
  - Nginx configuration examples (including `/ghost/api/` exclusion)
  - Environment variable reference
  - Troubleshooting guide for common issues

### Security

- All cookies use `HttpOnly`, `Secure`, and `SameSite` flags
- Admin cookies scoped to `/ghost` path only
- JWT tokens with 5-minute expiry for API calls
- No sensitive data logged

---

## [Unreleased]

### Planned

- Unit tests for `src/lib/utils.js` and `src/lib/db.js`
- Integration tests with mocked Ghost/Keycloak
- Health check endpoint (`/health`)
- Prometheus metrics endpoint (`/metrics`)

---

[1.1.0]: https://github.com/Astocanthus/ghost-keycloak-bridge/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Astocanthus/ghost-keycloak-bridge/releases/tag/v1.0.0