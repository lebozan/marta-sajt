const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');
const { PrismaClient } = require('@prisma/client');
const { randomUUID }   = require('crypto');

const app    = express();
const prisma = new PrismaClient();
const PORT   = process.env.PORT || 3000;

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

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
