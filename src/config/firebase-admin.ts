import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";

const isDevelopment = process.env.NODE_ENV === 'development';
const useEmulator = process.env.USE_FIREBASE_EMULATOR === 'true';

// 에뮬레이터 연결
if (isDevelopment && useEmulator) {
  // process.env.STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);

const adminApp = !getApps().length
  ? initializeApp({ 
      credential: cert(serviceAccount),
      storageBucket: 'quiz-whiz-hqbig',
    })
  : getApp();

export const adminFirestore = getFirestore(adminApp, "quizgen-db");
export const adminStorage = getStorage(adminApp);
export const bucket = adminStorage.bucket('quiz-whiz-hqbig');

export type GCSFile = ReturnType<ReturnType<typeof adminStorage.bucket>["file"]>;