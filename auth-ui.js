import { getIdTokenResult } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where
} from "firebase/firestore";
import { firestoreDb } from "./firebase-client.js";
import {
  createPhoneRecaptcha,
  friendlyAuthError,
  normaliseIndianPhone,
  observeAuthState,
  sendPhoneOtp,
  signInWithGoogle,
  signOutCustomer
} from "./auth-session.js";

const dialog = document.querySelector("#account-dialog");
const trigger = document.querySelector("#account-trigger");
const triggerLabel = document.querySelector("#account-trigger-label");
const triggerAvatar = document.querySelector("#account-trigger-avatar");
const status = document.querySelector("#auth-status");
const views = document.querySelectorAll("[data-auth-view]");
const googleButton = document.querySelector("#google-sign-in");
const phoneForm = document.querySelector("#phone-sign-in-form");
const phoneInput = document.querySelector("#auth-phone");
const otpForm = document.querySelector("#otp-form");
const otpInput = document.querySelector("#auth-otp");
const resendButton = document.querySelector("#resend-otp");
const changePhoneButton = document.querySelector("#change-phone");
const signOutButton = document.querySelector("#auth-sign-out");
const accountName = document.querySelector("#account-name");
const accountDetails = document.querySelector("#account-details");
const accountAvatar = document.querySelector("#account-avatar");
const recaptchaContainer = document.querySelector("#phone-recaptcha");
const consultationsList = document.querySelector("#account-consultations");
const adminDashboardLink = document.querySelector("#admin-dashboard-link");
let currentUser = null;
let confirmationResult = null;
let recaptchaVerifier = null;
let resendTimer = null;
let resendSeconds = 0;
let phoneRequestInFlight = false;

function setStatus(message = "", kind = "") {
  status.textContent = message;
  status.dataset.kind = kind;
}

function setView(name) {
  views.forEach((view) => {
    view.hidden = view.dataset.authView !== name;
  });
}

function setBusy(button, busy, busyLabel = "") {
  button.disabled = busy;

  if (busy) {
    if (busyLabel) {
      button.textContent = busyLabel;
    }
  } else {
    button.textContent = button.dataset.label || button.textContent;
  }
}

function initials(user) {
  const source = user?.displayName || user?.email || user?.phoneNumber || "A";
  return source.split(/[\s@+]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function setAvatar(element, user) {
  const photo = user?.photoURL || "";
  element.replaceChildren();
  if (photo) {
    const image = document.createElement("img");
    image.src = photo;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.remove();
      element.textContent = initials(user);
    }, { once: true });
    element.append(image);
  } else {
    element.textContent = initials(user);
  }
}

