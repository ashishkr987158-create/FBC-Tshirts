# FBC T-Shirts — Colour Pop Streetwear

FBC (Fashion By Character) ecommerce starter with a dark neon streetwear visual theme: electric violet, hot pink, aqua, and sunshine accents.

Features: customer signup/login, product browsing, cart, address checkout, UPI payment instructions, payment screenshot upload, owner-only product/order/customer dashboard, and email notification hooks.

## Run locally
- Node.js 18+ and npm required.
- Copy `.env.example` to `.env`.
- Set a unique random `JWT_SECRET` (32+ characters) and a strong `ADMIN_PASSWORD`.
- Run `npm install`, then `npm start`; open `http://localhost:3000`.
- Admin account is initialized from `ADMIN_EMAIL` and `ADMIN_PASSWORD` on first run.

## Important setup before launch
- Set secure production secrets and `BASE_URL`; deploy behind HTTPS.
- Use persistent storage for `fbc-store.sqlite` and `uploads/`.
- Email alerts require SMTP configuration. For Gmail, use a Google App Password, never your normal account password.
- SMS is not activated: add an approved Indian DLT-compliant provider integration in `sendSms()`.
- UPI ID is `8595467640@ptaxis`. Screenshot upload is not payment verification: the owner must independently confirm cleared funds before marking an order verified.
- Review security, backups, privacy/retention, shipping, returns, GST/invoice and legal terms before taking public orders.

Sample products are seeded at first start. Replace product photos and prices in the owner dashboard.
