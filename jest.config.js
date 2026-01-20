// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// jest.config.js
// Jest configuration for Ghost Keycloak Bridge test suite
// ============================================================================

export default {
    // Use ES modules
    transform: {},
    
    // Test environment
    testEnvironment: 'node',
    
    // Test file patterns
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.js'
    ],
    
    // Coverage configuration
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/index.js'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },
    
    // Module paths
    moduleFileExtensions: ['js', 'json'],
    
    // Setup files
    setupFilesAfterEnv: ['./tests/setup.js'],
    
    // Timeout
    testTimeout: 10000,
    
    // Verbose output
    verbose: true
};