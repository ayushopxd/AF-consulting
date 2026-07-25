const loginForm = document.querySelector("#bookings-login");
const passwordInput = document.querySelector("#bookings-password");
const loginNote = document.querySelector("#login-note");
const bookingsList = document.querySelector("#bookings-list");
const summary = document.querySelector("#booking-summary");
const actions = document.querySelector(".bookings-actions");
const savedPasswordKey = "ananyas-fusion-bookings-password";

function text(value) {
  return String(value || "—");
}

function bookingCard(savedBooking) {
  const booking = savedBooking.booking || {};
  const payment = savedBooking.payment || {};
  const card = document.createElement("article");
  const createdAt = savedBooking.createdAt ? new Date(savedBooking.createdAt).toLocaleString() : "—";
  const amount = payment.amount ? `₹${(payment.amount / 100).toLocaleString("en-IN")}` : "—";
  const fields = [
    ["Phone", booking.phone], ["Alternate WhatsApp", booking.alternatePhone], ["Email", booking.email], ["City", booking.city],
    ["Service", booking.service], ["Plan", booking.plan], ["Paid", amount], ["Booked", createdAt]
  ];

  card.className = "booking-entry";
  const title = document.createElement("h2");
  title.textContent = text(booking.name);
  card.append(title);
  const details = document.createElement("dl");
  fields.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = text(value);
    details.append(term, detail);
  });
  card.append(details);
  if (booking.message) {
    const message = document.createElement("p");
    message.className = "booking-message";
    message.textContent = booking.message;
    card.append(message);
  }
  return card;
}

async function loadBookings(password) {
  loginNote.textContent = "Loading bookings…";
  const response = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load bookings.");

  sessionStorage.setItem(savedPasswordKey, password);
  loginForm.hidden = true;
  actions.hidden = false;
  bookingsList.hidden = false;
  bookingsList.replaceChildren();
  summary.textContent = `${data.bookings.length} paid booking${data.bookings.length === 1 ? "" : "s"}. Newest first.`;
  if (!data.bookings.length) {
    const empty = document.createElement("p");
    empty.className = "empty-bookings";
    empty.textContent = "No paid bookings yet.";
    bookingsList.append(empty);
  } else {
    data.bookings.forEach((booking) => bookingsList.append(bookingCard(booking)));
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loadBookings(passwordInput.value);
  } catch (error) {
    loginNote.textContent = error.message;
  }
});

document.querySelector("#refresh-bookings").addEventListener("click", () => loadBookings(sessionStorage.getItem(savedPasswordKey)).catch((error) => { loginNote.textContent = error.message; }));
document.querySelector("#sign-out").addEventListener("click", () => {
  sessionStorage.removeItem(savedPasswordKey);
  bookingsList.hidden = true;
  actions.hidden = true;
  loginForm.hidden = false;
  passwordInput.value = "";
  summary.textContent = "Enter the private password to view bookings.";
  loginNote.textContent = "";
});

const savedPassword = sessionStorage.getItem(savedPasswordKey);
if (savedPassword) loadBookings(savedPassword).catch(() => sessionStorage.removeItem(savedPasswordKey));