function providerLabel(user) {
  const providers = new Set((user?.providerData || []).map((provider) => provider.providerId));
  if (providers.has("google.com")) return "Google account";
  if (providers.has("phone")) return "Phone number";
  return "Account";
}
function formatBookingDate(value) {
  if (!value) return "—";

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function createBookingDetail(label, value) {
  const item = document.createElement("div");
  item.className = "auth-consultation-detail";

  const heading = document.createElement("span");
  heading.className = "auth-consultation-label";
  heading.textContent = label;

  const content = document.createElement("span");
  content.textContent = value || "—";

  item.append(heading, content);
  return item;
}

async function loadConsultations(user) {
  if (!consultationsList || !firestoreDb || !user) return;

  consultationsList.replaceChildren();

  const loading = document.createElement("p");
  loading.className = "auth-help";
  loading.textContent = "Loading your consultations…";
  consultationsList.append(loading);

  try {
    const bookingsQuery = query(
      collection(firestoreDb, "bookings"),
      where("userId", "==", user.uid)
    );

    const snapshot = await getDocs(bookingsQuery);

    if (currentUser?.uid !== user.uid) return;

    const bookings = snapshot.docs
      .map((document) => ({
        id: document.id,
        ...document.data()
      }))
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

    consultationsList.replaceChildren();

    if (!bookings.length) {
      const empty = document.createElement("p");
      empty.className = "auth-help";
      empty.textContent = "You have no consultations yet.";
      consultationsList.append(empty);
      return;
    }

    bookings.forEach((booking) => {
      const card = document.createElement("article");
      card.className = "auth-consultation-card";

      const header = document.createElement("div");
      header.className = "auth-consultation-card-heading";

      const title = document.createElement("strong");
      title.textContent = booking.service || "Consultation";

      const statusBadge = document.createElement("span");
      statusBadge.className = "auth-consultation-status";
      statusBadge.textContent =
        String(booking.status || "pending")
          .replaceAll("_", " ");

      header.append(title, statusBadge);

      const details = document.createElement("div");
      details.className = "auth-consultation-details";

      details.append(
        createBookingDetail("Plan", booking.plan),
        createBookingDetail("Amount", formatAmount(booking.amount)),
        createBookingDetail(
          "Payment",
          String(booking.paymentStatus || "unpaid").replaceAll("_", " ")
        ),
        createBookingDetail("Booked", formatBookingDate(booking.createdAt))
      );

      if (booking.paidAt) {
        details.append(
          createBookingDetail("Paid", formatBookingDate(booking.paidAt))
        );
      }

      card.append(header, details);
      consultationsList.append(card);
    });
  } catch (error) {
    if (currentUser?.uid !== user.uid) return;

    console.error("Unable to load consultations:", error);

    consultationsList.replaceChildren();

    const message = document.createElement("p");
    message.className = "auth-help";
    message.textContent =
      "We couldn't load your consultations right now. Please try again.";
    consultationsList.append(message);
  }
}

async function updateAdminAccess(user) {
  if (!adminDashboardLink) return;

  adminDashboardLink.hidden = true;

  if (!user) return;

  try {
    const tokenResult = await getIdTokenResult(user);

    if (currentUser?.uid !== user.uid) return;

    adminDashboardLink.hidden = tokenResult.claims.admin !== true;
  } catch (error) {
    console.error("Unable to verify admin access:", error);
    adminDashboardLink.hidden = true;
  }
}
function renderAccount(user) {
  currentUser = user;

  // Firebase auth state is the source of truth.
  // Clear temporary messages/loading states whenever auth state changes.
  setStatus("");

  setBusy(googleButton, false);
  setBusy(signOutButton, false);

  if (!user) {
    adminDashboardLink.hidden = true;
    consultationsList.replaceChildren();
    triggerLabel.textContent = "Sign In";
    trigger.setAttribute("aria-label", "Sign in to your account");
    triggerAvatar.hidden = true;

    clearPhoneState();
    setView("sign-in");
    return;
  }

  const name =
    user.displayName ||
    user.email ||
    user.phoneNumber ||
    "Your account";

  triggerLabel.textContent = "Account";
  trigger.setAttribute("aria-label", "Open your account");
  triggerAvatar.hidden = false;

  setAvatar(triggerAvatar, user);

  accountName.textContent = name;
  accountDetails.replaceChildren();

  [user.email, user.phoneNumber, providerLabel(user)]
    .filter(Boolean)
    .forEach((value) => {
      const detail = document.createElement("p");
      detail.textContent = value;
      accountDetails.append(detail);
    });

  setAvatar(accountAvatar, user);

  clearPhoneState();
setView("account");

loadConsultations(user);
updateAdminAccess(user);
}

function clearResendTimer() {
  window.clearInterval(resendTimer);
  resendTimer = null;
  resendSeconds = 0;
  resendButton.disabled = false;
  resendButton.textContent = resendButton.dataset.label;
}

function startResendCooldown(seconds = 45) {
  clearResendTimer();
  resendSeconds = seconds;
  resendButton.disabled = true;
  resendButton.textContent = `Resend in ${resendSeconds}s`;
  resendTimer = window.setInterval(() => {
    resendSeconds -= 1;
    if (resendSeconds <= 0) {
      clearResendTimer();
      return;
    }
    resendButton.textContent = `Resend in ${resendSeconds}s`;
  }, 1000);
}

function clearPhoneState() {
  confirmationResult = null;
  otpInput.value = "";
  clearResendTimer();
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }
}

