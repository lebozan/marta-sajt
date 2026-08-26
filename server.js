const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');
const fs           = require('fs');
const multer       = require('multer');
const cloudinary   = require('cloudinary').v2;
const { PrismaClient } = require('@prisma/client');
const { randomUUID, timingSafeEqual } = require('crypto');

const app              = express();
const prisma           = new PrismaClient();
const upload           = multer({ storage: multer.memoryStorage() });
const PORT             = process.env.PORT || 3000;
const PAYMENTS_ENABLED = process.env.ENABLE_PAYMENTS === 'true';
const ADMIN_PASSWORD   = process.env.ADMIN_PASSWORD || '';
const SITE_URL         = (process.env.SITE_URL || 'https://zirafiona.up.railway.app').replace(/\/$/, '');
const OG_IMAGE         = 'https://res.cloudinary.com/dkcha41gs/image/upload/v1777981668/marta/ugkc4goltm8lwr2ca2iz.png';
const RESEND_API_KEY   = process.env.RESEND_API_KEY || '';
const NOTIFY_EMAIL     = process.env.NOTIFY_EMAIL || '';
const NOTIFY_FROM      = process.env.NOTIFY_FROM || 'MARTA <onboarding@resend.dev>';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Async error forwarding ──
// Express 4 does not forward a rejected promise from an async handler to the
// error middleware: the rejection goes unhandled and Node kills the process,
// so one bad request takes the whole server down. Patch the routing methods
// once here — every handler registered below is wrapped automatically, which
// keeps new routes safe by default. Arity-4 functions are error handlers and
// are passed through untouched.
function forwardRejections(handler) {
  return function (req, res, next) {
    let out;
    try { out = handler.call(this, req, res, next); }
    catch (err) { return next(err); }
    if (out && typeof out.then === 'function') out.catch(next);
    return out;
  };
}

for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete', 'all']) {
  const original = app[method].bind(app);
  app[method] = (...args) => original(...args.map(arg =>
    typeof arg === 'function' && arg.length < 4 ? forwardRejections(arg) : arg));
}

// Backstop for rejections raised outside a request (fire-and-forget work).
// Logging beats the default, which is to terminate the process.
process.on('unhandledRejection', err => console.error('[unhandledRejection]', err));

app.use(express.json());
app.use(cookieParser());

// Assign a persistent anonymous session ID
app.use((req, res, next) => {
  if (!req.cookies.sid) {
    const sid = randomUUID();
    res.cookie('sid', sid, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    req.sid = sid;
  } else {
    req.sid = req.cookies.sid;
  }
  next();
});

// ── Admin auth ──
// Single shared password (ADMIN_PASSWORD env var). On login the password is
// stored in an httpOnly `admin` cookie; protected routes compare it back.

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function isAdmin(req) {
  return ADMIN_PASSWORD !== '' && !!req.cookies.admin && safeEqual(req.cookies.admin, ADMIN_PASSWORD);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin auth not configured' });
  if (!isAdmin(req))   return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin auth not configured' });
  const { password } = req.body;
  if (!password || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  res.cookie('admin', ADMIN_PASSWORD, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin');
  res.json({ ok: true });
});

app.get('/api/admin/status', (req, res) => {
  res.json({ authenticated: isAdmin(req), configured: !!ADMIN_PASSWORD });
});

// ── Validation helpers ──

const LIMITS = { name: 200, description: 5000, url: 2000, text: 300, message: 3000, images: 20, colors: 30 };

const isStr       = v => typeof v === 'string';
const nonEmpty    = v => isStr(v) && v.trim().length > 0;
const validType   = v => v === 'dress' || v === 'miraz';
const validPrice  = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1_000_000;
const validImages = v => Array.isArray(v) && v.length > 0 && v.length <= LIMITS.images
  && v.every(u => nonEmpty(u) && u.length <= LIMITS.url);
// Unlike images, an empty colour list is valid: it means the product isn't
// offered in a choice of colours and the page falls back to its defaults.
const validColors = v => Array.isArray(v) && v.length <= LIMITS.colors
  && v.every(c => nonEmpty(c) && c.length <= LIMITS.text);
const intParam    = v => { const n = parseInt(v, 10); return Number.isInteger(n) ? n : null; };
// Query values are normally strings, but Express's extended parser turns
// `?a[]=x` into an array and `?a[b]=c` into an object — either shape makes
// Prisma throw. Returns undefined when absent, the string when valid, and
// null when the caller sent something that isn't a plain string.
const queryStr    = v => v === undefined ? undefined : (isStr(v) ? v : null);

// ── Images ──

function streamToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'marta' },
      (error, result) => error ? reject(error) : resolve(result)
    ).end(buffer);
  });
}

