import { observeAuthState } from "./auth-session.js";

const API_URL = "/api/admin-bookings";
const filters = ["All", "Confirmed", "Contacted", "Completed"];
const state = document.querySelector("#admin-state");
const dashboard = document.querySelector("#admin-dashboard");
const summary = document.querySelector("#admin-summary");
const feedback = document.querySelector("#admin-feedback");
const list = document.querySelector("#bookings-list");
const filterBar = document.querySelector("#booking-filters");
const refreshButton = document.querySelector("#refresh-bookings");

let bookings = [];
let activeFilter = "All";
let currentUser = null;

function setState(message, kind = "") {
  state.hidden = !message;
  state.textContent = message;
  state.className = `admin-state ${kind}`;
}

function setFeedback(message = "", kind = "") {
  feedback.textContent = message;
  feedback.className = `admin-feedback ${kind}`;
}

function text(value) {
  return value === undefined || value === null || value === "" ? "—" : String(value);
}

function formatAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₹${amount.toLocaleString("en-IN")}` : "—";
}

function formatDate(value) {
  if (!value) return "—";
  const seconds = value?._seconds ?? value?.seconds;
  const date = seconds !== undefined ? new Date(Number(seconds) * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN");
}

function statusAction(status) {
  return status === "confirmed" ? ["contacted", "Mark contacted"] : status === "contacted" ? ["completed", "Mark completed"] : null;
}

function detail(label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  row.append(term, description);
  return row;
}

function renderFilters() {
  filterBar.replaceChildren();
  filters.forEach((filter) => {
    const button = document.createElement("button");
    const count = filter === "All" ? bookings.length : bookings.filter((booking) => booking.status === filter.toLowerCase()).length;
    button.type = "button";
    button.className = `filter-button${activeFilter === filter ? " active" : ""}`;
    button.textContent = `${filter} (${count})`;
    button.addEventListener("click", () => {
      activeFilter = filter;
      render();
    });
    filterBar.append(button);
  });
}

function render() {
  const visible = activeFilter === "All" ? bookings : bookings.filter((booking) => booking.status === activeFilter.toLowerCase());
  renderFilters();
  list.replaceChildren();
  summary.textContent = `${bookings.length} booking${bookings.length === 1 ? "" : "s"}. Newest first.`;

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "admin-empty";
    empty.textContent = activeFilter === "All" ? "No bookings yet." : `No ${activeFilter.toLowerCase()} bookings.`;
    list.append(empty);
    return;
  }

  visible.forEach((booking) => {
    const card = document.createElement("article");
    card.className = "admin-booking";
    const heading = document.createElement("div");
    heading.className = "booking-card-heading";
    const title = document.createElement("h2");
    title.textContent = text(booking.userName);
    const badges = document.createElement("div");
    badges.className = "booking-badges";
    [booking.status, booking.paymentStatus].forEach((value) => {
      const badge = document.createElement("span");
      badge.className = "booking-badge";
      badge.textContent = text(value);
      badges.append(badge);
    });
    heading.append(title, badges);

    const details = document.createElement("dl");
    details.className = "booking-details";
    [
      ["Email", text(booking.userEmail)], ["Phone", text(booking.userPhone)],
      ["Service", text(booking.service)], ["Plan", text(booking.plan)],
      ["Amount", formatAmount(booking.amount)], ["Created", formatDate(booking.createdAt)],
      ["Paid", formatDate(booking.paidAt)], ["Razorpay payment ID", text(booking.razorpayPaymentId)],
      ["Razorpay order ID", text(booking.razorpayOrderId)]
    ].forEach(([label, value]) => details.append(detail(label, value)));

    card.append(heading, details);
    const action = statusAction(booking.status);
    if (action) {
      const button = document.createElement("button");
      button.className = "button primary booking-action";
      button.type = "button";
      button.textContent = action[1];
      button.addEventListener("click", () => updateStatus(booking.id, action[0], button));
      card.append(button);
    }
    list.append(card);
  });
}

async function loadBookings() {
  if (!currentUser) return;
  setFeedback();
  setState("Loading bookings…");
  dashboard.hidden = true;
  refreshButton.hidden = true;
  try {
    const response = await fetch(API_URL, { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } });
    if (response.status === 401 || response.status === 403) throw Object.assign(new Error("Access Denied"), { denied: true });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to load bookings.");
    bookings = Array.isArray(data.bookings) ? data.bookings : [];
    setState();
    dashboard.hidden = false;
    refreshButton.hidden = false;
    render();
  } catch (error) {
    dashboard.hidden = true;
    setState(error.denied ? "Access Denied. This account is not authorized to view bookings." : error.message || "Unable to load bookings.", "error");
  }
}

async function updateStatus(bookingId, status, button) {
  button.disabled = true;
  setFeedback("Updating booking…");
  try {
    const response = await fetch(API_URL, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${await currentUser.getIdToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to update booking.");
    bookings = bookings.map((booking) => booking.id === bookingId ? { ...booking, status } : booking);
    setFeedback("Booking updated.", "success");
    render();
  } catch (error) {
    button.disabled = false;
    setFeedback(error.message || "Unable to update booking.", "error");
  }
}

refreshButton.addEventListener("click", loadBookings);
setState("Checking access…");
observeAuthState((user) => {
  currentUser = user;
  if (!user) {
    dashboard.hidden = true;
    refreshButton.hidden = true;
    setState("Sign in with an authorized admin account on the home page, then return here.");
    return;
  }
  loadBookings();
}, () => setState("Unable to check account access.", "error"));
