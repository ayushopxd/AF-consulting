const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = __dirname;

function loadEnvFile() {
  const envPath = path.join(root, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);

    if (!match || match[2].startsWith("#") || process.env[match[1]]) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
    process.env[key] = value;
  }
}

loadEnvFile();

const dataDir = path.join(root, "data");
const pendingPath = path.join(dataDir, "pending-orders.json");
const bookingsPath = path.join(dataDir, "bookings.json");
const startPort = Number(process.env.PORT) || 4173;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "";
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || "";
const bookingsPassword = process.env.BOOKINGS_PASSWORD || "";
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

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function sanitizeBooking(booking) {
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

function validateBooking(booking) {
  if (!booking.name || !booking.phone || !booking.email || !booking.service || !booking.plan) {
    return "Please complete all required booking fields.";
  }

  if (!planAmounts[booking.plan]) {
    return "Invalid consultation plan selected.";
  }

  if (booking.alternatePhone && normalisePhoneNumber(booking.alternatePhone) === normalisePhoneNumber(booking.phone)) {
    return "Alternate contact number must be different from the phone number.";
  }

  return "";
}

async function createRazorpayOrder(booking) {
  const amount = planAmounts[booking.plan];
  const receipt = `af_${Date.now()}`.slice(0, 40);
  const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt,
      notes: {
        service: booking.service,
        plan: booking.plan
      }
    })
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.description || "Unable to create payment order.");
  }

  return data;
}

function verifySignature(payment) {
  const generatedSignature = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(`${payment.razorpay_order_id}|${payment.razorpay_payment_id}`)
    .digest("hex");

  return generatedSignature === payment.razorpay_signature;
}

function hasBookingsAccess(suppliedPassword) {
  if (!bookingsPassword || typeof suppliedPassword !== "string") {
    return false;
  }

  const expected = Buffer.from(bookingsPassword);
  const supplied = Buffer.from(suppliedPassword);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

async function handleApi(req, res) {
  if (req.method === "POST" && req.url === "/api/bookings") {
    if (!bookingsPassword) {
      sendJson(res, 503, { error: "Bookings access is not configured. Set BOOKINGS_PASSWORD on the server." });
      return true;
    }

    try {
      const body = await readRequestBody(req);

      if (!hasBookingsAccess(body.password)) {
        sendJson(res, 401, { error: "Incorrect bookings password." });
        return true;
      }

      const bookings = readJsonFile(bookingsPath, []);
      sendJson(res, 200, { bookings: bookings.slice().reverse() });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (req.method === "GET" && req.url === "/api/payment-config") {
    sendJson(res, 200, {
      configured: Boolean(razorpayKeyId && razorpayKeySecret),
      keyId: razorpayKeyId
    });
    return true;
  }

  if (req.method === "POST" && req.url === "/api/create-order") {
    if (!razorpayKeyId || !razorpayKeySecret) {
      sendJson(res, 500, {
        error: "Payment gateway is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before accepting bookings."
      });
      return true;
    }

    try {
      const body = await readRequestBody(req);
      const booking = sanitizeBooking(body.booking);
      const validationError = validateBooking(booking);

      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return true;
      }

      const order = await createRazorpayOrder(booking);
      const pending = readJsonFile(pendingPath, {});
      pending[order.id] = {
        booking,
        amount: order.amount,
        currency: order.currency,
        createdAt: new Date().toISOString()
      };
      writeJsonFile(pendingPath, pending);
      sendJson(res, 200, {
        keyId: razorpayKeyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }

    return true;
  }

  if (req.method === "POST" && req.url === "/api/verify-payment") {
    if (!razorpayKeySecret) {
      sendJson(res, 500, { error: "Payment gateway is not configured." });
      return true;
    }

    try {
      const body = await readRequestBody(req);
      const booking = sanitizeBooking(body.booking);
      const payment = body.payment || {};
      const pending = readJsonFile(pendingPath, {});
      const pendingOrder = pending[payment.razorpay_order_id];

      if (!pendingOrder) {
        sendJson(res, 400, { error: "Payment order was not found." });
        return true;
      }

      if (!verifySignature(payment)) {
        sendJson(res, 400, { error: "Payment verification failed. Booking was not saved." });
        return true;
      }

      const bookings = readJsonFile(bookingsPath, []);
      const savedBooking = {
        id: `booking_${Date.now()}`,
        status: "paid",
        booking,
        payment: {
          amount: pendingOrder.amount,
          currency: pendingOrder.currency,
          razorpayOrderId: payment.razorpay_order_id,
          razorpayPaymentId: payment.razorpay_payment_id
        },
        createdAt: new Date().toISOString()
      };

      bookings.push(savedBooking);
      delete pending[payment.razorpay_order_id];
      writeJsonFile(bookingsPath, bookings);
      writeJsonFile(pendingPath, pending);
      sendJson(res, 200, { ok: true, bookingId: savedBooking.id });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }

    return true;
  }

  return false;
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (decoded === "/auth-ui.js") {
    return path.join(root, "dist", "auth-ui.js");
  }
  const requested = decoded === "/" ? "/index.html" : decoded;
  const filePath = path.normalize(path.join(root, requested));
  return filePath.startsWith(root) ? filePath : null;
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (req.url?.startsWith("/api/")) {
      const handled = await handleApi(req, res);

      if (handled) {
        return;
      }
    }

    const filePath = safePath(req.url || "/");

    if (!filePath) {
      send(res, 403, "Forbidden");
      return;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        send(res, 404, "Not found");
        return;
      }

      send(res, 200, data, types[path.extname(filePath)] || "application/octet-stream");
    });
  });
}

function listen(port) {
  const server = createServer();

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      listen(port + 1);
      return;
    }

    console.error(error);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`Ananya's Fusion dev server running at http://localhost:${port}`);
  });
}

listen(startPort);
