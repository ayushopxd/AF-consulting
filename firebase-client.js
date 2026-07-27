import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseWebConfig, hasFirebaseWebConfig } from "./firebase-config.js";

if (!hasFirebaseWebConfig()) {
  throw new Error("Firebase Web configuration is incomplete. Set FIREBASE_WEB_* environment variables before deploying Firebase features.");
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseWebConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);