app.post('/api/upload', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const result = await streamToCloudinary(req.file.buffer);
  res.json({ url: result.secure_url, publicId: result.public_id });
});

// ── Config ──

app.get('/api/config', (req, res) => {
  res.json({ paymentsEnabled: PAYMENTS_ENABLED });
});

// ── Products ──

app.get('/api/products', async (req, res) => {
  const type = queryStr(req.query.type);
  if (type === null) return res.status(400).json({ error: 'Invalid type' });
  const showAll = req.query.all === 'true' && isAdmin(req);
  const where = {
    ...(showAll ? {} : { active: true }),
    ...(type ? { type } : {}),
  };
  const products = await prisma.product.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(products);
});

app.get('/api/products/search', async (req, res) => {
  const raw = queryStr(req.query.q);
  if (raw === null) return res.status(400).json({ error: 'Invalid query' });
  const q = (raw || '').trim();
  if (!q) return res.json([]);
  const products = await prisma.product.findMany({
    where: { active: true, name: { contains: q, mode: 'insensitive' } },
    take: 3,
    orderBy: { createdAt: 'desc' },
  });
  res.json(products);
});

app.get('/api/products/:id', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

app.post('/api/products', requireAdmin, async (req, res) => {
  const { name, price, images = [], colors = [], type = 'dress', description = '' } = req.body;
  if (!nonEmpty(name) || name.length > LIMITS.name) return res.status(400).json({ error: 'Name is required (max 200 chars)' });
  if (!validPrice(price))                           return res.status(400).json({ error: 'Price must be a number between 0 and 1,000,000' });
  if (!validType(type))                             return res.status(400).json({ error: 'Type must be "dress" or "miraz"' });
  if (!isStr(description) || description.length > LIMITS.description) return res.status(400).json({ error: 'Description too long' });
  if (!validImages(images))                         return res.status(400).json({ error: 'At least one valid image required' });
  if (!validColors(colors))                         return res.status(400).json({ error: 'Invalid colors' });
  const product = await prisma.product.create({
    data: { name: name.trim(), price, image: images[0], images, colors, type, description: description.trim() },
  });
  res.json(product);
});

app.patch('/api/products/:id', requireAdmin, async (req, res) => {
  const { name, price, images, colors, type, active, description } = req.body;
  const data = {};
  if (name !== undefined) {
    if (!nonEmpty(name) || name.length > LIMITS.name) return res.status(400).json({ error: 'Invalid name' });
    data.name = name.trim();
  }
  if (price !== undefined) {
    if (!validPrice(price)) return res.status(400).json({ error: 'Invalid price' });
    data.price = price;
  }
  if (type !== undefined) {
    if (!validType(type)) return res.status(400).json({ error: 'Invalid type' });
    data.type = type;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'Invalid active flag' });
    data.active = active;
  }
  if (description !== undefined) {
    if (!isStr(description) || description.length > LIMITS.description) return res.status(400).json({ error: 'Invalid description' });
    data.description = description.trim();
  }
  if (images !== undefined) {
    if (!validImages(images)) return res.status(400).json({ error: 'At least one valid image required' });
    data.images = images; data.image = images[0];
  }
  if (colors !== undefined) {
    if (!validColors(colors)) return res.status(400).json({ error: 'Invalid colors' });
    data.colors = colors;
  }
  const product = await prisma.product.update({ where: { id: req.params.id }, data });
  res.json(product);
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ── Cart ──

app.get('/api/cart', async (req, res) => {
  const items = await prisma.cartItem.findMany({ where: { sessionId: req.sid } });
  res.json(items);
});

app.post('/api/cart', async (req, res) => {
  const { id, color, size } = req.body;
  if (!nonEmpty(id))                                return res.status(400).json({ error: 'Product id required' });
  if (!nonEmpty(color) || color.length > LIMITS.text) return res.status(400).json({ error: 'Invalid color' });
  if (!nonEmpty(size)  || size.length  > LIMITS.text) return res.status(400).json({ error: 'Invalid size' });
  // Snapshot name/price/image from the DB, never from the client — prevents price tampering.
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const item = await prisma.cartItem.upsert({
    where:  { sessionId_productId_color_size: { sessionId: req.sid, productId: product.id, color, size } },
    update: { quantity: { increment: 1 } },
    create: { sessionId: req.sid, productId: product.id, name: product.name, price: product.price, image: product.image, color, size },
  });
  res.json(item);
});

app.patch('/api/cart/:id', async (req, res) => {
  const id = intParam(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const { delta } = req.body;
  if (delta !== 1 && delta !== -1) return res.status(400).json({ error: 'Delta must be 1 or -1' });
  const existing = await prisma.cartItem.findFirst({
    where: { id, sessionId: req.sid },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const item = await prisma.cartItem.update({
    where: { id: existing.id },
    data:  { quantity: Math.max(1, existing.quantity + delta) },
  });
  res.json(item);
});

app.delete('/api/cart/:id', async (req, res) => {
  const id = intParam(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  await prisma.cartItem.deleteMany({
    where: { id, sessionId: req.sid },
  });
  res.json({ ok: true });
});

// ── PayPal ──

const PAYPAL_BASE = process.env.PAYPAL_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalToken() {
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

app.get('/api/checkout/config', (req, res) => {
  if (!PAYMENTS_ENABLED) return res.status(503).json({ error: 'Payments disabled' });
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID });
});

app.post('/api/checkout/create-order', async (req, res) => {
  if (!PAYMENTS_ENABLED) return res.status(503).json({ error: 'Payments disabled' });
  const items = await prisma.cartItem.findMany({ where: { sessionId: req.sid } });
  if (items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  const total = items.reduce((n, i) => n + i.price * i.quantity, 0);
  const token = await getPayPalToken();

  const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'EUR', value: total.toFixed(2) } }],
    }),
  });

  const order = await response.json();
  res.json({ id: order.id });
});

