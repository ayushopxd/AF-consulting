import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase-client.js";

let persistencePromise;

async function getPersistentAuth() {
  const auth = getFirebaseAuth();
  persistencePromise ||= setPersistence(auth, browserLocalPersistence);
  await persistencePromise;
  return auth;
}

export function observeAuthState(onChange, onError) {
  let unsubscribe = () => {};

  getPersistentAuth()
    .then((auth) => {
      unsubscribe = onAuthStateChanged(auth, onChange, onError);
    })
    .catch(onError);

  return () => unsubscribe();
}

export async function signInWithGoogle() {
  try {
    const auth = await getPersistentAuth();

    console.log("Firebase Auth diagnostic:", {
      authDomain: auth.app.options.authDomain,
      projectId: auth.app.options.projectId,
      currentDomain: window.location.hostname
    });

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    return await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("GOOGLE AUTH FAILED:", {
      code: error?.code,
      message: error?.message,
      name: error?.name
    });

    throw error;
  }
}

export function createPhoneRecaptcha(container) {
  return new RecaptchaVerifier(getFirebaseAuth(), container, {
    size: "invisible"
  });
}

export async function sendPhoneOtp(phoneNumber, verifier) {
  const auth = await getPersistentAuth();
  return signInWithPhoneNumber(auth, phoneNumber, verifier);
}

export async function signOutCustomer() {
  const auth = await getPersistentAuth();
  await signOut(auth);
}

export function normaliseIndianPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return "";
  }
  return `+91${digits}`;
}

export function friendlyAuthError(error, action = "signIn") {
  const code = error?.code || "";
  const messages = {
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Another sign-in window is already open. Please complete or close it first.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Please allow pop-ups and try again.",
    "auth/network-request-failed": "We could not reach the sign-in service. Please check your connection and try again.",
    "auth/account-exists-with-different-credential": "Please use the sign-in method you used previously, then link another method later from your account.",
    "auth/credential-already-in-use": "This sign-in method is already linked to another account.",
    "auth/invalid-phone-number": "Enter a valid 10-digit Indian mobile number.",
    "auth/too-many-requests": "Too many attempts were made. Please wait a little while before trying again.",
    "auth/quota-exceeded": "SMS sign-in is temporarily unavailable. Please try again later or use Google.",
    "auth/invalid-verification-code": "That OTP is not correct. Please check it and try again.",
    "auth/code-expired": "This OTP has expired. Request a new one and try again.",
    "auth/session-expired": "This verification session has expired. Request a new OTP and try again.",
    "auth/missing-verification-code": "Enter the OTP sent to your phone."
  };

  return messages[code] || (action === "phone"
    ? "We could not verify this phone number right now. Please try again shortly."
    : "We could not complete sign-in right now. Please try again shortly.");
}
