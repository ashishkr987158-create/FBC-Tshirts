# FBC T-Shirts — custom ecommerce starter

A responsive black-and-white T-shirt storefront with customer signup/login, product browsing, cart, address checkout, UPI payment instructions, payment screenshot upload, owner-only product/order/customer dashboard, and email notification hooks.

## Requirements
- Node.js 18+
- npm

## Run locally
1. Copy `.env.example` to `.env`.
2. Set a long random `JWT_SECRET` (at least 32 characters).
3. Set a strong `ADMIN_PASSWORD` before first start. The admin account is created from `ADMIN_EMAIL` on the first run.
4. `npm install`
5. `npm start`
6. Open `http://localhost:3000`.

Owner login: `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`. Never use the example password in production.

## Email alerts
Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS`. For Gmail, use a Google App Password (not your normal Gmail password) with 2-Step Verification enabled. Owner gets a new-order email; customer gets an order-received email and status-update emails.

## SMS alerts
SMS is not activated in this starter. Connect an approved SMS provider (for example, Twilio or an Indian DLT-compliant SMS provider), register required sender/template details, and implement its SDK in `sendSms()` in `server.js`. Do not send promotional messages without consent.

## Payment verification
The checkout displays UPI ID `8595467640@ptaxis` and provides a UPI deep link plus screenshot upload. Screenshot submission is **not proof of cleared funds**. The owner must independently verify the payment in the UPI/bank account before clicking “VERIFY & CONFIRM”. This project does not automatically verify UPI payments.

## Before public launch
- Deploy behind HTTPS on a trusted host and set `BASE_URL` to the production URL.
- Use a managed persistent disk/volume for `fbc-store.sqlite` and `uploads/`, or move them to managed database/object storage.
- Set secure secrets and a unique admin password; restrict access to the admin account.
- Add backups, privacy/retention policy, CSRF protections appropriate to your hosting setup, stronger validation, image scanning, and monitoring.
- Confirm shipping charges, delivery timelines, return/exchange/refund terms, GST/invoice requirements, and privacy terms with appropriate professional advice.
- Configure real email/SMS providers and test all notifications.
- Use a payment gateway or verified UPI provider integration if you want automated payment confirmation.

## Notes
- Product list is initially seeded with sample products and image URLs. Replace them with your own product photos and prices through the owner dashboard.
- Product images can be supplied as public URLs in this starter. For admin image file uploads, extend the product form to use multipart form data (the API already accepts an image upload).
- Orders are stored with status `pending_verification` until the owner verifies payment.