app.post('/api/checkout/capture-order', async (req, res) => {
  if (!PAYMENTS_ENABLED) return res.status(503).json({ error: 'Payments disabled' });
  const { orderID } = req.body;

  let capture;
  try {
    const token = await getPayPalToken();
    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    capture = await response.json();
  } catch (err) {
    console.error('[capture-order] PayPal API error:', err);
    return res.status(502).json({ error: 'Failed to reach PayPal' });
  }

  console.log('[capture-order] PayPal status:', capture.status, 'orderID:', orderID);

  if (capture.status !== 'COMPLETED') {
    const declined = capture.details?.some(d => d.issue === 'INSTRUMENT_DECLINED');
    if (declined) {
      return res.status(422).json({ error: 'INSTRUMENT_DECLINED' });
    }
    console.error('[capture-order] Unexpected status:', JSON.stringify(capture));
    return res.status(400).json({ error: `Payment not completed (status: ${capture.status})` });
  }

  try {
    const cartItems = await prisma.cartItem.findMany({ where: { sessionId: req.sid } });
    console.log('[capture-order] Cart items found:', cartItems.length, 'for session:', req.sid);

    const total = cartItems.reduce((n, i) => n + i.price * i.quantity, 0);

    const order = await prisma.order.create({
      data: {
        sessionId: req.sid,
        paypalId: orderID,
        status: 'COMPLETED',
        total,
        items: {
          create: cartItems.map(i => ({
            name: i.name, price: i.price, quantity: i.quantity, color: i.color, size: i.size,
          })),
        },
      },
    });

    await prisma.cartItem.deleteMany({ where: { sessionId: req.sid } });

    console.log('[capture-order] Order created:', order.id);
    res.json({ id: order.id, total: order.total });
  } catch (err) {
    console.error('[capture-order] DB error:', err);
    res.status(500).json({ error: 'Order could not be saved' });
  }
});

