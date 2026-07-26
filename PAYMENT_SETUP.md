# Payment Setup

The booking form now uses Razorpay Checkout.

Flow:
1. Client fills the booking form.
2. The backend creates a Razorpay order for the selected plan amount.
3. Razorpay Checkout opens for payment.
4. After successful payment, the frontend sends the payment response to the backend.
5. The backend verifies the Razorpay signature.
6. Only verified paid bookings are stored securely.

## Required Environment Variables

Create a local `.env` file (it is already excluded from Git) or set these variables in your hosting platform:

```bash
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
BOOKINGS_PASSWORD=choose_a_long_private_password
```

Then start the server:

```bash
npm run dev
```

## Netlify deployment

The site now includes Netlify Functions for payment creation, payment verification,
and the private bookings page. On Netlify, add the same three variables in
**Project configuration → Environment variables**, then trigger a new deploy:

```text
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
BOOKINGS_PASSWORD
```

Verified bookings are stored in Netlify Blobs, so they remain available from
`/bookings.html` on future deploys. The local development server continues to
store its test bookings in `data/bookings.json`.

## Important

Do not expose `RAZORPAY_KEY_SECRET` in frontend code. It must stay on the backend only.

If a key secret was ever pasted into a file, terminal screenshot, chat, or committed to Git, revoke it in Razorpay Dashboard and generate a replacement immediately.

For larger volumes or reporting needs, move the booking data to a database such
as Supabase, Firebase, PostgreSQL, or MongoDB.

## Shared bookings page

After setting `BOOKINGS_PASSWORD`, you and your mom can open
`https://your-domain.com/bookings.html`. Enter that password to view verified,
paid bookings. The password is never included in the link; share it separately.
