const {
  bookingsStore,
  createRazorpayOrder,
  json,
  parseBody,
  sanitizeBooking,
  validateBooking
} = require("../lib/payment");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const body = parseBody(event);
    const booking = sanitizeBooking(body.booking);
    const validationError = validateBooking(booking);
    if (validationError) return json(400, { error: validationError });

    const { order, keyId } = await createRazorpayOrder(booking);
    await bookingsStore().set(`pending/${order.id}`, JSON.stringify({
      booking,
      amount: order.amount,
      currency: order.currency,
      createdAt: new Date().toISOString()
    }));

    return json(200, { keyId, orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (error) {
    return json(500, { error: error.message || "Unable to create payment order." });
  }
};
