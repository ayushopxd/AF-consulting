import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function readServiceAccount() {
  const encoded = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64;
  if (!encoded) {
    throw new Error("Firebase Admin is not configured. Set FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 in the server environment.");
  }

  try {
    const serviceAccount = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error("missing required service-account fields");
    }
    return serviceAccount;
  } catch (error) {
    throw new Error(`Invalid FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64: ${error.message}`);
  }
}

export function getFirebaseAdminApp() {
  return getApps().length ? getApp() : initializeApp({ credential: cert(readServiceAccount()) });
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore() {
  return getFirestore(getFirebaseAdminApp());
}
