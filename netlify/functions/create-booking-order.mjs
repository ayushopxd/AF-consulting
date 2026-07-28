import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "../lib/firebase-admin.mjs";
import { getPlanAmountInPaise, json, parseBody } from "../lib/payment.mjs";

function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function createRazorpayOrder({ bookingId, amount }) {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keyId || !keySecret) {
    throw new Error("Payment gateway is not configured.");
  }

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt: `booking_${bookingId}`.slice(0, 40),
      notes: { bookingId }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.description || "Unable to create payment order.");
  return { orderId: data.id, keyId };
}

function getBookingAmountInPaise(booking) {
  if (!Number.isFinite(booking.amount) || booking.amount <= 0) return 0;

  const amount = Math.round(booking.amount * 100);
  const planAmount = getPlanAmountInPaise(booking.plan);
  return Number.isSafeInteger(amount) && amount > 0 && amount === planAmount ? amount : 0;
}

export default async function createBookingOrder(request) {
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const token = getBearerToken(request);
  if (!token) return json(401, { error: "Authentication is required." });

  let user;
  try {
    user = await getFirebaseAdminAuth().verifyIdToken(token);
  } catch {
    return json(401, { error: "Authentication is invalid or expired." });
  }

  try {
    const { bookingId } = await parseBody(request);
    if (typeof bookingId !== "string" || !bookingId) {
      return json(400, { error: "A booking ID is required." });
    }

    const db = getFirebaseAdminFirestore();
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnapshot = await bookingRef.get();
    if (!bookingSnapshot.exists) return json(404, { error: "Booking was not found." });

    const booking = bookingSnapshot.data();
    if (booking.userId !== user.uid) return json(403, { error: "You cannot pay for this booking." });
    if (booking.paymentStatus !== "unpaid") return json(400, { error: "This booking is not available for payment." });
    const amount = getBookingAmountInPaise(booking);
    if (!amount) {
      return json(400, { error: "Booking amount is invalid." });
    }

    const keyId = process.env.RAZORPAY_KEY_ID || "";
    if (booking.razorpayOrderId) {
      return json(200, { keyId, orderId: booking.razorpayOrderId, amount, currency: "INR" });
    }

    const order = await createRazorpayOrder({ bookingId, amount });
    const storedOrderId = await db.runTransaction(async (transaction) => {
      const latestSnapshot = await transaction.get(bookingRef);
      if (!latestSnapshot.exists) throw new Error("Booking was not found.");

      const latestBooking = latestSnapshot.data();
      if (latestBooking.userId !== user.uid || latestBooking.paymentStatus !== "unpaid" || getBookingAmountInPaise(latestBooking) !== amount) {
        throw new Error("Booking is no longer available for payment.");
      }
      if (latestBooking.razorpayOrderId) return latestBooking.razorpayOrderId;

      transaction.update(bookingRef, { razorpayOrderId: order.orderId, updatedAt: FieldValue.serverTimestamp() });
      return order.orderId;
    });
    return json(200, { keyId: order.keyId, orderId: storedOrderId, amount, currency: "INR" });
  } catch (error) {
    return json(500, { error: error.message || "Unable to create payment order." });
  }
}
