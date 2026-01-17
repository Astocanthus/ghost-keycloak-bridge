import express from 'express';
import { Issuer } from 'openid-client';
import GhostAdminAPI from '@tryghost/admin-api';
import cookieParser from 'cookie-parser';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const app = express();
app.enable('trust proxy');
app.use(cookieParser());

// CONFIG
const PORT = process.env.PORT || 3000;
const BLOG_URL = (process.env.BLOG_PUBLIC_URL || '').replace(/\/$/, '');
const CALLBACK_URL = process.env.CALLBACK_URL;

const dbConfig = {
    host: process.env.DB_HOST || 'ghost-db',
    user: process.env.DB_USER || 'ghost',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'ghost',
    port: parseInt(process.env.DB_PORT || '3306')
};

const ghost = new GhostAdminAPI({
    url: BLOG_URL,
    key: process.env.GHOST_ADMIN_API_KEY,
    version: 'v5.0'
});

let oidcClient;

const generateObjectId = () => crypto.randomBytes(12).toString('hex');
const generateMagicToken = () => crypto.randomBytes(24).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const generateUUID = () => crypto.randomUUID(); 

async function startServer() {
    console.log("🚀 Démarrage du Bridge (Login + Register + Logout)...");

    try {
        const issuer = await Issuer.discover(process.env.KEYCLOAK_ISSUER);
        oidcClient = new issuer.Client({
            client_id: process.env.KEYCLOAK_ID,
            client_secret: process.env.KEYCLOAK_SECRET,
            redirect_uris: [CALLBACK_URL],
            response_types: ['code']
        });
    } catch (err) { console.error("❌ Erreur OIDC:", err); process.exit(1); }

    // =========================================================================
    // ROUTE 1 : LOGIN / REGISTER
    // =========================================================================
    app.get('/login', (req, res) => {
        const action = req.query.action; 
        
        // 1. Endpoint standard
        let targetEndpoint = oidcClient.issuer.metadata.authorization_endpoint;

        // 2. Bascule vers endpoint inscription si demandé
        if (action === 'signup') {
            console.log("⚡ Mode Signup : Utilisation de l'endpoint direct /registrations");
            targetEndpoint = targetEndpoint.replace(/\/auth$/, '/registrations');
        }

        const params = new URLSearchParams({
            client_id: process.env.KEYCLOAK_ID,
            redirect_uri: CALLBACK_URL,
            response_type: 'code',
            scope: 'openid email profile'
        });

        const finalUrl = `${targetEndpoint}?${params.toString()}`;
        console.log(`🔗 Login Redirect: ${finalUrl}`);
        res.redirect(finalUrl);
    });

    // =========================================================================
    // ROUTE 2 : LOGOUT (NOUVEAU)
    // =========================================================================
    app.get('/logout', (req, res) => {
        console.log("👋 Demande de déconnexion globale (SLO)");

        // 1. On nettoie le cookie Ghost (Tentative locale)
        // Note: Ça ne marche que si le cookie n'est pas HttpOnly ou si on est sur le meme domaine racine
        // Mais ce n'est pas grave car Ghost gère sa propre déconnexion via le front,
        // ici on assure surtout la mort de la session Keycloak.
        res.clearCookie('ghost-members-ssr');

        // 2. On redirige vers Keycloak pour tuer la session SSO
        const endSessionEndpoint = oidcClient.issuer.metadata.end_session_endpoint;
        
        if (endSessionEndpoint) {
            const params = new URLSearchParams({
                client_id: process.env.KEYCLOAK_ID,
                post_logout_redirect_uri: BLOG_URL // Retour à la maison après
            });
            
            const logoutUrl = `${endSessionEndpoint}?${params.toString()}`;
            console.log(`🔗 Logout Redirect: ${logoutUrl}`);
            res.redirect(logoutUrl);
        } else {
            // Fallback si pas de endpoint logout découvert
            res.redirect(BLOG_URL);
        }
    });

    // =========================================================================
    // ROUTE 3 : CALLBACK
    // =========================================================================
    app.get('/callback', async (req, res) => {
        let connection;
        try {
            const params = oidcClient.callbackParams(req);
            const tokenSet = await oidcClient.callback(CALLBACK_URL, params);
            const claims = tokenSet.claims();
            const userEmail = claims.email;
            const ghostLabel = `kc-id-${claims.sub}`;

            let memberId = null;
            let actionType = 'signin'; 

            let members = await ghost.members.browse({ filter: `email:'${userEmail}'` });
            
            if (members.length === 0) {
                console.log(`✨ Inscription : ${userEmail}`);
                actionType = 'signup'; 
                const newMember = await ghost.members.add({ 
                    email: userEmail, 
                    name: claims.name || 'Member', 
                    labels: [{name: ghostLabel}], 
                    subscribed: true 
                });
                memberId = newMember.id;
            } else {
                console.log(`👋 Connexion : ${userEmail}`);
                memberId = members[0].id;
                if (!members[0].labels.find(l => l.name === ghostLabel)) {
                     await ghost.members.edit({ id: memberId, labels: [...members[0].labels, {name: ghostLabel}] });
                }
            }

            connection = await mysql.createConnection(dbConfig);
            const token = generateMagicToken();
            const id = generateObjectId();
            const uuid = generateUUID();
            const now = new Date();
            const tokenData = JSON.stringify({ email: userEmail, type: actionType });

            const sql = `INSERT INTO tokens (id, token, uuid, data, created_at, updated_at, used_count, otc_used_count) VALUES (?, ?, ?, ?, ?, ?, 0, 0)`;
            await connection.execute(sql, [id, token, uuid, tokenData, now, now]);
            
            const magicUrl = `${BLOG_URL}/members/?token=${token}&action=${actionType}`;
            res.redirect(magicUrl);

        } catch (err) {
            console.error("❌ Erreur Auth:", err);
            res.status(500).send("Erreur système.");
        } finally {
            if (connection) await connection.end();
        }
    });

    app.listen(PORT, () => console.log(`✅ Bridge SSO prêt sur ${PORT}`));
}

startServer();