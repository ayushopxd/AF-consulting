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
  "Plan 3 - ₹1299 - Within Three Weeks": 1299
};

function formToBooking(form) {
  const data = new FormData(form);
  return {
    name: data.get("name"),
    phone: data.get("phone"),
    email: data.get("email"),
    city: data.get("city"),
    service: data.get("service"),
    plan: data.get("plan"),
    message: data.get("message")
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }

  return data;
}

document.querySelector(".booking-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const note = form.querySelector(".form-note");
  const booking = formToBooking(form);
  const amount = planAmounts[booking.plan];

  if (!amount) {
    note.textContent = "Please select a valid consultation plan before payment.";
    return;
  }

  if (!window.Razorpay) {
    note.textContent = "Payment checkout could not load. Please check your internet connection.";
    return;
  }

  submitButton.disabled = true;
  note.textContent = "Creating secure payment order...";

  try {
    const order = await postJson("/api/create-order", { booking });
    note.textContent = "Opening secure payment checkout...";

    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "Ananya's Fusion",
      description: `${booking.service} - ${booking.plan}`,
      order_id: order.orderId,
      prefill: {
        name: booking.name,
        email: booking.email,
        contact: booking.phone
      },
      notes: {
        service: booking.service,
        plan: booking.plan
      },
      theme: {
        color: "#7c3bd7"
      },
      handler: async (paymentResponse) => {
        note.textContent = "Verifying payment and saving booking...";
        await postJson("/api/verify-payment", {
          booking,
          payment: paymentResponse
        });
        note.textContent =
          "Payment successful. Your booking has been submitted and saved.";
        form.reset();
        submitButton.disabled = false;
      },
      modal: {
        ondismiss: () => {
          note.textContent = "Payment was not completed. Booking has not been submitted.";
          submitButton.disabled = false;
        }
      }
    });

    checkout.open();
  } catch (error) {
    note.textContent = error.message;
    submitButton.disabled = false;
  }
});