function closeDialog() {
  clearPhoneState();
  setStatus("");
  if (dialog.open) dialog.close();
}

function showSignIn() {
  clearPhoneState();
  setStatus("");
  setView("sign-in");
}

async function requestOtp() {
  if (phoneRequestInFlight) return;
  const phoneNumber = normaliseIndianPhone(phoneInput.value);
  if (!phoneNumber) {
    setStatus("Enter a valid 10-digit Indian mobile number.", "error");
    phoneInput.focus();
    return;
  }

  const submit = phoneForm.querySelector('button[type="submit"]');
  phoneRequestInFlight = true;
  resendButton.disabled = true;
  setBusy(submit, true, "Sending OTP…");
  setStatus("Preparing secure verification…");

  try {
    if (!recaptchaVerifier) recaptchaVerifier = createPhoneRecaptcha(recaptchaContainer);
    confirmationResult = await sendPhoneOtp(phoneNumber, recaptchaVerifier);
    setView("otp");
    setStatus(`We sent an OTP to ${phoneNumber}.`, "success");
    startResendCooldown();
    otpInput.focus();
  } catch (error) {
    setStatus(friendlyAuthError(error, "phone"), "error");
    resendButton.disabled = false;
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }
  } finally {
    phoneRequestInFlight = false;
    setBusy(submit, false);
  }
}

async function verifyOtp() {
  const code = otpInput.value.replace(/\D/g, "");

  if (!confirmationResult || code.length < 6) {
    setStatus("Enter the 6-digit OTP sent to your phone.", "error");
    otpInput.focus();
    return;
  }

  const submit = otpForm.querySelector('button[type="submit"]');

  setBusy(submit, true, "Verifying…");
  setStatus("Verifying your phone number…");

  try {
    await confirmationResult.confirm(code);

    // Firebase auth observer handles successful sign-in UI.
  } catch (error) {
    setStatus(friendlyAuthError(error, "phone"), "error");
    setBusy(submit, false);
  }
}

trigger.addEventListener("click", () => {
  if (currentUser) renderAccount(currentUser);
  else showSignIn();
  dialog.showModal();
});

document.querySelector("#account-close").addEventListener("click", closeDialog);
dialog.addEventListener("cancel", () => clearPhoneState());
dialog.addEventListener("close", () => {
  clearPhoneState();
  setStatus("");
});

googleButton.addEventListener("click", async () => {
  setBusy(googleButton, true, "Opening Google…");
  setStatus("Opening secure Google sign-in…");

  try {
    await signInWithGoogle();

    // Do not render or show success here.
    // observeAuthState() will update the UI.
  } catch (error) {
    setStatus(friendlyAuthError(error), "error");
    setBusy(googleButton, false);
  }
});

phoneForm.addEventListener("submit", (event) => {
  event.preventDefault();
  requestOtp();
});

otpForm.addEventListener("submit", (event) => {
  event.preventDefault();
  verifyOtp();
});

resendButton.addEventListener("click", () => requestOtp());
changePhoneButton.addEventListener("click", () => {
  clearPhoneState();
  setView("sign-in");
  setStatus("");
  phoneInput.focus();
});

signOutButton.addEventListener("click", async () => {
  setBusy(signOutButton, true, "Signing out…");
  setStatus("Signing out…");

  try {
    await signOutCustomer();

    // Update immediately after Firebase confirms sign-out.
    renderAccount(null);
  } catch (error) {
    setStatus(friendlyAuthError(error), "error");
    setBusy(signOutButton, false);
  }
});

observeAuthState(
  (user) => renderAccount(user),
  () => {
    renderAccount(null);
    setStatus("Account sign-in is unavailable right now. Please try again shortly.", "error");
  }
);
