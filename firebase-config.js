// Values are replaced at build time from FIREBASE_WEB_* environment variables.
// Firebase Web configuration identifies the project; it is not a server secret.
export const firebaseWebConfig = Object.freeze({
  apiKey: process.env.FIREBASE_WEB_API_KEY || "",
  authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN || "",
  projectId: process.env.FIREBASE_WEB_PROJECT_ID || "",
  storageBucket: process.env.FIREBASE_WEB_STORAGE_BUCKET || "",
  messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || "",
  appId: process.env.FIREBASE_WEB_APP_ID || ""
});

export function hasFirebaseWebConfig(config = firebaseWebConfig) {
  return ["apiKey", "authDomain", "projectId", "appId"].every((key) => Boolean(config[key]));
}
