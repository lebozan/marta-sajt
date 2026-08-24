const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');
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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
  const showAll = req.query.all === 'true' && isAdmin(req);
  const where = {
    ...(showAll ? {} : { active: true }),
    ...(req.query.type ? { type: req.query.type } : {}),
  };
  const products = await prisma.product.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(products);
});

app.get('/api/products/search', async (req, res) => {
  const q = (req.query.q || '').trim();
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
  const { name, price, images = [], type = 'dress', description = '' } = req.body;
  if (!images.length) return res.status(400).json({ error: 'At least one image required' });
  const product = await prisma.product.create({ data: { name, price, image: images[0], images, type, description } });
  res.json(product);
});

app.patch('/api/products/:id', requireAdmin, async (req, res) => {
  const { name, price, images, type, active, description } = req.body;
  const data = {};
  if (name        !== undefined) data.name        = name;
  if (price       !== undefined) data.price       = price;
  if (type        !== undefined) data.type        = type;
  if (active      !== undefined) data.active      = active;
  if (description !== undefined) data.description = description;
  if (images      !== undefined) { data.images = images; data.image = images[0] ?? ''; }
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
  const { id, name, price, image, color, size } = req.body;
  const item = await prisma.cartItem.upsert({
    where:  { sessionId_productId_color_size: { sessionId: req.sid, productId: id, color, size } },
    update: { quantity: { increment: 1 } },
    create: { sessionId: req.sid, productId: id, name, price, image, color, size },
  });
  res.json(item);
});

app.patch('/api/cart/:id', async (req, res) => {
  const { delta } = req.body;
  const existing = await prisma.cartItem.findFirst({
    where: { id: parseInt(req.params.id), sessionId: req.sid },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const item = await prisma.cartItem.update({
    where: { id: existing.id },
    data:  { quantity: Math.max(1, existing.quantity + delta) },
  });
  res.json(item);
});

app.delete('/api/cart/:id', async (req, res) => {
  await prisma.cartItem.deleteMany({
    where: { id: parseInt(req.params.id), sessionId: req.sid },
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

// ── Wishlist ──

app.get('/api/wishlist', async (req, res) => {
  const items = await prisma.wishlistItem.findMany({ where: { sessionId: req.sid } });
  res.json(items);
});

app.post('/api/wishlist', async (req, res) => {
  const { id, name, price, image, color, size } = req.body;
  const existing = await prisma.wishlistItem.findFirst({
    where: { sessionId: req.sid, productId: id, color, size },
  });
  if (existing) return res.json({ added: false });
  const item = await prisma.wishlistItem.create({
    data: { sessionId: req.sid, productId: id, name, price, image, color, size },
  });
  res.json({ added: true, item });
});

app.delete('/api/wishlist/:id', async (req, res) => {
  await prisma.wishlistItem.deleteMany({
    where: { id: parseInt(req.params.id), sessionId: req.sid },
  });
  res.json({ ok: true });
});

app.post('/api/wishlist/inquiry', async (req, res) => {
  const { contact, message } = req.body;
  if (!contact || !contact.trim()) return res.status(400).json({ error: 'Contact is required' });
  const items = await prisma.wishlistItem.findMany({ where: { sessionId: req.sid } });
  const inquiry = await prisma.wishlistInquiry.create({
    data: { sessionId: req.sid, contact: contact.trim(), message: (message || '').trim(), items },
  });
  await prisma.wishlistItem.deleteMany({ where: { sessionId: req.sid } });
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
  if (!image) return res.status(400).json({ error: 'Image required' });
  const last = await prisma.carouselSlide.findFirst({ orderBy: { position: 'desc' } });
  const position = last ? last.position + 1 : 0;
  const slide = await prisma.carouselSlide.create({
    data: { image, eyebrow: eyebrow || '', heading: heading || '', ctaLabel: ctaLabel || 'Shop Now', ctaLink: ctaLink || 'dresses.html', position },
  });
  res.json(slide);
});

app.patch('/api/carousel/:id', requireAdmin, async (req, res) => {
  const { active } = req.body;
  const slide = await prisma.carouselSlide.update({
    where: { id: parseInt(req.params.id) },
    data: { active },
  });
  res.json(slide);
});

app.delete('/api/carousel/:id', requireAdmin, async (req, res) => {
  await prisma.carouselSlide.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ ok: true });
});

app.patch('/api/carousel/:id/move', requireAdmin, async (req, res) => {
  const { direction } = req.body;
  const id = parseInt(req.params.id);
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

app.use(express.static(path.join(__dirname)));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
