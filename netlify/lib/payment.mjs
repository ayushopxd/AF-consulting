import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const planAmounts = {
  "Plan 1 - ₹2499 - 24-48 Hours": 249900,
  "Plan 2 - ₹1499 - Within One Week": 149900,
  "Plan 3 - ₹1299 - Within Three Weeks": 129900,
  "Name Correction - ₹2100": 210000,
  "Match Making - ₹1900": 190000,
  "Reiki Physical Illness - 5 Days - ₹2501": 250100,
  "Reiki Physical Illness - 10 Days - ₹5001": 500100,
  "Reiki Situation Healing - Per Day - ₹501": 50100,
  "Auspicious Dates / Muhurat - ₹1001": 100100
};

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON.");
  }
}

export function sanitizeBooking(booking) {
  const clean = {};

  for (const key of ["name", "phone", "alternatePhone", "email", "city", "service", "plan", "message"]) {
    clean[key] = String(booking?.[key] || "").trim().slice(0, 600);
  }

  return clean;
}

function normalisePhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

export function validateBooking(booking) {
  if (!booking.name || !booking.phone || !booking.email || !booking.service || !booking.plan) {
    return "Please complete all required booking fields.";
  }

  if (!planAmounts[booking.plan]) return "Invalid consultation plan selected.";
  if (booking.alternatePhone && normalisePhoneNumber(booking.alternatePhone) === normalisePhoneNumber(booking.phone)) {
    return "Alternate contact number must be different from the phone number.";
  }
  return "";
}

export function bookingsStore() {
  return getStore({ name: "ananyas-fusion-bookings", consistency: "strong" });
}

export async function createRazorpayOrder(booking) {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keyId || !keySecret) {
    throw new Error("Payment gateway is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Netlify environment variables.");
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: planAmounts[booking.plan],
      currency: "INR",
      receipt: `af_${Date.now()}`.slice(0, 40),
      notes: { service: booking.service, plan: booking.plan }
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.description || "Unable to create payment order.");
  return { order: data, keyId };
}

export function verifySignature(payment) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keySecret || !payment?.razorpay_order_id || !payment?.razorpay_payment_id || !payment?.razorpay_signature) return false;

  const expected = crypto.createHmac("sha256", keySecret)
    .update(`${payment.razorpay_order_id}|${payment.razorpay_payment_id}`)
    .digest("hex");
  const supplied = String(payment.razorpay_signature);
  return supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function hasBookingsAccess(password) {
  const expectedPassword = process.env.BOOKINGS_PASSWORD || "";
  if (!expectedPassword || typeof password !== "string") return false;

  const expected = Buffer.from(expectedPassword);
  const supplied = Buffer.from(password);
  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}
