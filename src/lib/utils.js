import crypto from 'crypto';
import cookieSignature from 'cookie-signature';

export const generateObjectId = () => crypto.randomBytes(12).toString('hex');
export const generateUUID = () => crypto.randomUUID();
export const generateMagicToken = () => crypto.randomBytes(24).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const signGhostCookie = (sessionId, secret) => {
    return `s:${cookieSignature.sign(sessionId, secret)}`;
};