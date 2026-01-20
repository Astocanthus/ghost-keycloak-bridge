# Changelog

All notable changes to the Ghost Keycloak Bridge project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-01-20

### Added

- **Health Check Endpoints** (`src/routes/health.js`)
  - `GET /health`, `/healthz` - Liveness probe (always 200 if process running)
  - `GET /ready`, `/readyz` - Readiness probe (200 if database connected, 503 otherwise)
  - `GET /startup` - Startup probe for slow-starting containers
  - JSON responses with status, timestamp, and diagnostic info
  - Kubernetes/Podman orchestration ready

- **Centralized Logging System** (`src/lib/logger.js`)
  - Winston-based structured logging
  - Configurable log levels: error, warn, info, http, debug
  - Environment-driven format switching:
    - Production: JSON format for log aggregators (ELK, Loki, CloudWatch)
    - Development: Colored human-readable output
  - Module-specific loggers with automatic context injection
  - `LOG_LEVEL` environment variable support

- **Comprehensive Test Suite** (`tests/`)
  - Jest testing framework with ES modules support
  - 85+ unit and integration tests
  - Coverage: 84% statements, 70% branches, 89% functions
  - Test files:
    - `utils.test.js` - Cryptographic utilities (26 tests)
    - `db.test.js` - Database operations (22 tests)
    - `logger.test.js` - Logging module (17 tests)
    - `routes.test.js` - Express routes with mocked OIDC (20 tests)
    - `health.test.js` - Health check endpoints (18 tests)

- **Admin UI Injection Script** (`ghost-sso/6.x/custom-start.sh`)
  - Automatically patches Ghost Admin login page at container startup
  - Injects "Login with OIDC (Staff)" button directly on the login form
  - Uses MutationObserver for dynamic injection on SPA navigation
  - Idempotent: skips patching if button already exists

- **Docker/Kubernetes Deployment Support**
  - Volume mount examples for Docker Compose
  - ConfigMap examples for Kubernetes deployments
  - Liveness, Readiness, and Startup probe configurations

### Changed

- **openid-client Migration (v5 → v6)**
  - Migrated from `Issuer.discover()` + `new Client()` to `discovery()` function
  - Replaced `client.callback()` with `authorizationCodeGrant()`
  - Replaced `client.authorizationUrl()` with `buildAuthorizationUrl()`
  - Updated server metadata access via `oidcConfig.serverMetadata()`

- **Project Structure**
  - Health check router moved to `src/routes/health.js`
  - Added `tests/` directory with Jest configuration
  - Added `tests/mocks/` for test utilities

### Developer Experience

- `npm test` - Run all tests
- `npm run test:watch` - Watch mode for development
- `npm run test:coverage` - Generate coverage report
- `npm run dev` - Development mode with debug logging

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

- Prometheus metrics endpoint (`/metrics`)
- Rate limiting middleware
- Ghost 6.x Admin UI injection script

---

[1.1.0]: https://github.com/Astocanthus/ghost-keycloak-bridge/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Astocanthus/ghost-keycloak-bridge/releases/tag/v1.0.0