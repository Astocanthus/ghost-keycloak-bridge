// Copyright (C) - LOW-LAYER
// Contact : contact@low-layer.com

// ============================================================================
// health.js
// Health check endpoints for Kubernetes/Podman orchestration
//
// Purpose:
//   - Provides liveness probe endpoint (/health)
//   - Provides readiness probe endpoint (/ready)
//   - Enables graceful container orchestration
//
// Key Functions:
//   - GET /health: Returns 200 if process is running (liveness)
//   - GET /ready: Returns 200 if dependencies are available (readiness)
//
// Characteristics:
//   - Liveness: Simple process check, always returns 200 if reachable
//   - Readiness: Validates database connectivity before returning 200
//   - JSON responses with status details for debugging
// ============================================================================

import express from 'express';
import { testConnection } from '../lib/db.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('health');

// ---------------------------------------------------------------------------
// HEALTH CHECK ROUTER
// ---------------------------------------------------------------------------

const router = express.Router();

// ---------------------------------------------------------------------------
// LIVENESS PROBE - /health
// ---------------------------------------------------------------------------
// Kubernetes uses this to determine if the container should be restarted.
// Returns 200 as long as the Node.js process is running.

router.get('/health', (req, res) => {
    log.debug('Liveness check called');
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Alias for /healthz (common Kubernetes convention)
router.get('/healthz', (req, res) => {
    log.debug('Liveness check called (alias)');
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ---------------------------------------------------------------------------
// READINESS PROBE - /ready
// ---------------------------------------------------------------------------
// Kubernetes uses this to determine if the pod should receive traffic.
// Returns 200 only if all dependencies (database) are available.

router.get('/ready', async (req, res) => {
    log.debug('Readiness check called');
    const checks = { database: false };

    try {
        // Check database connectivity
        checks.database = await testConnection();

        if (checks.database) {
            log.debug('Readiness check passed', { checks });
            res.status(200).json({
                status: 'ready',
                timestamp: new Date().toISOString(),
                checks
            });
        } else {
            log.warn('Readiness check failed: database unavailable');
            res.status(503).json({
                status: 'not ready',
                timestamp: new Date().toISOString(),
                checks,
                reason: 'Database connection failed'
            });
        }
    } catch (err) {
        log.error('Readiness check error', { error: err.message });
        res.status(503).json({
            status: 'not ready',
            timestamp: new Date().toISOString(),
            checks,
            reason: err.message
        });
    }
});

// Alias for /readyz (common Kubernetes convention)
router.get('/readyz', async (req, res) => {
    log.debug('Readiness check called (alias)');
    const checks = { database: false };

    try {
        checks.database = await testConnection();

        if (checks.database) {
            log.debug('Readiness check passed', { checks });
            res.status(200).json({
                status: 'ready',
                timestamp: new Date().toISOString(),
                checks
            });
        } else {
            log.warn('Readiness check failed: database unavailable');
            res.status(503).json({
                status: 'not ready',
                timestamp: new Date().toISOString(),
                checks,
                reason: 'Database connection failed'
            });
        }
    } catch (err) {
        log.error('Readiness check error', { error: err.message });
        res.status(503).json({
            status: 'not ready',
            timestamp: new Date().toISOString(),
            checks,
            reason: err.message
        });
    }
});

// ---------------------------------------------------------------------------
// STARTUP PROBE - /startup
// ---------------------------------------------------------------------------
// Optional: Kubernetes uses this for slow-starting containers.
// Returns 200 once initial setup is complete.

let isStartupComplete = false;

export const setStartupComplete = () => {
    isStartupComplete = true;
    log.info('Startup marked as complete');
};

router.get('/startup', (req, res) => {
    log.debug('Startup check called', { isComplete: isStartupComplete });
    
    if (isStartupComplete) {
        res.status(200).json({
            status: 'started',
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({
            status: 'starting',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;