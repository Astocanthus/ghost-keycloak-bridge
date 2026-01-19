// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// routes.test.js
// Integration tests for Express routes (members and staff)
//
// Purpose:
//   - Tests HTTP endpoint behavior with mocked OIDC client (openid-client v6)
//   - Validates redirect URLs and cookie handling
//   - Ensures proper error responses
// ============================================================================

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';

// ---------------------------------------------------------------------------
// MOCKS SETUP
// ---------------------------------------------------------------------------

const mockQuery = jest.fn();

jest.unstable_mockModule('../../src/lib/db.js', () => ({
    query: mockQuery,
    fetchGhostSecret: jest.fn(),
    isStaffEmpty: jest.fn(),
    testConnection: jest.fn()
}));

jest.unstable_mockModule('../../src/lib/utils.js', () => ({
    generateObjectId: jest.fn(() => 'mock-object-id-12345678'),
    generateUUID: jest.fn(() => 'mock-uuid-1234-5678-9abc'),
    generateMagicToken: jest.fn(() => 'mock-magic-token-abc123'),
    generateSessionId: jest.fn(() => 'mock-session-id-xyz789'),
    signGhostCookie: jest.fn((sessionId, secret) => `s:${sessionId}.signature`)
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

// Mock openid-client v6 functions
const mockAuthorizationCodeGrant = jest.fn();
const mockBuildAuthorizationUrl = jest.fn();

jest.unstable_mockModule('openid-client', () => ({
    authorizationCodeGrant: mockAuthorizationCodeGrant,
    buildAuthorizationUrl: mockBuildAuthorizationUrl,
    discovery: jest.fn()
}));

// Mock global fetch
global.fetch = jest.fn();

// ---------------------------------------------------------------------------
// MOCK OIDC CONFIG (openid-client v6 style)
// ---------------------------------------------------------------------------

const createMockOidcConfig = () => ({
    serverMetadata: jest.fn(() => ({
        authorization_endpoint: 'https://keycloak.example.com/realms/test/protocol/openid-connect/auth',
        end_session_endpoint: 'https://keycloak.example.com/realms/test/protocol/openid-connect/logout',
        token_endpoint: 'https://keycloak.example.com/realms/test/protocol/openid-connect/token',
        issuer: 'https://keycloak.example.com/realms/test'
    }))
});

// ---------------------------------------------------------------------------
// TEST SUITE: Member Routes
// ---------------------------------------------------------------------------

describe('Member Routes', () => {
    let app;
    let memberRoutes;
    let mockOidcConfig;

    beforeAll(async () => {
        memberRoutes = (await import('../../src/routes/members.js')).default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockOidcConfig = createMockOidcConfig();

        app = express();
        app.use(cookieParser());
        app.use('/auth/member', memberRoutes(mockOidcConfig));

        // Default fetch mock for Ghost API
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => null },
            text: () => Promise.resolve(JSON.stringify({ members: [] }))
        });

        // Default mock for authorizationCodeGrant
        mockAuthorizationCodeGrant.mockResolvedValue({
            id_token: 'mock-id-token',
            claims: () => ({
                email: 'test@example.com',
                name: 'Test User'
            })
        });
    });

    // ---------------------------------------------------------------------------
    // GET /login
    // ---------------------------------------------------------------------------

    describe('GET /login', () => {
        test('should redirect to Keycloak authorization endpoint', async () => {
            const response = await request(app)
                .get('/auth/member/login')
                .expect(302);

            expect(response.headers.location).toContain('keycloak.example.com');
            expect(mockOidcConfig.serverMetadata).toHaveBeenCalled();
        });

        test('should include required OIDC parameters', async () => {
            const response = await request(app)
                .get('/auth/member/login')
                .expect(302);

            const location = response.headers.location;
            expect(location).toContain('response_type=code');
            expect(location).toContain('scope=openid');
            expect(location).toContain('client_id=');
        });

        test('should redirect to registration for signup action', async () => {
            const response = await request(app)
                .get('/auth/member/login?action=signup')
                .expect(302);

            expect(response.headers.location).toContain('registrations');
        });
    });

    // ---------------------------------------------------------------------------
    // GET /logout
    // ---------------------------------------------------------------------------

    describe('GET /logout', () => {
        test('should redirect to Keycloak end session endpoint', async () => {
            const response = await request(app)
                .get('/auth/member/logout')
                .expect(302);

            expect(response.headers.location).toContain('keycloak.example.com');
            expect(response.headers.location).toContain('logout');
        });

        test('should include post_logout_redirect_uri', async () => {
            const response = await request(app)
                .get('/auth/member/logout')
                .expect(302);

            expect(response.headers.location).toContain('post_logout_redirect_uri');
        });

        test('should include id_token_hint if available', async () => {
            const response = await request(app)
                .get('/auth/member/logout')
                .set('Cookie', 'kc_member_id_token=test-token')
                .expect(302);

            expect(response.headers.location).toContain('id_token_hint=test-token');
        });

        test('should clear cookies on logout', async () => {
            const response = await request(app)
                .get('/auth/member/logout')
                .expect(302);

            const cookies = response.headers['set-cookie'];
            expect(cookies).toBeDefined();
        });
    });

    // ---------------------------------------------------------------------------
    // GET /callback
    // ---------------------------------------------------------------------------

    describe('GET /callback', () => {
        beforeEach(() => {
            // Mock successful token exchange
            mockAuthorizationCodeGrant.mockResolvedValue({
                id_token: 'mock-id-token',
                claims: () => ({
                    email: 'test@example.com',
                    name: 'Test User'
                })
            });

            // Mock Ghost API - member exists
            global.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                headers: { get: () => null },
                text: () => Promise.resolve(JSON.stringify({
                    members: [{ id: 'existing-member-id', email: 'test@example.com' }]
                }))
            });

            // Mock database query for token insertion
            mockQuery.mockResolvedValue({ affectedRows: 1 });
        });

        test('should process OIDC callback with code', async () => {
            const response = await request(app)
                .get('/auth/member/callback?code=auth-code-123')
                .expect(302);

            expect(mockAuthorizationCodeGrant).toHaveBeenCalled();
        });

        test('should redirect to blog with magic token on success', async () => {
            const response = await request(app)
                .get('/auth/member/callback?code=auth-code-123')
                .expect(302);

            expect(response.headers.location).toContain('/members/?token=');
        });

        test('should set id_token cookie', async () => {
            const response = await request(app)
                .get('/auth/member/callback?code=auth-code-123')
                .expect(302);

            const cookies = response.headers['set-cookie'];
            const idTokenCookie = cookies.find(c => c.includes('kc_member_id_token'));
            expect(idTokenCookie).toBeDefined();
        });

        test('should handle OIDC callback errors', async () => {
            mockAuthorizationCodeGrant.mockRejectedValue(new Error('Invalid code'));

            const response = await request(app)
                .get('/auth/member/callback?code=invalid-code')
                .expect(500);

            expect(response.text).toContain('Authentication failed');
        });

        test('should create new member if not exists', async () => {
            // First call: no existing member, second call: for add
            global.fetch
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: { get: () => null },
                    text: () => Promise.resolve(JSON.stringify({ members: [] }))
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    headers: { get: () => null },
                    text: () => Promise.resolve(JSON.stringify({
                        members: [{ id: 'new-member-id', email: 'test@example.com' }]
                    }))
                });

            await request(app)
                .get('/auth/member/callback?code=auth-code-123')
                .expect(302);

            // Should have called POST to create member
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/ghost/api/admin/members/'),
                expect.objectContaining({ method: 'POST' })
            );
        });
    });

    // ---------------------------------------------------------------------------
    // GET /debug
    // ---------------------------------------------------------------------------

    describe('GET /debug', () => {
        test('should return JSON diagnostic information', async () => {
            const response = await request(app)
                .get('/auth/member/debug')
                .expect(200)
                .expect('Content-Type', /json/);

            expect(response.body).toHaveProperty('config');
            expect(response.body).toHaveProperty('tests');
        });

        test('should include configuration details', async () => {
            const response = await request(app)
                .get('/auth/member/debug')
                .expect(200);

            expect(response.body.config).toHaveProperty('blogUrl');
            expect(response.body.config).toHaveProperty('ghostInternalUrl');
        });

        test('should test Ghost API connectivity', async () => {
            const response = await request(app)
                .get('/auth/member/debug')
                .expect(200);

            expect(response.body.tests).toHaveProperty('ghostApi');
        });
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: Staff Routes
// ---------------------------------------------------------------------------

describe('Staff Routes', () => {
    let app;
    let staffRoutes;
    let mockOidcConfig;

    beforeAll(async () => {
        staffRoutes = (await import('../../src/routes/staff.js')).default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockOidcConfig = createMockOidcConfig();

        app = express();
        app.use(cookieParser());
        app.use('/auth/admin', staffRoutes(mockOidcConfig));

        // Mock buildAuthorizationUrl for v6
        mockBuildAuthorizationUrl.mockReturnValue(
            new URL('https://keycloak.example.com/realms/test/protocol/openid-connect/auth?scope=openid&redirect_uri=test')
        );

        // Mock authorizationCodeGrant
        mockAuthorizationCodeGrant.mockResolvedValue({
            id_token: 'mock-id-token',
            claims: () => ({
                email: 'admin@example.com',
                name: 'Admin User'
            })
        });
    });

    // ---------------------------------------------------------------------------
    // GET /login
    // ---------------------------------------------------------------------------

    describe('GET /login', () => {
        test('should redirect to Keycloak authorization endpoint', async () => {
            const response = await request(app)
                .get('/auth/admin/login')
                .expect(302);

            expect(response.headers.location).toContain('keycloak.example.com');
        });

        test('should call buildAuthorizationUrl with correct parameters', async () => {
            await request(app)
                .get('/auth/admin/login')
                .expect(302);

            expect(mockBuildAuthorizationUrl).toHaveBeenCalledWith(
                mockOidcConfig,
                expect.objectContaining({
                    scope: expect.stringContaining('openid')
                })
            );
        });
    });

    // ---------------------------------------------------------------------------
    // GET /callback
    // ---------------------------------------------------------------------------

    describe('GET /callback', () => {
        beforeEach(() => {
            mockAuthorizationCodeGrant.mockResolvedValue({
                id_token: 'mock-id-token',
                claims: () => ({
                    email: 'admin@example.com',
                    name: 'Admin User'
                })
            });

            // Mock user exists in Ghost
            mockQuery
                .mockResolvedValueOnce([{ id: 'user-123' }]) // User lookup
                .mockResolvedValueOnce([{ value: 'admin-session-secret' }]) // Session secret
                .mockResolvedValueOnce({ affectedRows: 1 }); // Session insert
        });

        test('should process OIDC callback', async () => {
            const response = await request(app)
                .get('/auth/admin/callback?code=admin-code-123')
                .expect(302);

            expect(mockAuthorizationCodeGrant).toHaveBeenCalled();
        });

        test('should redirect to Ghost admin on success', async () => {
            const response = await request(app)
                .get('/auth/admin/callback?code=admin-code-123')
                .expect(302);

            expect(response.headers.location).toContain('/ghost/');
        });

        test('should set ghost-admin-api-session cookie', async () => {
            const response = await request(app)
                .get('/auth/admin/callback?code=admin-code-123')
                .expect(302);

            const cookies = response.headers['set-cookie'];
            expect(cookies).toBeDefined();
            const sessionCookie = cookies.find(c => c.includes('ghost-admin-api-session'));
            expect(sessionCookie).toBeDefined();
            expect(sessionCookie).toContain('HttpOnly');
        });

        test('should reject user not in Ghost database', async () => {
            mockQuery.mockReset();
            mockQuery.mockResolvedValueOnce([]); // No user found

            const response = await request(app)
                .get('/auth/admin/callback?code=admin-code-123')
                .expect(302);

            expect(response.headers.location).toContain('error=user_not_found');
        });

        test('should handle missing admin_session_secret', async () => {
            mockQuery.mockReset();
            mockQuery
                .mockResolvedValueOnce([{ id: 'user-123' }]) // User found
                .mockResolvedValueOnce([]); // No session secret

            const response = await request(app)
                .get('/auth/admin/callback?code=admin-code-123')
                .expect(302);

            expect(response.headers.location).toContain('error=fatal_config');
        });

        test('should handle OIDC callback errors', async () => {
            mockAuthorizationCodeGrant.mockRejectedValue(new Error('Token error'));

            const response = await request(app)
                .get('/auth/admin/callback?code=invalid-code')
                .expect(302);

            expect(response.headers.location).toContain('error=fatal');
        });
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: Error Handling
// ---------------------------------------------------------------------------

describe('Error Handling', () => {
    let app;
    let memberRoutes;

    beforeAll(async () => {
        memberRoutes = (await import('../../src/routes/members.js')).default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle Ghost API errors gracefully', async () => {
        const mockOidcConfig = createMockOidcConfig();
        
        mockAuthorizationCodeGrant.mockResolvedValue({
            id_token: 'mock-id-token',
            claims: () => ({ email: 'test@example.com', name: 'Test' })
        });

        global.fetch.mockRejectedValue(new Error('Ghost API unavailable'));

        app = express();
        app.use(cookieParser());
        app.use('/auth/member', memberRoutes(mockOidcConfig));

        const response = await request(app)
            .get('/auth/member/callback?code=valid-code')
            .expect(500);

        expect(response.text).toContain('Authentication failed');
    });
});