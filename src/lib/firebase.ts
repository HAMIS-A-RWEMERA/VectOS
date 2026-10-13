import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import bundledConfig from '../../firebase-applet-config.json';

const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> })?.env : undefined;

const firebaseConfig = {
  apiKey: metaEnv?.VITE_FIREBASE_API_KEY || bundledConfig.apiKey,
  authDomain: metaEnv?.VITE_FIREBASE_AUTH_DOMAIN || bundledConfig.authDomain,
  projectId: metaEnv?.VITE_FIREBASE_PROJECT_ID || bundledConfig.projectId,
  storageBucket: metaEnv?.VITE_FIREBASE_STORAGE_BUCKET || bundledConfig.storageBucket,
  messagingSenderId: metaEnv?.VITE_FIREBASE_MESSAGING_SENDER_ID || bundledConfig.messagingSenderId,
  appId: metaEnv?.VITE_FIREBASE_APP_ID || bundledConfig.appId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleAuthProvider = new GoogleAuthProvider();

export default app;
