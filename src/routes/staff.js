import express from 'express';
import { query, fetchGhostSecret, isStaffEmpty } from '../lib/db.js';
import { generateObjectId, signGhostCookie } from '../lib/utils.js';

export default function(oidcClient) {
    const router = express.Router();

    router.get('/login', async (req, res) => {
        // CAS EXCEPTIONNEL : Si aucun admin n'existe encore
        if (await isStaffEmpty()) {
            console.log("🐣 Mode Bootstrap : Aucun admin détecté, redirection vers le login Ghost natif.");
            return res.redirect(`${process.env.BLOG_PUBLIC_URL}/ghost/#/signin`);
        }

        const url = oidcClient.authorizationUrl({
            scope: 'openid email profile',
            redirect_uri: process.env.STAFF_CALLBACK_URL
        });
        res.redirect(url);
    });

    router.get('/callback', async (req, res) => {
        try {
            const params = oidcClient.callbackParams(req);
            const tokenSet = await oidcClient.callback(process.env.STAFF_CALLBACK_URL, params);
            const email = tokenSet.claims().email;

            const rows = await query("SELECT id FROM users WHERE email = ? AND status = 'active'", [email]);
            
            if (rows.length === 0) {
                return res.status(403).send("Accès Admin Refusé : Aucun compte actif trouvé pour cet email.");
            }

            const sessionId = generateObjectId();
            const sessionData = JSON.stringify({
                cookie: { originalMaxAge: 15552000000, expires: new Date(Date.now() + 15552000000).toISOString(), secure: true, httpOnly: true, path: "/" }
            });

            await query("INSERT INTO sessions (id, session_id, user_id, session_data) VALUES (?, ?, ?, ?)", 
                [generateObjectId(), sessionId, rows[0].id, sessionData]);

            const dbHash = await fetchGhostSecret();
            res.cookie('ghost-admin-api-session', signGhostCookie(sessionId, dbHash), {
                httpOnly: true, secure: true, path: '/ghost', maxAge: 15552000000
            });

            res.redirect(`${process.env.BLOG_PUBLIC_URL}/ghost/`);
        } catch (err) {
            console.error(err);
            res.status(500).send("Erreur lors de l'authentification Staff.");
        }
    });

    return router;
}