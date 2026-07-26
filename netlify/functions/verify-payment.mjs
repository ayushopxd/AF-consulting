import { bookingsStore, json, parseBody, verifySignature } from "../lib/payment.mjs";

export default async function verifyPayment(request) {
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const { payment = {} } = await parseBody(request);
    const store = bookingsStore();
    const pendingData = await store.get(`pending/${payment.razorpay_order_id}`, { consistency: "strong" });
    if (!pendingData) return json(400, { error: "Payment order was not found." });
    if (!verifySignature(payment)) return json(400, { error: "Payment verification failed. Booking was not saved." });

    const pendingOrder = JSON.parse(pendingData);
    const savedBooking = {
      id: `booking_${Date.now()}`,
      status: "paid",
      booking: pendingOrder.booking,
      payment: {
        amount: pendingOrder.amount,
        currency: pendingOrder.currency,
        razorpayOrderId: payment.razorpay_order_id,
        razorpayPaymentId: payment.razorpay_payment_id
      },
      createdAt: new Date().toISOString()
    };
    await store.set(`bookings/${savedBooking.id}`, JSON.stringify(savedBooking));
    await store.delete(`pending/${payment.razorpay_order_id}`);
    return json(200, { ok: true, bookingId: savedBooking.id });
  } catch (error) {
    return json(500, { error: error.message || "Unable to verify payment." });
  }
}
