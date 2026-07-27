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

function renderAccount(user) {
  currentUser = user;

  // Firebase auth state is the source of truth.
  // Clear temporary messages/loading states whenever auth state changes.
  setStatus("");

  setBusy(googleButton, false);
  setBusy(signOutButton, false);

  if (!user) {
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
