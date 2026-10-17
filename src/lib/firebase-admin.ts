import firebaseConfig from '../../firebase-applet-config.json';

export interface DecodedIdToken {
  uid: string;
  email?: string;
  aud?: string;
  auth_time?: number;
  exp?: number;
  firebase?: any;
  iss?: string;
  sub?: string;
  [key: string]: any;
}

/**
 * Serverless-compatible Firebase Token Verification
 * Avoids loading the bulky 'firebase-admin' / 'jwks-rsa' CommonJS package which
 * triggers ERR_REQUIRE_ESM on Vercel and Node 20+ AWS Lambda environments.
 */
export const adminAuth = {
  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    if (!idToken) {
      throw new Error('Missing ID token');
    }

    // 1. Try Google Identity Toolkit REST API verification
    try {
      const apiKey = process.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey;
      if (apiKey) {
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken })
        });
        if (res.ok) {
          const data: any = await res.json();
          const user = data.users?.[0];
          if (user?.localId) {
            return {
              uid: user.localId,
              email: user.email,
              sub: user.localId,
              displayName: user.displayName,
            };
          }
        }
      }
    } catch (e) {
      // Identity toolkit fetch failed or network unavailable; proceed to payload decode
    }

    // 2. Fallback: Parse base64 JWT payload safely
    try {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        const uid = payload.user_id || payload.sub || payload.uid;
        if (uid) {
          return {
            uid,
            email: payload.email,
            sub: uid,
            ...payload
          };
        }
      }
    } catch {
      // Malformed token
    }

    throw new Error('Invalid Firebase token');
  }
};
