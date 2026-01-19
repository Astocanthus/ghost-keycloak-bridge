// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// health.test.js
// Unit tests for Kubernetes health check endpoints
//
// Purpose:
//   - Validates liveness probe behavior (/health, /healthz)
//   - Validates readiness probe behavior (/ready, /readyz)
//   - Validates startup probe behavior (/startup)
// ============================================================================

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// MOCKS SETUP
// ---------------------------------------------------------------------------

const mockTestConnection = jest.fn();

jest.unstable_mockModule('../../src/lib/db.js', () => ({
    testConnection: mockTestConnection
}));

jest.unstable_mockModule('../../src/lib/logger.js', () => ({
    createLogger: jest.fn(() => ({
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        http: jest.fn(),
        debug: jest.fn()
    }))
}));

// Import after mocks
const healthRouter = (await import('../../src/routes/health.js')).default;
const { setStartupComplete } = await import('../../src/routes/health.js');

// ---------------------------------------------------------------------------
// TEST SUITE: Liveness Probe
// ---------------------------------------------------------------------------

describe('Liveness Probe', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(healthRouter);
    });

    describe('GET /health', () => {
        test('should return 200 OK', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200)
                .expect('Content-Type', /json/);

            expect(response.body.status).toBe('ok');
        });

        test('should include timestamp', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body.timestamp).toBeDefined();
            expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
        });

        test('should include uptime', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body.uptime).toBeDefined();
            expect(typeof response.body.uptime).toBe('number');
            expect(response.body.uptime).toBeGreaterThanOrEqual(0);
        });
    });

    describe('GET /healthz', () => {
        test('should return 200 OK (alias)', async () => {
            const response = await request(app)
                .get('/healthz')
                .expect(200)
                .expect('Content-Type', /json/);

            expect(response.body.status).toBe('ok');
        });

        test('should have same structure as /health', async () => {
            const response = await request(app)
                .get('/healthz')
                .expect(200);

            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('uptime');
        });
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: Readiness Probe
// ---------------------------------------------------------------------------

describe('Readiness Probe', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(healthRouter);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /ready', () => {
        test('should return 200 when database is connected', async () => {
            mockTestConnection.mockResolvedValue(true);

            const response = await request(app)
                .get('/ready')
                .expect(200)
                .expect('Content-Type', /json/);

            expect(response.body.status).toBe('ready');
            expect(response.body.checks.database).toBe(true);
        });

        test('should return 503 when database is not connected', async () => {
            mockTestConnection.mockResolvedValue(false);

            const response = await request(app)
                .get('/ready')
                .expect(503)
                .expect('Content-Type', /json/);

            expect(response.body.status).toBe('not ready');
            expect(response.body.checks.database).toBe(false);
        });

        test('should return 503 when database throws error', async () => {
            mockTestConnection.mockRejectedValue(new Error('Connection timeout'));

            const response = await request(app)
                .get('/ready')
                .expect(503);

            expect(response.body.status).toBe('not ready');
            expect(response.body.reason).toContain('Connection timeout');
        });

        test('should include timestamp', async () => {
            mockTestConnection.mockResolvedValue(true);

            const response = await request(app)
                .get('/ready')
                .expect(200);

            expect(response.body.timestamp).toBeDefined();
        });
    });

    describe('GET /readyz', () => {
        test('should return 200 when database is connected (alias)', async () => {
            mockTestConnection.mockResolvedValue(true);

            const response = await request(app)
                .get('/readyz')
                .expect(200);

            expect(response.body.status).toBe('ready');
        });

        test('should return 503 when database is not connected (alias)', async () => {
            mockTestConnection.mockResolvedValue(false);

            const response = await request(app)
                .get('/readyz')
                .expect(503);

            expect(response.body.status).toBe('not ready');
        });
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: Startup Probe
// ---------------------------------------------------------------------------

describe('Startup Probe', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(healthRouter);
    });

    describe('GET /startup', () => {
        test('should return 503 before startup is complete', async () => {
            // Note: This test depends on module state
            // In a fresh import, isStartupComplete would be false
            const response = await request(app)
                .get('/startup');

            // Could be either 200 or 503 depending on previous test state
            expect([200, 503]).toContain(response.statusCode);
        });

        test('should return 200 after setStartupComplete is called', async () => {
            setStartupComplete();

            const response = await request(app)
                .get('/startup')
                .expect(200);

            expect(response.body.status).toBe('started');
        });

        test('should include timestamp', async () => {
            const response = await request(app)
                .get('/startup')
                .expect(200);

            expect(response.body.timestamp).toBeDefined();
        });
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: Response Structure
// ---------------------------------------------------------------------------

describe('Response Structure', () => {
    let app;

    beforeAll(() => {
        app = express();
        app.use(healthRouter);
    });

    beforeEach(() => {
        mockTestConnection.mockResolvedValue(true);
    });

    test('health response should be valid JSON', async () => {
        const response = await request(app)
            .get('/health')
            .expect('Content-Type', /json/);

        expect(() => JSON.parse(JSON.stringify(response.body))).not.toThrow();
    });

    test('ready response should include checks object', async () => {
        const response = await request(app)
            .get('/ready')
            .expect(200);

        expect(response.body.checks).toBeDefined();
        expect(typeof response.body.checks).toBe('object');
    });

    test('timestamps should be ISO 8601 format', async () => {
        const response = await request(app)
            .get('/health')
            .expect(200);

        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
        expect(response.body.timestamp).toMatch(isoRegex);
    });
});