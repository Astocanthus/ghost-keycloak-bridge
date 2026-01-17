import express from 'express';
import cookieParser from 'cookie-parser';
import { Issuer } from 'openid-client';
import memberRoutes from './routes/members.js';
import staffRoutes from './routes/staff.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.enable('trust proxy');
app.use(cookieParser());

async function start() {
    // 1. Init Realm Membres (Realm USER)
    const mIssuer = await Issuer.discover(process.env.MEMBER_KEYCLOAK_ISSUER);
    const mClient = new mIssuer.Client({
        client_id: process.env.MEMBER_CLIENT_ID,
        client_secret: process.env.MEMBER_CLIENT_SECRET
    });

    // 2. Init Realm Staff (Realm ADMIN)
    const sIssuer = await Issuer.discover(process.env.STAFF_KEYCLOAK_ISSUER);
    const sClient = new sIssuer.Client({
        client_id: process.env.STAFF_CLIENT_ID,
        client_secret: process.env.STAFF_CLIENT_SECRET
    });

    // 3. Routing
    app.use('/auth/member', memberRoutes(mClient)); 
    app.use('/auth/admin', staffRoutes(sClient));
    
    app.listen(PORT, () => console.log(`✅ Bridge Multi-Realm démarré sur le port ${PORT}`));
}

start();