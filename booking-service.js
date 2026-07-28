import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firestoreDb } from "./firebase-client.js";

const BOOKINGS_COLLECTION = "bookings";

/**
 * Creates a pending booking for the currently authenticated Firebase user.
 * `service`, `plan`, and `amount` use the existing booking form's data shape.
 */
export async function createBooking({
  name,
  email,
  phone,
  service,
  plan,
  amount
} = {}) {
  const user = firebaseAuth?.currentUser;

  if (!user) {
    throw new Error("You must be signed in before creating a booking.");
  }

  if (!firestoreDb) {
    throw new Error("Firebase Firestore is unavailable.");
  }

  const booking = await addDoc(collection(firestoreDb, BOOKINGS_COLLECTION), {
    userId: user.uid,
    userName: user.displayName || name || "",
    userEmail: user.email || email || "",
    userPhone: user.phoneNumber || phone || "",
    service,
    plan,
    amount,
    status: "pending_payment",
    paymentStatus: "unpaid",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return booking.id;
}
