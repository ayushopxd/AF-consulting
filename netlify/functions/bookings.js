const { bookingsStore, hasBookingsAccess, json, parseBody } = require("../lib/payment");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (!process.env.BOOKINGS_PASSWORD) return json(503, { error: "Bookings access is not configured." });

  try {
    const { password } = parseBody(event);
    if (!hasBookingsAccess(password)) return json(401, { error: "Incorrect bookings password." });

    const store = bookingsStore();
    const { blobs } = await store.list({ prefix: "bookings/" });
    const records = await Promise.all(blobs.map(async ({ key }) => {
      const data = await store.get(key, { consistency: "strong" });
      return data ? JSON.parse(data) : null;
    }));
    const bookings = records.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json(200, { bookings });
  } catch (error) {
    return json(500, { error: error.message || "Unable to load bookings." });
  }
};
