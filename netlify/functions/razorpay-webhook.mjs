import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "../lib/firebase-admin.mjs";
import { json } from "../lib/payment.mjs";

class WebhookError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function hasValidWebhookSignature(body, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (!secret) throw new WebhookError("Webhook is not configured.", 500);
  if (!/^[a-f0-9]{64}$/i.test(signature || "")) return false;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export default async function razorpayWebhook(request) {
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("x-razorpay-signature");
  try {
    if (!hasValidWebhookSignature(rawBody, signature)) {
      return json(401, { error: "Invalid webhook signature." });
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    if (event.event !== "payment.captured") return json(200, { ok: true, ignored: true });

    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id;
    const paymentId = payment?.id;
    if (typeof orderId !== "string" || !orderId || typeof paymentId !== "string" || !paymentId) {
      return json(400, { error: "Captured payment is missing order or payment details." });
    }

    const db = getFirebaseAdminFirestore();
    const matches = await db.collection("bookings").where("razorpayOrderId", "==", orderId).limit(2).get();
    if (matches.empty) return json(404, { error: "Booking for this payment order was not found." });
    if (matches.size !== 1) return json(409, { error: "Payment order matches multiple bookings." });

    const bookingRef = matches.docs[0].ref;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(bookingRef);
      const booking = snapshot.data();
      if (!snapshot.exists || booking.razorpayOrderId !== orderId) {
        throw new WebhookError("Payment order does not match this booking.");
      }
      if (booking.paymentStatus === "paid") {
  if (booking.razorpayPaymentId === paymentId) return;
  throw new WebhookError("Booking has a conflicting payment.", 409);
}
      if (booking.paymentStatus !== "unpaid") {
        throw new WebhookError("Booking is not available for payment.");
      }

      transaction.update(bookingRef, {
        paymentStatus: "paid",
        status: "confirmed",
        razorpayPaymentId: paymentId,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    return json(200, { ok: true });
  } catch (error) {
    return json(error.status || 400, { error: error.message || "Unable to process webhook." });
  }
}
