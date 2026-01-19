// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// logger.test.js
// Unit tests for centralized logging module
//
// Purpose:
//   - Validates log level configuration
//   - Tests child logger creation
//   - Verifies format selection based on environment
// ============================================================================

import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// TEST SUITE: Logger Module
// ---------------------------------------------------------------------------

describe('Logger Module', () => {
    let originalEnv;

    beforeAll(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = { ...originalEnv };
        jest.resetModules();
    });

    // ---------------------------------------------------------------------------
    // Log Level Configuration
    // ---------------------------------------------------------------------------

    describe('Log Level Configuration', () => {
        test('should default to "debug" in development', async () => {
            process.env.NODE_ENV = 'development';
            delete process.env.LOG_LEVEL;
            jest.resetModules();

            const { default: logger } = await import('../../src/lib/logger.js');
            
            expect(logger.level).toBe('debug');
        });

        test('should default to "info" in production', async () => {
            process.env.NODE_ENV = 'production';
            delete process.env.LOG_LEVEL;
            jest.resetModules();

            const { default: logger } = await import('../../src/lib/logger.js');
            
            expect(logger.level).toBe('info');
        });

        test('should respect LOG_LEVEL environment variable', async () => {
            process.env.LOG_LEVEL = 'warn';
            jest.resetModules();

            const { default: logger } = await import('../../src/lib/logger.js');
            
            expect(logger.level).toBe('warn');
        });
    });

    // ---------------------------------------------------------------------------
    // createLogger Factory
    // ---------------------------------------------------------------------------

    describe('createLogger()', () => {
        test('should create a child logger with module context', async () => {
            jest.resetModules();
            const { createLogger } = await import('../../src/lib/logger.js');

            const log = createLogger('test-module');
            
            expect(log).toBeDefined();
            expect(typeof log.info).toBe('function');
            expect(typeof log.error).toBe('function');
            expect(typeof log.warn).toBe('function');
            expect(typeof log.debug).toBe('function');
            expect(typeof log.http).toBe('function');
        });

        test('should create loggers with different module names', async () => {
            jest.resetModules();
            const { createLogger } = await import('../../src/lib/logger.js');

            const log1 = createLogger('module-a');
            const log2 = createLogger('module-b');
            
            expect(log1).not.toBe(log2);
        });
    });

    // ---------------------------------------------------------------------------
    // Log Methods
    // ---------------------------------------------------------------------------

    describe('Log Methods', () => {
        let logger;

        beforeEach(async () => {
            jest.resetModules();
            process.env.LOG_LEVEL = 'debug';
            const module = await import('../../src/lib/logger.js');
            logger = module.default;
        });

        test('should have error method', () => {
            expect(typeof logger.error).toBe('function');
        });

        test('should have warn method', () => {
            expect(typeof logger.warn).toBe('function');
        });

        test('should have info method', () => {
            expect(typeof logger.info).toBe('function');
        });

        test('should have http method', () => {
            expect(typeof logger.http).toBe('function');
        });

        test('should have debug method', () => {
            expect(typeof logger.debug).toBe('function');
        });

        test('should log messages without throwing', () => {
            expect(() => {
                logger.error('Test error message');
                logger.warn('Test warning message');
                logger.info('Test info message');
                logger.http('Test http message');
                logger.debug('Test debug message');
            }).not.toThrow();
        });

        test('should accept metadata objects', () => {
            expect(() => {
                logger.info('Message with metadata', { key: 'value', count: 42 });
            }).not.toThrow();
        });
    });

    // ---------------------------------------------------------------------------
    // Log Levels Hierarchy
    // ---------------------------------------------------------------------------

    describe('Log Levels Hierarchy', () => {
        test('should define correct level values', async () => {
            jest.resetModules();
            const { default: logger } = await import('../../src/lib/logger.js');

            const levels = logger.levels;
            
            expect(levels.error).toBe(0);
            expect(levels.warn).toBe(1);
            expect(levels.info).toBe(2);
            expect(levels.http).toBe(3);
            expect(levels.debug).toBe(4);
        });

        test('should respect level hierarchy (error is most severe)', async () => {
            jest.resetModules();
            const { default: logger } = await import('../../src/lib/logger.js');

            const levels = logger.levels;
            
            expect(levels.error).toBeLessThan(levels.warn);
            expect(levels.warn).toBeLessThan(levels.info);
            expect(levels.info).toBeLessThan(levels.http);
            expect(levels.http).toBeLessThan(levels.debug);
        });
    });

    // ---------------------------------------------------------------------------
    // Error Handling
    // ---------------------------------------------------------------------------

    describe('Error Handling', () => {
        test('should not exit on handled exceptions', async () => {
            jest.resetModules();
            const { default: logger } = await import('../../src/lib/logger.js');

            expect(logger.exitOnError).toBe(false);
        });

        test('should handle undefined metadata gracefully', async () => {
            jest.resetModules();
            const { default: logger } = await import('../../src/lib/logger.js');

            expect(() => {
                logger.info('Message', undefined);
            }).not.toThrow();
        });

        test('should handle null metadata gracefully', async () => {
            jest.resetModules();
            const { default: logger } = await import('../../src/lib/logger.js');

            expect(() => {
                logger.info('Message', null);
            }).not.toThrow();
        });
    });
});