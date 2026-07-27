import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseWebConfig, hasFirebaseWebConfig } from "./firebase-config.js";

const firebaseConfigured = hasFirebaseWebConfig();

export const firebaseApp = firebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseWebConfig))
  : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreDb = firebaseApp ? getFirestore(firebaseApp) : null;

export function getFirebaseAuth() {
  if (!firebaseAuth) {
    throw new Error("Firebase Web configuration is incomplete. Set FIREBASE_WEB_* environment variables before using account features.");
  }
  return firebaseAuth;
}
