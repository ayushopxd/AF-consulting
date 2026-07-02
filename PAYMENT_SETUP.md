# Payment Setup

The booking form now uses Razorpay Checkout.

Flow:
1. Client fills the booking form.
2. The backend creates a Razorpay order for the selected plan amount.
3. Razorpay Checkout opens for payment.
4. After successful payment, the frontend sends the payment response to the backend.
5. The backend verifies the Razorpay signature.
6. Only verified paid bookings are stored in `data/bookings.json`.

## Required Environment Variables

Create a local `.env` file or set these variables in your hosting platform:

```bash
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

For local testing from the terminal:

```bash
RAZORPAY_KEY_ID=rzp_test_your_key_id RAZORPAY_KEY_SECRET=your_key_secret npm run dev
```

## Important

Do not expose `RAZORPAY_KEY_SECRET` in frontend code. It must stay on the backend only.

For production, replace local JSON storage with a real database such as Supabase,
Firebase, PostgreSQL, MongoDB, or a hosted backend database.
