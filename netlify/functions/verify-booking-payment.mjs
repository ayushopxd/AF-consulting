import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminAuth, getFirebaseAdminFirestore } from "../lib/firebase-admin.mjs";
import { json, parseBody } from "../lib/payment.mjs";

class VerificationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function hasRequiredPaymentFields(payment) {
  return Object.values(payment).every((value) => typeof value === "string" && value.length > 0);
}

function hasValidSignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!secret) throw new VerificationError("Payment gateway is not configured.", 500);
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

export default async function verifyBookingPayment(request) {
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
    const body = await parseBody(request);
    const payment = {
      bookingId: body.bookingId,
      paymentId: body.razorpay_payment_id,
      orderId: body.razorpay_order_id,
      signature: body.razorpay_signature
    };
    if (!hasRequiredPaymentFields(payment)) {
      return json(400, { error: "Payment verification details are required." });
    }

    const db = getFirebaseAdminFirestore();
    const bookingRef = db.collection("bookings").doc(payment.bookingId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(bookingRef);
      if (!snapshot.exists) throw new VerificationError("Booking was not found.", 404);

      const booking = snapshot.data();
      if (booking.userId !== user.uid) throw new VerificationError("You cannot verify this booking.", 403);
      if (booking.razorpayOrderId !== payment.orderId) throw new VerificationError("Payment order does not match this booking.");
      if (booking.paymentStatus === "paid") {
        if (booking.razorpayPaymentId === payment.paymentId) return;
        throw new VerificationError("This booking has already been paid.");
      }
      if (booking.paymentStatus !== "unpaid") throw new VerificationError("This booking is not available for payment.");
      if (!hasValidSignature(payment.orderId, payment.paymentId, payment.signature)) {
        throw new VerificationError("Payment verification failed.");
      }

      transaction.update(bookingRef, {
        paymentStatus: "paid",
        status: "confirmed",
        razorpayPaymentId: payment.paymentId,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    return json(200, { ok: true, bookingId: payment.bookingId });
  } catch (error) {
    return json(error.status || 500, { error: error.message || "Unable to verify payment." });
  }
}
