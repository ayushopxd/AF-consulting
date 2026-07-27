# Firebase foundation setup

This repository uses Firebase through Netlify. It does not use Firebase Hosting.

## Firebase Web configuration (public)

In Firebase Console, open **Project settings** → **General** → **Your apps** → the registered web app → **SDK setup and configuration**. Copy each value from the `firebaseConfig` object into the matching Netlify build environment variable:

```text
apiKey              -> FIREBASE_WEB_API_KEY
authDomain          -> FIREBASE_WEB_AUTH_DOMAIN
projectId           -> FIREBASE_WEB_PROJECT_ID
storageBucket       -> FIREBASE_WEB_STORAGE_BUCKET
messagingSenderId   -> FIREBASE_WEB_MESSAGING_SENDER_ID
appId               -> FIREBASE_WEB_APP_ID
```

These are browser configuration values, not server secrets. They are compiled into `dist/firebase-client.js` during the Netlify build. Do not put them in frontend source files; set them in Netlify instead.

For local feature development, place the same values in an uncommitted `.env` file using the names in `.env.example`.

## Firebase Admin credential (secret)

Future trusted Netlify Functions use `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64` to verify Firebase ID tokens and write protected Firestore data. It is deliberately not used by the browser bundle.

When server-side Firebase features are enabled:

1. In Firebase Console, open **Project settings** → **Service accounts**.
2. Generate a new private key only for the server-side deployment workflow.
3. Base64-encode the complete downloaded JSON file without changing its contents.
4. Add the resulting value to Netlify as `FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64` with secret access.
5. Never commit the JSON, its base64 value, or the private key. Rotate/revoke the key if it is exposed.

## Firestore rules

The source of truth for initial least-privilege rules is `firestore.rules`. They are not deployed automatically in Phase 1. Deploy them before any client Firebase account/order feature is released, using an authenticated Firebase CLI workflow or Firebase Console rules editor.

The rules intentionally allow no browser writes to user or order documents. Trusted server code will own profile, order, payment, and lifecycle writes in later phases.

## Planned Firestore data shape

`users/{uid}` stores the verified account profile: `name`, `email`, `phone`, `photoURL`, `role`, `createdAt`, and `updatedAt`.

`orders/{internalDocumentId}` stores the customer-facing `publicOrderId`, `userId`, service/plan, money fields, customer contact snapshot, separate `paymentStatus` and `orderStatus`, lifecycle timestamps, and a private `razorpay` reconciliation object. Firebase UIDs, Firestore document IDs, and raw Razorpay identifiers are not customer-facing values.
