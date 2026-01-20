// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// db.test.js
// Unit tests for database connection and query utilities
//
// Purpose:
//   - Validates database query execution with mocked MySQL
//   - Tests Ghost configuration helpers
// ============================================================================

import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// MOCKS SETUP
// ---------------------------------------------------------------------------

const mockExecute = jest.fn();
const mockPool = {
    execute: mockExecute
};

jest.unstable_mockModule('mysql2/promise', () => ({
    default: {
        createPool: jest.fn(() => mockPool)
    }
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

// Import after mock setup
const { query, fetchGhostSecret, isStaffEmpty, testConnection } = await import('../../src/lib/db.js');

// ---------------------------------------------------------------------------
// TEST SETUP
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockReset();
});

// ---------------------------------------------------------------------------
// TEST SUITE: query()
// ---------------------------------------------------------------------------

describe('query()', () => {
    test('should execute SQL with parameters', async () => {
        const mockResults = [{ id: 1, name: 'test' }];
        mockExecute.mockResolvedValueOnce([mockResults, []]);

        const result = await query('SELECT * FROM users WHERE id = ?', [1]);

        expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
        expect(result).toEqual(mockResults);
    });

    test('should execute SQL without parameters', async () => {
        const mockResults = [{ count: 5 }];
        mockExecute.mockResolvedValueOnce([mockResults, []]);

        const result = await query('SELECT COUNT(*) as count FROM users');

        expect(mockExecute).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM users', []);
        expect(result).toEqual(mockResults);
    });

    test('should return empty array for no results', async () => {
        mockExecute.mockResolvedValueOnce([[], []]);

        const result = await query('SELECT * FROM users WHERE id = ?', [999]);

        expect(result).toEqual([]);
    });

    test('should throw error on database failure', async () => {
        const dbError = new Error('Connection refused');
        dbError.code = 'ECONNREFUSED';
        mockExecute.mockRejectedValueOnce(dbError);

        await expect(query('SELECT 1')).rejects.toThrow('Connection refused');
    });

    test('should handle INSERT queries', async () => {
        const insertResult = { affectedRows: 1, insertId: 42 };
        mockExecute.mockResolvedValueOnce([insertResult, []]);

        const result = await query(
            'INSERT INTO users (email, name) VALUES (?, ?)',
            ['test@example.com', 'Test User']
        );

        expect(result.affectedRows).toBe(1);
        expect(result.insertId).toBe(42);
    });

    test('should handle UPDATE queries', async () => {
        const updateResult = { affectedRows: 1, changedRows: 1 };
        mockExecute.mockResolvedValueOnce([updateResult, []]);

        const result = await query(
            'UPDATE users SET name = ? WHERE id = ?',
            ['New Name', 1]
        );

        expect(result.affectedRows).toBe(1);
    });

    test('should handle DELETE queries', async () => {
        const deleteResult = { affectedRows: 3 };
        mockExecute.mockResolvedValueOnce([deleteResult, []]);

        const result = await query('DELETE FROM sessions WHERE user_id = ?', [1]);

        expect(result.affectedRows).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: fetchGhostSecret()
// ---------------------------------------------------------------------------

describe('fetchGhostSecret()', () => {
    test('should return db_hash when found', async () => {
        const mockHash = 'abc123def456';
        mockExecute.mockResolvedValueOnce([[{ value: mockHash }], []]);

        const result = await fetchGhostSecret();

        expect(result).toBe(mockHash);
    });

    test('should return null when db_hash not found', async () => {
        mockExecute.mockResolvedValueOnce([[], []]);

        const result = await fetchGhostSecret();

        expect(result).toBeNull();
    });

    test('should handle database errors gracefully', async () => {
        mockExecute.mockRejectedValueOnce(new Error('Database error'));

        await expect(fetchGhostSecret()).rejects.toThrow('Database error');
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: isStaffEmpty()
// ---------------------------------------------------------------------------

describe('isStaffEmpty()', () => {
    test('should return true when no active users exist', async () => {
        mockExecute.mockResolvedValueOnce([[{ count: 0 }], []]);

        const result = await isStaffEmpty();

        expect(result).toBe(true);
    });

    test('should return false when active users exist', async () => {
        mockExecute.mockResolvedValueOnce([[{ count: 5 }], []]);

        const result = await isStaffEmpty();

        expect(result).toBe(false);
    });

    test('should return false for single active user', async () => {
        mockExecute.mockResolvedValueOnce([[{ count: 1 }], []]);

        const result = await isStaffEmpty();

        expect(result).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: testConnection()
// ---------------------------------------------------------------------------

describe('testConnection()', () => {
    test('should return true on successful connection', async () => {
        mockExecute.mockResolvedValueOnce([[{ 1: 1 }], []]);

        const result = await testConnection();

        expect(result).toBe(true);
    });

    test('should return false on connection failure', async () => {
        mockExecute.mockRejectedValueOnce(new Error('Connection refused'));

        const result = await testConnection();

        expect(result).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: SQL Injection Prevention
// ---------------------------------------------------------------------------

describe('SQL Injection Prevention', () => {
    test('should use parameterized queries for user input', async () => {
        mockExecute.mockResolvedValueOnce([[], []]);

        const maliciousInput = "'; DROP TABLE users; --";
        await query('SELECT * FROM users WHERE email = ?', [maliciousInput]);

        expect(mockExecute).toHaveBeenCalledWith(
            'SELECT * FROM users WHERE email = ?',
            [maliciousInput]
        );
    });
});

// ---------------------------------------------------------------------------
// TEST SUITE: Edge Cases
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
    test('should handle null parameter values', async () => {
        mockExecute.mockResolvedValueOnce([[{ id: 1 }], []]);

        await query('SELECT * FROM users WHERE deleted_at IS ?', [null]);

        expect(mockExecute).toHaveBeenCalledWith(
            'SELECT * FROM users WHERE deleted_at IS ?',
            [null]
        );
    });

    test('should handle empty string parameters', async () => {
        mockExecute.mockResolvedValueOnce([[], []]);

        await query('SELECT * FROM users WHERE name = ?', ['']);

        expect(mockExecute).toHaveBeenCalledWith(
            'SELECT * FROM users WHERE name = ?',
            ['']
        );
    });
});