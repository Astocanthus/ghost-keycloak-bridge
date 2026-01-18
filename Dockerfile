# Author : Benjamin Romeo (Astocanthus)
# Contact : contact@low-layer.com

# ============================================================================
# Dockerfile
# Multi-stage container build for Ghost Keycloak Bridge (Node.js 22 Alpine)
#
# Purpose:
#   - Provides a minimal, secure runtime for the SSO bridge service
#   - Ensures rootless execution for production security compliance
#
# Key Functions:
#   - Installs production dependencies only (--omit=dev)
#   - Configures non-root user 'node' for container hardening
#   - Exposes port 3000 for reverse proxy integration
#
# Characteristics:
#   - Base image: Node.js 22 Alpine (~50MB footprint)
#   - Security: Runs as unprivileged 'node' user (UID 1000)
#   - Entrypoint: src/server.js
# ============================================================================

# ---------------------------------------------------------------------------
# BASE IMAGE
# ---------------------------------------------------------------------------
# Node.js 22 LTS on Alpine Linux for minimal attack surface and image size.

FROM node:22-alpine

# ---------------------------------------------------------------------------
# WORKING DIRECTORY SETUP
# ---------------------------------------------------------------------------
# Creates /app and assigns ownership to non-root user before switching context.

WORKDIR /app

RUN chown -R node:node /app

# ---------------------------------------------------------------------------
# USER CONTEXT SWITCH
# ---------------------------------------------------------------------------
# All subsequent commands run as 'node' (UID 1000) for security hardening.

USER node

# ---------------------------------------------------------------------------
# DEPENDENCY INSTALLATION
# ---------------------------------------------------------------------------
# Copies package manifests first to leverage Docker layer caching.

COPY --chown=node:node package*.json ./

# Production-only install: excludes devDependencies to reduce image size
RUN npm install --omit=dev

# ---------------------------------------------------------------------------
# APPLICATION CODE
# ---------------------------------------------------------------------------
# Copies source code after dependencies to optimize rebuild times.

COPY --chown=node:node . .

# ---------------------------------------------------------------------------
# RUNTIME CONFIGURATION
# ---------------------------------------------------------------------------
# Exposes internal port and defines the container entrypoint.

EXPOSE 3000

CMD ["node", "src/server.js"]