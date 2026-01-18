#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("🛠️ [AUTO-PATCH] Démarrage du patcher de l'Admin UI...");

// 1. Définition du script client à injecter
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

// 2. Recherche du fichier index.html
// On cherche récursivement dans le dossier des versions car 'current' peut ne pas être encore lié
function findFile(startPath, filter) {
    if (!fs.existsSync(startPath)) return;
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
}

try {
    // On cherche dans /var/lib/ghost/versions (là où l'image stocke le code)
    // On cherche "core/built/admin/index.html"
    const versionsDir = '/var/lib/ghost/versions';
    const adminFile = findFile(versionsDir, 'core/built/admin/index.html');

    if (adminFile) {
        console.log(`✅ Fichier Admin trouvé : ${adminFile}`);
        let content = fs.readFileSync(adminFile, 'utf8');

        if (!content.includes('ghost-bridge-sso')) {
            // Injection propre juste avant la fin du body
            const newContent = content.replace('</body>', `${CLIENT_SCRIPT}</body>`);
            fs.writeFileSync(adminFile, newContent);
            console.log("✨ Patch appliqué avec succès !");
        } else {
            console.log("ℹ️ Fichier déjà patché.");
        }
    } else {
        console.error("⚠️ Impossible de trouver index.html (Ghost a peut-être changé sa structure).");
    }

} catch (e) {
    console.error("❌ Erreur pendant le patch :", e.message);
}

console.log("🚀 Lancement de Ghost...");
// 3. Lancement du processus Ghost officiel
// On remplace le processus actuel par Ghost pour gérer les signaux (PID 1)
try {
    require('/var/lib/ghost/current/index.js');
} catch (e) {
    // Fallback si 'current' n'est pas encore lié (premier run), on laisse l'entrypoint gérer
    // Note: L'entrypoint Docker de Ghost lance normalement "node current/index.js"
    // Ici, nous sommes déjà dans l'exécution de node.
    console.log("Lancement via require direct échoué, tentative standard...");
}