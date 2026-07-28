import { createBooking } from "./booking-service.js";
import { firebaseAuth } from "./firebase-client.js";

document.body.classList.add("loading");

const loader = document.querySelector(".loader");
const progress = document.querySelector(".progress");
const cursor = document.querySelector(".cursor");
const revealItems = document.querySelectorAll(".reveal");
const interactive = document.querySelectorAll("a, button, input, select, textarea");

window.addEventListener("load", () => {
  window.setTimeout(() => {
    loader.classList.add("done");
    document.body.classList.remove("loading");
  }, 650);
});

window.addEventListener("scroll", () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
  progress.style.width = `${Math.min(ratio * 100, 100)}%`;
});

if (window.matchMedia("(pointer: fine)").matches) {
  window.addEventListener("mousemove", (event) => {
    cursor.style.opacity = "1";
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
  });

  interactive.forEach((item) => {
    item.addEventListener("mouseenter", () => cursor.classList.add("active"));
    item.addEventListener("mouseleave", () => cursor.classList.remove("active"));
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.14 }
);

revealItems.forEach((item, index) => {
  item.style.transitionDelay = `${Math.min(index % 5, 4) * 70}ms`;
  observer.observe(item);
});

document.querySelectorAll(".faq-item").forEach((item) => {
  item.addEventListener("click", () => {
    item.classList.toggle("open");
  });
});

const planAmounts = {
  "Plan 1 - ₹2499 - 24-48 Hours": 2499,
  "Plan 2 - ₹1499 - Within One Week": 1499,
  "Plan 3 - ₹1299 - Within Three Weeks": 1299,
  "Name Correction - ₹2100": 2100,
  "Match Making - ₹1900": 1900,
  "Reiki Physical Illness - 5 Days - ₹2501": 2501,
  "Reiki Physical Illness - 10 Days - ₹5001": 5001,
  "Reiki Situation Healing - Per Day - ₹501": 501,
  "Auspicious Dates / Muhurat - ₹1001": 1001
};

let pendingBookingId = null;
let pendingPaymentResponse = null;
let bookingSubmissionInFlight = false;

function normalisePhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function formToBooking(form) {
  const data = new FormData(form);
  return {
    name: data.get("name"),
    phone: data.get("phone"),
    alternatePhone: data.get("alternatePhone"),
    email: data.get("email"),
    city: data.get("city"),
    service: data.get("service"),
    plan: data.get("plan"),
    message: data.get("message")
  };
}

async function createBookingOrder(bookingId, user) {
  const response = await fetch("/api/create-booking-order", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ bookingId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to prepare payment.");
  return data;
}

async function verifyBookingPayment(payment, user) {
  const response = await fetch("/api/verify-booking-payment", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payment)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Payment verification failed.");
  return data;
}

function paymentPrefill(user) {
  const prefill = {};
  if (user.displayName) prefill.name = user.displayName;
  if (user.email) prefill.email = user.email;
  if (user.phoneNumber) prefill.contact = user.phoneNumber;
  return prefill;
}

document.querySelector(".booking-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (bookingSubmissionInFlight) return;

  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const note = form.querySelector(".form-note");
  const booking = formToBooking(form);
  const amount = planAmounts[booking.plan];

  if (!amount) {
    note.textContent = "Please select a valid consultation plan before payment.";
    return;
  }

  if (booking.alternatePhone && normalisePhoneNumber(booking.alternatePhone) === normalisePhoneNumber(booking.phone)) {
    note.textContent = "Alternate contact number must be different from the phone number.";
    return;
  }

  if (!firebaseAuth?.currentUser) {
    note.textContent = "Please sign in to continue with your booking.";
    document.querySelector("#account-trigger").click();
    return;
  }

  bookingSubmissionInFlight = true;
  submitButton.disabled = true;
  let checkoutOpened = false;

  try {
    if (!pendingBookingId) {
      note.textContent = "Creating your booking…";
      pendingBookingId = await createBooking({ ...booking, amount });
      form.dataset.bookingId = pendingBookingId;
    }

    if (!window.Razorpay) throw new Error("Payment checkout could not load. Please try again.");

    note.textContent = "Creating secure payment order…";
    const user = firebaseAuth.currentUser;
    const order = await createBookingOrder(pendingBookingId, user);
    note.textContent = "Opening secure payment checkout…";
    let paymentCaptured = false;

    const checkout = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "Ananya's Fusion",
      description: `${booking.service} - ${booking.plan}`,
      prefill: paymentPrefill(user),
      handler: async (payment) => {
        paymentCaptured = true;
        pendingPaymentResponse = {
          bookingId: pendingBookingId,
          razorpay_payment_id: payment.razorpay_payment_id,
          razorpay_order_id: payment.razorpay_order_id,
          razorpay_signature: payment.razorpay_signature
        };
        note.textContent = "Verifying your payment…";
        try {
          await verifyBookingPayment(pendingPaymentResponse, user);
          note.textContent = "Payment confirmed. Your booking has been submitted.";
        } catch (error) {
          bookingSubmissionInFlight = false;
          submitButton.disabled = false;
          note.textContent = error.message || "Payment could not be verified. Please contact support.";
        }
      },
      modal: {
        ondismiss: () => {
          if (paymentCaptured) return;
          bookingSubmissionInFlight = false;
          submitButton.disabled = false;
          note.textContent = "Payment was not completed. You can try again.";
        }
      }
    });

    checkout.on("payment.failed", () => {
      bookingSubmissionInFlight = false;
      submitButton.disabled = false;
      note.textContent = "Payment failed. You can try again.";
    });
    checkout.open();
    checkoutOpened = true;
  } catch (error) {
    note.textContent = error.message || "Unable to create your booking. Please try again.";
  } finally {
    if (!checkoutOpened) {
      bookingSubmissionInFlight = false;
      submitButton.disabled = false;
    }
  }
});
