// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// logger.mock.js
// Mock logger for unit tests
// ============================================================================

export const mockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    debug: jest.fn()
};

export const createLogger = jest.fn(() => mockLogger);

export default mockLogger;