// ── Email notifications ──
// Owner alert when a wishlist inquiry comes in, sent through the Resend REST
// API (no SDK — global fetch is enough). Notifications stay off unless both
// RESEND_API_KEY and NOTIFY_EMAIL are set. Callers fire and forget: a mail
// failure is logged and never breaks the request that triggered it.

const NOTIFICATIONS_ENABLED = !!(RESEND_API_KEY && NOTIFY_EMAIL);
const EMAIL_RE              = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendMail({ subject, html, replyTo }) {
  if (!NOTIFICATIONS_ENABLED) return { skipped: true };
  const payload = { from: NOTIFY_FROM, to: [NOTIFY_EMAIL], subject, html };
  if (replyTo) payload.reply_to = replyTo;
  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Resend responded ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

// Cloudinary thumbnails for the mail body; other hosts pass through untouched.
const emailThumb = url => String(url || '').includes('/upload/')
  ? String(url).replace('/upload/', '/upload/f_auto,q_auto,w_160/')
  : String(url || '');

function inquiryEmailHtml({ contact, message, items, createdAt }) {
  const list = Array.isArray(items) ? items : [];
  const rows = list.map(i => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f0e4e8;width:72px;">
            <img src="${escapeHtml(emailThumb(i.image))}" width="64" height="86" alt="" style="display:block;border-radius:4px;object-fit:cover;" />
          </td>
          <td style="padding:12px 0 12px 14px;border-bottom:1px solid #f0e4e8;font-size:14px;color:#111111;">
            <a href="${SITE_URL}/product.html?id=${encodeURIComponent(i.productId)}" style="color:#111111;text-decoration:none;font-weight:500;">${escapeHtml(i.name)}</a>
            <div style="color:#77626a;font-size:13px;padding-top:4px;">${escapeHtml(i.color)} · ${escapeHtml(i.size)}</div>
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #f0e4e8;font-size:14px;color:#111111;text-align:right;white-space:nowrap;">€${Number(i.price).toFixed(2)}</td>
        </tr>`).join('');

  const total = list.reduce((sum, i) => sum + Number(i.price || 0), 0);

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#fdf6f8;font-family:Inter,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:6px;padding:28px;">
    <tr><td>
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c9607a;">MARTA</p>
      <h1 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#111111;">New wishlist inquiry</h1>

      <p style="margin:0 0 6px;font-size:14px;color:#111111;"><strong>Contact:</strong> ${escapeHtml(contact)}</p>
      <p style="margin:0 0 6px;font-size:14px;color:#111111;"><strong>Received:</strong> ${escapeHtml(new Date(createdAt).toLocaleString('en-GB'))}</p>
      ${message ? `<p style="margin:16px 0 0;padding:12px 14px;background:#fdf6f8;border-radius:4px;font-size:14px;color:#111111;white-space:pre-wrap;">${escapeHtml(message)}</p>` : ''}

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;">
        <tr><td colspan="3" style="padding-bottom:8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#77626a;">${list.length} item${list.length === 1 ? '' : 's'}</td></tr>
        ${rows || `<tr><td style="font-size:14px;color:#77626a;padding:12px 0;">The wishlist was empty when this was sent.</td></tr>`}
        ${list.length ? `<tr><td colspan="2" style="padding-top:14px;font-size:14px;color:#111111;font-weight:600;">Total</td>
        <td style="padding-top:14px;font-size:14px;color:#111111;font-weight:600;text-align:right;">€${total.toFixed(2)}</td></tr>` : ''}
      </table>

      <p style="margin:28px 0 0;"><a href="${SITE_URL}/admin.html" style="display:inline-block;background:#c9607a;color:#ffffff;text-decoration:none;font-size:14px;padding:11px 22px;border-radius:4px;">Open admin panel</a></p>
    </td></tr>
  </table>
</body></html>`;
}

function notifyInquiry(inquiry, items) {
  sendMail({
    subject: `New wishlist inquiry — ${items.length} item${items.length === 1 ? '' : 's'} — ${inquiry.contact}`,
    html:    inquiryEmailHtml({ ...inquiry, items }),
    replyTo: EMAIL_RE.test(inquiry.contact) ? inquiry.contact : undefined,
  }).catch(err => console.error('[notify] wishlist inquiry email failed:', err.message));
}

// Lets the admin confirm the mail setup without submitting a fake inquiry.
app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
  if (!NOTIFICATIONS_ENABLED) {
    return res.status(503).json({ error: 'Email notifications are not configured (set RESEND_API_KEY and NOTIFY_EMAIL)' });
  }
  try {
    await sendMail({
      subject: 'MARTA — test notification',
      html:    inquiryEmailHtml({
        contact:   'test@example.com',
        message:   'This is a test of the wishlist inquiry notification.',
        createdAt: new Date(),
        items:     [],
      }),
    });
    res.json({ ok: true, sentTo: NOTIFY_EMAIL });
  } catch (err) {
    console.error('[notify] test email failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Wishlist ──

app.get('/api/wishlist', async (req, res) => {
  const items = await prisma.wishlistItem.findMany({ where: { sessionId: req.sid } });
  res.json(items);
});

app.post('/api/wishlist', async (req, res) => {
  const { id, color, size } = req.body;
  if (!nonEmpty(id))                                  return res.status(400).json({ error: 'Product id required' });
  if (!nonEmpty(color) || color.length > LIMITS.text) return res.status(400).json({ error: 'Invalid color' });
  if (!nonEmpty(size)  || size.length  > LIMITS.text) return res.status(400).json({ error: 'Invalid size' });
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const existing = await prisma.wishlistItem.findFirst({
    where: { sessionId: req.sid, productId: product.id, color, size },
  });
  if (existing) return res.json({ added: false });
  const item = await prisma.wishlistItem.create({
    data: { sessionId: req.sid, productId: product.id, name: product.name, price: product.price, image: product.image, color, size },
  });
  res.json({ added: true, item });
});

app.delete('/api/wishlist/:id', async (req, res) => {
  const id = intParam(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  await prisma.wishlistItem.deleteMany({
    where: { id, sessionId: req.sid },
  });
  res.json({ ok: true });
});

app.post('/api/wishlist/inquiry', async (req, res) => {
  const { contact, message } = req.body;
  if (!nonEmpty(contact) || contact.trim().length > LIMITS.text) return res.status(400).json({ error: 'Contact is required (max 300 chars)' });
  if (message !== undefined && (!isStr(message) || message.length > LIMITS.message)) return res.status(400).json({ error: 'Message too long' });
  const items = await prisma.wishlistItem.findMany({ where: { sessionId: req.sid } });
  const inquiry = await prisma.wishlistInquiry.create({
    data: { sessionId: req.sid, contact: contact.trim(), message: (message || '').trim(), items },
  });
  await prisma.wishlistItem.deleteMany({ where: { sessionId: req.sid } });
  notifyInquiry(inquiry, items); // fire-and-forget; never blocks the response
  res.json({ ok: true, id: inquiry.id });
});

app.get('/api/wishlist/inquiries', requireAdmin, async (req, res) => {
  const inquiries = await prisma.wishlistInquiry.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(inquiries);
});

// ── Carousel ──

app.get('/api/carousel', async (req, res) => {
  const where = (req.query.all === 'true' && isAdmin(req)) ? {} : { active: true };
  const slides = await prisma.carouselSlide.findMany({ where, orderBy: { position: 'asc' } });
  res.json(slides);
});

app.post('/api/carousel', requireAdmin, async (req, res) => {
  const { image, eyebrow, heading, ctaLabel, ctaLink } = req.body;
  if (!nonEmpty(image) || image.length > LIMITS.url) return res.status(400).json({ error: 'Image required' });
  for (const [key, val] of Object.entries({ eyebrow, heading, ctaLabel, ctaLink })) {
    if (val !== undefined && (!isStr(val) || val.length > LIMITS.text)) {
      return res.status(400).json({ error: `Invalid ${key}` });
    }
  }
  const last = await prisma.carouselSlide.findFirst({ orderBy: { position: 'desc' } });
  const position = last ? last.position + 1 : 0;
  const slide = await prisma.carouselSlide.create({
    data: { image, eyebrow: eyebrow || '', heading: heading || '', ctaLabel: ctaLabel || 'Shop Now', ctaLink: ctaLink || 'dresses.html', position },
  });
  res.json(slide);
});

app.patch('/api/carousel/:id', requireAdmin, async (req, res) => {
  const id = intParam(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const { active } = req.body;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'Invalid active flag' });
  const slide = await prisma.carouselSlide.update({
    where: { id },
    data: { active },
  });
  res.json(slide);
});

app.delete('/api/carousel/:id', requireAdmin, async (req, res) => {
  const id = intParam(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  await prisma.carouselSlide.delete({ where: { id } });
  res.json({ ok: true });
});

app.patch('/api/carousel/:id/move', requireAdmin, async (req, res) => {
  const { direction } = req.body;
  if (direction !== 'up' && direction !== 'down') return res.status(400).json({ error: 'Direction must be "up" or "down"' });
  const id = intParam(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid id' });
  const slide = await prisma.carouselSlide.findUnique({ where: { id } });
  if (!slide) return res.status(404).json({ error: 'Not found' });
  const other = await prisma.carouselSlide.findFirst({
    where: direction === 'up' ? { position: { lt: slide.position } } : { position: { gt: slide.position } },
    orderBy: { position: direction === 'up' ? 'desc' : 'asc' },
  });
  if (!other) return res.json({ ok: true });
  await prisma.$transaction([
    prisma.carouselSlide.update({ where: { id: slide.id }, data: { position: other.position } }),
    prisma.carouselSlide.update({ where: { id: other.id }, data: { position: slide.position } }),
  ]);
  res.json({ ok: true });
});

// ── SEO ──

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMeta({ title, desc, url, image, type = 'website', jsonLd = null }) {
  const t = escapeHtml(title), d = escapeHtml(desc), u = escapeHtml(url), i = escapeHtml(image);
  let out = `<title>${t}</title>
  <meta name="description" content="${d}" />
  <link rel="canonical" href="${u}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:site_name" content="MARTA" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${u}" />
  <meta property="og:image" content="${i}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${i}" />`;
  if (jsonLd) {
    // Escape `<` so a stray `</script>` in the data can't break out of the tag.
    const json = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
    out += `\n  <script type="application/ld+json">${json}</script>`;
  }
  return out;
}

// Per-product SEO: inject real title/description/OG image/JSON-LD so crawlers
// and social previews see product data rather than the static template.
app.get('/product.html', async (req, res, next) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'product.html'), 'utf8');
    let meta;
    const id = req.query.id;
    if (id) {
      const p = await prisma.product.findUnique({ where: { id: String(id) } });
      if (p) {
        const url   = `${SITE_URL}/product.html?id=${encodeURIComponent(p.id)}`;
        const desc  = (p.description || `${p.name} — available now at MARTA.`).slice(0, 160);
        const image = p.image || OG_IMAGE;
        meta = buildMeta({
          title: `${p.name} — MARTA`, desc, url, image, type: 'product',
          jsonLd: {
            '@context': 'https://schema.org/',
            '@type': 'Product',
            name: p.name,
            image: (p.images && p.images.length) ? p.images : [p.image],
            description: p.description || '',
            brand: { '@type': 'Brand', name: 'MARTA' },
            offers: {
              '@type': 'Offer',
              price: p.price.toFixed(2),
              priceCurrency: 'EUR',
              availability: p.active ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              url,
            },
          },
        });
      }
    }
    if (!meta) {
      meta = buildMeta({
        title: 'MARTA', desc: 'Shop MARTA — elegant, curated women’s fashion.',
        url: `${SITE_URL}/product.html`, image: OG_IMAGE,
      });
    }
    res.type('html').send(html.replace('<!--SEO-->', meta));
  } catch (err) { next(err); }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /cart.html
Disallow: /wishlist.html
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      select: { id: true, updatedAt: true },
    });
    const staticPaths = ['/', '/dresses.html', '/miraz.html'];
    const urls = [
      ...staticPaths.map(p => `  <url><loc>${SITE_URL}${p}</loc></url>`),
      ...products.map(p =>
        `  <url><loc>${SITE_URL}/product.html?id=${encodeURIComponent(p.id)}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod></url>`),
    ];
    res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`);
  } catch (err) { next(err); }
});

app.use(express.static(path.join(__dirname)));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
