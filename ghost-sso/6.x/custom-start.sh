#!/usr/bin/env node

// Author: Benjamin Romeo (Astocanthus)
// Contact: contact@low-layer.com

// ============================================================================
// custom-start.js
// Ghost Admin UI patcher - Injects SSO login button at container startup
//
// Purpose:
//   - Patches Ghost Admin frontend to add "Login with OIDC" button
//   - Enables direct access to Keycloak SSO from the Ghost login screen
//   - Eliminates need for users to manually type the Bridge URL
//
// Key Functions:
//   - findFile(): Recursively searches for Ghost admin index.html
//   - Injects client-side script that creates SSO button dynamically
//   - Launches Ghost process after patching
//
// Characteristics:
//   - Idempotent: checks for existing patch before applying
//   - Non-destructive: only appends to existing HTML
//   - Executes as entrypoint replacement in Ghost container
// ============================================================================

const fs = require('fs');
const path = require('path');

console.log('🛠️  [AUTO-PATCH] Starting Ghost Admin UI patcher...');

// ---------------------------------------------------------------------------
// CLIENT-SIDE INJECTION SCRIPT
// ---------------------------------------------------------------------------
// This script is injected into Ghost's admin index.html and runs in the browser.
// It observes DOM changes and injects the SSO button when the login form appears.

const CLIENT_SCRIPT = `
<script id="ghost-bridge-sso">
(function() {
    function injectSSO() {
        const form = document.querySelector('form[id=login]');
        if (form && !document.getElementById('sso-login-btn')) {
            const btn = document.createElement('a');
            btn.id = 'sso-login-btn';
            btn.href = '/auth/admin/login';
            btn.innerText = 'Login with OIDC (Staff)';
            btn.style.cssText = 'display:block;width:100%;height:48px;margin-top:15px;background:#fff;color:#15171a;border:1px solid #dfe1e5;border-radius:4px;font-size:1.4rem;font-weight:600;text-align:center;line-height:46px;text-decoration:none;cursor:pointer;transition:all .2s;box-shadow:0 1px 2px rgba(0,0,0,.05);';
            btn.onmouseover = () => { btn.style.background = '#f4f5f7'; btn.style.borderColor = '#c5c7cc'; };
            btn.onmouseout = () => { btn.style.background = '#fff'; btn.style.borderColor = '#dfe1e5'; };
            const submit = form.querySelector('button[type=submit]');
            if (submit) submit.parentNode.insertBefore(btn, submit.nextSibling);
            else form.appendChild(btn);
        }
    }
    const observer = new MutationObserver(injectSSO);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('load', injectSSO);
})();
</script>
`;

// ---------------------------------------------------------------------------
// FILE DISCOVERY
// ---------------------------------------------------------------------------
// Recursively searches for the target file in Ghost's version directory.
// Required because 'current' symlink may not exist on first run.

/**
 * Recursively searches for a file ending with the specified suffix.
 * @param {string} startPath - Directory to start searching from
 * @param {string} filter - File path suffix to match (e.g., 'core/built/admin/index.html')
 * @returns {string|undefined} Full path to the found file, or undefined
 */
function findFile(startPath, filter) {
    if (!fs.existsSync(startPath)) {
        return undefined;
    }

    const files = fs.readdirSync(startPath);

    for (const file of files) {
        const filename = path.join(startPath, file);
        const stat = fs.lstatSync(filename);

        if (stat.isDirectory()) {
            const found = findFile(filename, filter);
            if (found) return found;
        } else if (filename.endsWith(filter)) {
            return filename;
        }
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// PATCHING LOGIC
// ---------------------------------------------------------------------------
// Locates Ghost admin index.html and injects the SSO button script.

try {
    const versionsDir = '/var/lib/ghost/versions';
    const adminFile = findFile(versionsDir, 'core/built/admin/index.html');

    if (adminFile) {
        console.log(`✅ Admin file found: ${adminFile}`);

        let content = fs.readFileSync(adminFile, 'utf8');

        // Idempotency check: skip if already patched
        if (!content.includes('ghost-bridge-sso')) {
            const newContent = content.replace('</body>', `${CLIENT_SCRIPT}</body>`);
            fs.writeFileSync(adminFile, newContent);
            console.log('✨ Patch applied successfully!');
        } else {
            console.log('ℹ️  File already patched, skipping.');
        }
    } else {
        console.error('⚠️  Unable to find index.html (Ghost structure may have changed).');
    }

} catch (e) {
    console.error('❌ Error during patching:', e.message);
}

// ---------------------------------------------------------------------------
// GHOST PROCESS LAUNCH
// ---------------------------------------------------------------------------
// Starts the official Ghost process after patching.
// Uses require() to maintain PID 1 for proper signal handling.

console.log('🚀 Launching Ghost...');

try {
    require('/var/lib/ghost/current/index.js');
} catch (e) {
    // Fallback if 'current' symlink doesn't exist yet (first run scenario)
    // The Docker entrypoint will handle this case
    console.log('⚠️  Direct require failed, Ghost will be launched by entrypoint.');
}