// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// utils.test.js
// Unit tests for cryptographic utilities
//
// Purpose:
//   - Validates ID generation functions produce correct formats
//   - Ensures cookie signature compatibility with Ghost
//   - Verifies URL-safe token generation
// ============================================================================

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import cookieSignature from 'cookie-signature';

// ---------------------------------------------------------------------------
// MOCK LOGGER
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/lib/logger.js', () => ({
    createLogger: jest.fn(() => ({
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        http: jest.fn(),
        debug: jest.fn()
    }))
}));

// Import after mock setup
const { 
    generateObjectId, 
    generateUUID, 
    generateMagicToken, 
    generateSessionId,
    signGhostCookie 
} = await import('../../src/lib/utils.js');

// ---------------------------------------------------------------------------
// TEST SUITE: generateObjectId()
// ---------------------------------------------------------------------------

describe('generateObjectId()', () => {
    test('should return a 24-character string', () => {
        const id = generateObjectId();
        expect(id).toHaveLength(24);
    });

    test('should return only hexadecimal characters', () => {
        const id = generateObjectId();
        expect(id).toMatch(/^[a-f0-9]{24}$/);
    });

    test('should generate unique IDs on each call', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
            ids.add(generateObjectId());
        }
        expect(ids.size).toBe(100);
    });

    test('should be compatible with MongoDB ObjectId format', () => {
        const id = generateObjectId();
        expect(Buffer.from(id, 'hex')).toHaveLength(12);
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: generateUUID()
// ---------------------------------------------------------------------------

describe('generateUUID()', () => {
    test('should return a valid UUID v4 format', () => {
        const uuid = generateUUID();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuid).toMatch(uuidRegex);
    });

    test('should have correct length (36 characters with dashes)', () => {
        const uuid = generateUUID();
        expect(uuid).toHaveLength(36);
    });

    test('should generate unique UUIDs on each call', () => {
        const uuids = new Set();
        for (let i = 0; i < 100; i++) {
            uuids.add(generateUUID());
        }
        expect(uuids.size).toBe(100);
    });

    test('should have version 4 indicator in correct position', () => {
        const uuid = generateUUID();
        expect(uuid[14]).toBe('4');
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: generateMagicToken()
// ---------------------------------------------------------------------------

describe('generateMagicToken()', () => {
    test('should return a URL-safe string', () => {
        const token = generateMagicToken();
        expect(token).not.toMatch(/[+/=]/);
    });

    test('should return a 32-character token', () => {
        const token = generateMagicToken();
        expect(token).toHaveLength(32);
    });

    test('should only contain URL-safe base64 characters', () => {
        const token = generateMagicToken();
        expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test('should generate unique tokens on each call', () => {
        const tokens = new Set();
        for (let i = 0; i < 100; i++) {
            tokens.add(generateMagicToken());
        }
        expect(tokens.size).toBe(100);
    });

    test('should be safe for use in URLs', () => {
        const token = generateMagicToken();
        const encoded = encodeURIComponent(token);
        expect(encoded).toBe(token);
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: generateSessionId()
// ---------------------------------------------------------------------------

describe('generateSessionId()', () => {
    test('should return a URL-safe string', () => {
        const sessionId = generateSessionId();
        expect(sessionId).not.toMatch(/[+/=]/);
    });

    test('should return a 32-character session ID', () => {
        const sessionId = generateSessionId();
        expect(sessionId).toHaveLength(32);
    });

    test('should only contain URL-safe base64 characters', () => {
        const sessionId = generateSessionId();
        expect(sessionId).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test('should generate unique session IDs on each call', () => {
        const sessions = new Set();
        for (let i = 0; i < 100; i++) {
            sessions.add(generateSessionId());
        }
        expect(sessions.size).toBe(100);
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: signGhostCookie()
// ---------------------------------------------------------------------------

describe('signGhostCookie()', () => {
    const testSecret = 'test-secret-key-12345';
    const testSessionId = 'test-session-id-abc123';

    test('should return a string starting with "s:"', () => {
        const signed = signGhostCookie(testSessionId, testSecret);
        expect(signed.startsWith('s:')).toBe(true);
    });

    test('should contain the original session ID', () => {
        const signed = signGhostCookie(testSessionId, testSecret);
        expect(signed).toContain(testSessionId);
    });

    test('should have format "s:<sessionId>.<signature>"', () => {
        const signed = signGhostCookie(testSessionId, testSecret);
        const match = signed.match(/^s:(.+)\.([A-Za-z0-9_-]+)$/);
        expect(match).not.toBeNull();
    });

    test('should produce consistent signatures for same input', () => {
        const signed1 = signGhostCookie(testSessionId, testSecret);
        const signed2 = signGhostCookie(testSessionId, testSecret);
        expect(signed1).toBe(signed2);
    });

    test('should produce different signatures for different secrets', () => {
        const signed1 = signGhostCookie(testSessionId, 'secret-1');
        const signed2 = signGhostCookie(testSessionId, 'secret-2');
        expect(signed1).not.toBe(signed2);
    });

    test('should be verifiable with cookie-signature library', () => {
        const signed = signGhostCookie(testSessionId, testSecret);
        const withoutPrefix = signed.slice(2);
        const verified = cookieSignature.unsign(withoutPrefix, testSecret);
        expect(verified).toBe(testSessionId);
    });

    test('should fail verification with wrong secret', () => {
        const signed = signGhostCookie(testSessionId, testSecret);
        const withoutPrefix = signed.slice(2);
        const verified = cookieSignature.unsign(withoutPrefix, 'wrong-secret');
        expect(verified).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: Edge Cases
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
    test('signGhostCookie should handle empty session ID', () => {
        const signed = signGhostCookie('', 'secret');
        expect(signed.startsWith('s:')).toBe(true);
    });

    test('signGhostCookie should handle special characters in session ID', () => {
        const sessionId = 'session-with-special_chars.123';
        const signed = signGhostCookie(sessionId, 'secret');
        expect(signed).toContain(sessionId);
    });
});