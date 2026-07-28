import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "../lib/firebase-admin.mjs";
import { json, parseBody } from "../lib/payment.mjs";

const ALLOWED_STATUSES = new Set(["confirmed", "contacted", "completed"]);

function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function requireAdmin(request) {
  const token = getBearerToken(request);
  if (!token) return null;

  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token);
    return decodedToken.admin === true ? decodedToken : null;
  } catch {
    return null;
  }
}

export default async function adminBookings(request) {
  if (request.method !== "GET" && request.method !== "PATCH") {
    return json(405, { error: "Method not allowed." });
  }

  if (!await requireAdmin(request)) {
    return json(403, { error: "Admin access is required." });
  }

  const db = getFirebaseAdminFirestore();

  try {
    if (request.method === "GET") {
      const snapshot = await db.collection("bookings").orderBy("createdAt", "desc").get();
      return json(200, { bookings: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
    }

    const { bookingId, status } = await parseBody(request);
    if (typeof bookingId !== "string" || !bookingId || !ALLOWED_STATUSES.has(status)) {
      return json(400, { error: "A booking ID and valid status are required." });
    }

    const bookingRef = db.collection("bookings").doc(bookingId);
    const booking = await bookingRef.get();
    if (!booking.exists) return json(404, { error: "Booking was not found." });

    await bookingRef.update({ status, updatedAt: FieldValue.serverTimestamp() });
    return json(200, { ok: true, bookingId, status });
  } catch (error) {
    return json(500, { error: error.message || "Unable to manage bookings." });
  }
}
