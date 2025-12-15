import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";

export type GCSFile = ReturnType<ReturnType<typeof adminStorage.bucket>["file"]>;

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