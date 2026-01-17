import express from 'express';
import GhostAdminAPI from '@tryghost/admin-api';
import { query } from '../lib/db.js';
import { generateObjectId, generateUUID, generateMagicToken } from '../lib/utils.js';

export default function(oidcClient) {
    const router = express.Router();
    const ghost = new GhostAdminAPI({
        url: process.env.BLOG_PUBLIC_URL,
        key: process.env.GHOST_ADMIN_API_KEY,
        version: 'v5.0'
    });

    // --- LOGIN ---
    router.get('/login', (req, res) => {
        const action = req.query.action;
        let endpoint = oidcClient.issuer.metadata.authorization_endpoint;
        
        const params = new URLSearchParams({
            client_id: oidcClient.metadata.client_id,
            redirect_uri: process.env.MEMBER_CALLBACK_URL,
            response_type: 'code',
            scope: 'openid email profile'
        });

        if (action === 'signup') {
            endpoint = endpoint.replace(/\/auth$/, '/registrations');
        }
        res.redirect(`${endpoint}?${params.toString()}`);
    });

    // --- LOGOUT (Fix pour le 502) ---
    router.get('/logout', (req, res) => {
        // 1. Récupération de l'ID Token stocké au login
        const idToken = req.cookies['kc_member_id_token'];
        
        // 2. Nettoyage des cookies locaux
        res.clearCookie('ghost-members-ssr', { path: '/' });
        res.clearCookie('kc_member_id_token');

        const endSessionEndpoint = oidcClient.issuer.metadata.end_session_endpoint;
        
        if (endSessionEndpoint) {
            const params = new URLSearchParams({
                client_id: oidcClient.metadata.client_id,
                post_logout_redirect_uri: process.env.BLOG_PUBLIC_URL
            });
            
            // On ajoute l'id_token_hint pour éviter la page de confirmation Keycloak
            if (idToken) params.append('id_token_hint', idToken);

            const logoutUrl = `${endSessionEndpoint}?${params.toString()}`;
            return res.redirect(logoutUrl);
        }
        res.redirect(process.env.BLOG_PUBLIC_URL);
    });

    // --- CALLBACK ---
    router.get('/callback', async (req, res) => {
        try {
            const params = oidcClient.callbackParams(req);
            const tokenSet = await oidcClient.callback(process.env.MEMBER_CALLBACK_URL, params);
            
            // ON STOCKE L'ID TOKEN (Nécessaire pour le logout sans confirmation)
            res.cookie('kc_member_id_token', tokenSet.id_token, { 
                httpOnly: true, 
                secure: true, 
                sameSite: 'Lax',
                maxAge: 3600000 
            });

            const userEmail = tokenSet.claims().email;

            let members = await ghost.members.browse({ filter: `email:'${userEmail}'` });
            if (members.length === 0) {
                await ghost.members.add({ email: userEmail, name: tokenSet.claims().name });
            }

            const token = generateMagicToken();
            const now = new Date();
            await query(
                "INSERT INTO tokens (id, token, uuid, data, created_at, updated_at, used_count, otc_used_count) VALUES (?, ?, ?, ?, ?, ?, 0, 0)",
                [generateObjectId(), token, generateUUID(), JSON.stringify({ email: userEmail, type: 'signin' }), now, now]
            );
            res.redirect(`${process.env.BLOG_PUBLIC_URL}/members/?token=${token}`);
        } catch (err) {
            console.error("Callback Error:", err);
            res.status(500).send("Authentication failed");
        }
    });

    return router;
}