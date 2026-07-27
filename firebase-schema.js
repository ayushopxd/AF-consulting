export const USER_ROLES = Object.freeze({
  CUSTOMER: "customer",
  ADMIN: "admin"
});

export const PAYMENT_STATUSES = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded"
});

export const ORDER_STATUSES = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
});

export const ORDER_COLLECTION = "orders";
export const USER_COLLECTION = "users";

// These fields are server-controlled. Browser code must never write them directly.
export const ORDER_PROTECTED_FIELDS = Object.freeze([
  "publicOrderId",
  "userId",
  "amount",
  "currency",
  "paymentStatus",
  "razorpay",
  "createdAt",
  "updatedAt",
  "completedAt"
]);

export const RAZORPAY_RECONCILIATION_FIELDS = Object.freeze([
  "orderId",
  "paymentId",
  "signatureVerified",
  "verifiedAt",
  "receipt"
]);

/**
 * users/{uid}
 *
 * name, email, phone, photoURL, role, createdAt, updatedAt
 *
 * orders/{internalDocumentId}
 *
 * publicOrderId, userId, service, plan, amount, currency, customerName, phone,
 * email, paymentStatus, orderStatus, createdAt, updatedAt, completedAt, razorpay
 *
 * `razorpay` is an internal reconciliation object with orderId, paymentId,
 * signatureVerified, verifiedAt, and receipt. It is never displayed in the
 * normal customer/admin UI. All order documents are written by trusted server code.
 */
