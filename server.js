require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET to a random secret of at least 32 characters in .env');
  process.exit(1);
}
const db = new Database('fbc-store.sqlite');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', price INTEGER NOT NULL, image TEXT DEFAULT '', sizes TEXT DEFAULT '["S","M","L","XL","XXL"]', category TEXT DEFAULT 'Graphic Tees', active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, items_json TEXT NOT NULL, total INTEGER NOT NULL, address_json TEXT NOT NULL, payment_screenshot TEXT, payment_status TEXT DEFAULT 'pending_verification', order_status TEXT DEFAULT 'received', created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id));
`);
// Ensure the explicitly configured owner account is an admin on every startup.
// This also upgrades an account that was previously created as a customer.
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const ownerEmail = process.env.ADMIN_EMAIL.trim().toLowerCase();
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  const existingOwner = db.prepare('SELECT id FROM users WHERE email = ?').get(ownerEmail);
  if (existingOwner) {
    db.prepare("UPDATE users SET name = ?, phone = ?, password_hash = ?, role = 'admin' WHERE id = ?")
      .run(process.env.ADMIN_NAME || 'FBC Owner', process.env.ADMIN_PHONE || '', hash, existingOwner.id);
  } else {
    db.prepare("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?, 'admin')")
      .run(process.env.ADMIN_NAME || 'FBC Owner', ownerEmail, process.env.ADMIN_PHONE || '', hash);
  }
}
if (!db.prepare('SELECT COUNT(*) AS n FROM products').get().n) {
  const seed = db.prepare('INSERT INTO products(name,description,price,image,category) VALUES(?,?,?,?,?)');
  [
    ['FBC Essential Black Tee','Premium everyday cotton fit.',799,'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=900','Essentials'],
    ['Character White Tee','Clean white tee with a bold identity.',799,'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=900','Essentials'],
    ['Midnight Graphic Tee','Statement streetwear graphic.',999,'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=900','Graphic Tees'],
    ['Monochrome Oversized Tee','Relaxed oversized streetwear fit.',1099,'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=900','Oversized'],
    ['FBC Classic Logo Tee','Minimal logo. Maximum character.',899,'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=900','Essentials'],
    ['After Hours Tee','A premium black graphic staple.',999,'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=900','Graphic Tees']
  ].forEach(p => seed.run(...p));
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      upgradeInsecureRequests: []
    }
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 250 }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => ['image/jpeg','image/png','image/webp'].includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG or WEBP photos are allowed.')) });
function tokenFor(user) { return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Please login to continue.' }); }
}
function admin(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Owner access only.' }); next(); }
function mailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: process.env.SMTP_SECURE !== 'false', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
}
async function sendEmail(to, subject, text) {
  const transport = mailer(); if (!transport || !to) return false;
  try { await transport.sendMail({ from: `FBC T-Shirts <${process.env.SMTP_USER}>`, to, subject, text }); return true; }
  catch (e) { console.error('Email notification failed:', e.message); return false; }
}
async function sendSms(_to, _message) {
  // Hook point for a compliant SMS provider. Configure Twilio or another provider before enabling SMS.
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
    console.log('SMS provider credentials found; add your approved provider SDK integration here.');
  }
}

app.get('/api/config', (_req, res) => res.json({ upiId: process.env.UPI_ID || '8595467640@ptaxis', payeeName: process.env.UPI_PAYEE_NAME || 'FBC T-Shirts' }));
app.get('/api/products', (_req, res) => res.json(db.prepare('SELECT id,name,description,price,image,sizes,category FROM products WHERE active=1 ORDER BY id DESC').all().map(p => ({...p, sizes: JSON.parse(p.sizes)}))));
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !phone || !password || password.length < 8) return res.status(400).json({ error: 'Enter all details. Password must be at least 8 characters.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users(name,email,phone,password_hash) VALUES(?,?,?,?)').run(name.trim(), email.trim().toLowerCase(), phone.trim(), hash);
    const user = db.prepare('SELECT id,name,email,phone,role FROM users WHERE id=?').get(result.lastInsertRowid);
    res.json({ token: tokenFor(user), user });
  } catch { res.status(409).json({ error: 'This email is already registered.' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });
  const safe = { id:user.id, name:user.name, email:user.email, phone:user.phone, role:user.role };
  res.json({ token: tokenFor(safe), user: safe });
});
app.get('/api/me', auth, (req,res) => res.json(db.prepare('SELECT id,name,email,phone,role FROM users WHERE id=?').get(req.user.id)));
app.post('/api/orders', auth, upload.single('screenshot'), async (req, res) => {
  const { items, address } = req.body || {};
  let cart; let addr;
  try { cart = JSON.parse(items); addr = JSON.parse(address); } catch { return res.status(400).json({error:'Invalid order details.'}); }
  if (!Array.isArray(cart) || !cart.length || !req.file) return res.status(400).json({error:'Add items and upload your payment screenshot.'});
  if (!addr.fullName || !addr.phone || !addr.street || !addr.city || !addr.state || !addr.pin) return res.status(400).json({error:'Complete your delivery address.'});
  let total = 0; const verifiedItems = [];
  for (const item of cart) {
    const product = db.prepare('SELECT id,name,price FROM products WHERE id=? AND active=1').get(Number(item.id));
    const qty = Math.max(1, Math.min(10, Number(item.qty) || 1));
    if (!product) return res.status(400).json({error:'A product in your cart is unavailable.'});
    total += product.price * qty; verifiedItems.push({id:product.id,name:product.name,price:product.price,size:String(item.size || 'M'),qty});
  }
  const screenshot = `/uploads/${req.file.filename}`;
  const result = db.prepare('INSERT INTO orders(user_id,items_json,total,address_json,payment_screenshot) VALUES(?,?,?,?,?)').run(req.user.id, JSON.stringify(verifiedItems), total, JSON.stringify(addr), screenshot);
  const customer = db.prepare('SELECT name,email,phone FROM users WHERE id=?').get(req.user.id);
  const details = `Order #${result.lastInsertRowid}\nCustomer: ${customer.name}\nEmail: ${customer.email}\nPhone: ${customer.phone}\nTotal: ₹${total}\nItems: ${verifiedItems.map(i=>`${i.name} / ${i.size} x ${i.qty}`).join(', ')}\nAddress: ${Object.values(addr).join(', ')}\nPayment screenshot: ${process.env.BASE_URL || `http://localhost:${PORT}`}${screenshot}\nPayment status: Pending verification`;
  await Promise.all([sendEmail(process.env.ADMIN_EMAIL, `New FBC order #${result.lastInsertRowid}`, details), sendEmail(customer.email, `FBC order received #${result.lastInsertRowid}`, `Hi ${customer.name}, we received your order and payment screenshot. Your payment is pending owner verification.\n\n${details}`), sendSms(process.env.ADMIN_PHONE, `New FBC order #${result.lastInsertRowid}, ₹${total}`)]);
  res.json({ orderId: result.lastInsertRowid, total, status: 'received', message: 'Order received. Payment screenshot is awaiting verification.' });
});
app.get('/api/orders/mine', auth, (req,res) => res.json(db.prepare('SELECT id,items_json,total,payment_status,order_status,created_at FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id).map(o=>({...o,items:JSON.parse(o.items_json)}))));
app.get('/api/admin/orders', auth, admin, (req,res) => res.json(db.prepare(`SELECT o.*,u.name customer_name,u.email customer_email,u.phone customer_phone FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC`).all().map(o=>({...o,items:JSON.parse(o.items_json),address:JSON.parse(o.address_json)}))));
app.patch('/api/admin/orders/:id', auth, admin, async (req,res) => {
  const { payment_status, order_status } = req.body || {};
  const allowedPay = ['pending_verification','verified','rejected']; const allowedOrder = ['received','confirmed','packed','shipped','delivered','cancelled'];
  if (!allowedPay.includes(payment_status) || !allowedOrder.includes(order_status)) return res.status(400).json({error:'Invalid order status.'});
  db.prepare('UPDATE orders SET payment_status=?,order_status=? WHERE id=?').run(payment_status,order_status,Number(req.params.id));
  const order = db.prepare('SELECT o.id,o.total,u.name,u.email FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?').get(Number(req.params.id));
  if (order) await sendEmail(order.email, `FBC order update #${order.id}`, `Hi ${order.name}, your order #${order.id} is now ${order_status}. Payment status: ${payment_status}.`);
  res.json({ok:true});
});
app.post('/api/admin/products', auth, admin, upload.single('image'), (req,res) => {
  const {name,description,price,category} = req.body || {};
  if (!name || !Number.isFinite(Number(price)) || Number(price)<1) return res.status(400).json({error:'Product name and valid price are required.'});
  const image = req.file ? `/uploads/${req.file.filename}` : (req.body.image || '');
  const result = db.prepare('INSERT INTO products(name,description,price,image,category) VALUES(?,?,?,?,?)').run(name,description||'',Number(price),image,category||'Graphic Tees');
  res.json({id:result.lastInsertRowid});
});
app.delete('/api/admin/products/:id', auth, admin, (req,res) => { db.prepare('UPDATE products SET active=0 WHERE id=?').run(Number(req.params.id)); res.json({ok:true}); });
app.get('/api/admin/customers', auth, admin, (_req,res) => res.json(db.prepare("SELECT id,name,email,phone,created_at FROM users WHERE role='customer' ORDER BY id DESC").all()));
app.use((err, _req, res, _next) => {
  console.error('Request failed:', err);
  const message = err instanceof multer.MulterError
    ? (err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 5 MB or smaller.' : err.message)
    : (err.message || 'Server error while processing the request.');
  res.status(400).json({ error: message });
});
app.get('*', (_req,res) => res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT, () => console.log(`FBC T-Shirts running at http://localhost:${PORT}`));
