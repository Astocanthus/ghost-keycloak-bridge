// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// setup.js
// Global test setup and configuration
//
// Purpose:
//   - Sets up environment variables for testing
//   - Configures global mocks and utilities
//   - Silences logger during tests
// ============================================================================

// ---------------------------------------------------------------------------
// ENVIRONMENT SETUP
// ---------------------------------------------------------------------------
// Mock environment variables for testing

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Silence logs during tests

process.env.BLOG_PUBLIC_URL = 'https://blog.example.com';
process.env.GHOST_INTERNAL_URL = 'http://ghost:2368';
process.env.GHOST_ADMIN_API_KEY = 'abc123def456:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'ghost';
process.env.DB_PASSWORD = 'password';
process.env.DB_NAME = 'ghost_test';
process.env.DB_PORT = '3306';

process.env.MEMBER_KEYCLOAK_ISSUER = 'https://keycloak.example.com/realms/members';
process.env.MEMBER_CLIENT_ID = 'ghost-members';
process.env.MEMBER_CLIENT_SECRET = 'member-secret';
process.env.MEMBER_CALLBACK_URL = 'https://blog.example.com/auth/member/callback';

process.env.STAFF_KEYCLOAK_ISSUER = 'https://keycloak.example.com/realms/staff';
process.env.STAFF_CLIENT_ID = 'ghost-staff';
process.env.STAFF_CLIENT_SECRET = 'staff-secret';
process.env.STAFF_CALLBACK_URL = 'https://blog.example.com/auth/admin/callback';

// ---------------------------------------------------------------------------
// GLOBAL ERROR HANDLER
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection in tests:', reason);
});