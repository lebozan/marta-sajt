const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');
const multer       = require('multer');
const cloudinary   = require('cloudinary').v2;
const { PrismaClient } = require('@prisma/client');
const { randomUUID }   = require('crypto');

const app    = express();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });
const PORT   = process.env.PORT || 3000;

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

// ── Images ──

function streamToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'marta' },
      (error, result) => error ? reject(error) : resolve(result)
    ).end(buffer);
  });
}

app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const result = await streamToCloudinary(req.file.buffer);
  res.json({ url: result.secure_url, publicId: result.public_id });
});

// ── Products ──

app.get('/api/products', async (req, res) => {
  const products = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(products);
});

app.get('/api/products/:id', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

app.post('/api/products', async (req, res) => {
  const { name, price, image } = req.body;
  const product = await prisma.product.create({ data: { name, price, image } });
  res.json(product);
});

app.delete('/api/products/:id', async (req, res) => {
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

app.use(express.static(path.join(__dirname)));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
