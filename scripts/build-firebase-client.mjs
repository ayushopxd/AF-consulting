import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

const webConfigKeys = [
  "FIREBASE_WEB_API_KEY",
  "FIREBASE_WEB_AUTH_DOMAIN",
  "FIREBASE_WEB_PROJECT_ID",
  "FIREBASE_WEB_STORAGE_BUCKET",
  "FIREBASE_WEB_MESSAGING_SENDER_ID",
  "FIREBASE_WEB_APP_ID"
];

const define = Object.fromEntries(
  webConfigKeys.map((key) => [`process.env.${key}`, JSON.stringify(process.env[key] || "")])
);

await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["firebase-client.js", "auth-ui.js", "booking-service.js", "script.js", "admin-bookings.js"],
  outdir: "dist",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  define,
  legalComments: "none"
});
