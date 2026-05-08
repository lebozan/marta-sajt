# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MARTA is a fashion e-commerce site — a Node.js/Express backend with a vanilla HTML/CSS/JS frontend. No build step, no framework, no TypeScript. Files are served directly by Express.

## Commands

```bash
npm start          # Start the Express server on port 3000
npm run db:push    # Push Prisma schema changes to the database
```

To develop: run `npm start` and open `http://localhost:3000`.

## Architecture

### Backend (`server.js`)
Express server with session-based auth via a `sid` cookie (anonymous sessions persisted in the database). All API routes are prefixed `/api/`.

**Key endpoints:**
- `GET/POST /api/products` — product listing/creation
- `GET/POST/PATCH/DELETE /api/cart` — cart management (upserts by session+product+color+size)
- `GET/POST/DELETE /api/wishlist` — wishlist management
- `POST /api/upload` — uploads images to Cloudinary, returns a URL
- `POST /api/checkout/create-order` / `capture-order` — PayPal payment flow

### Database (Prisma + PostgreSQL)
Schema at `prisma/schema.prisma`. Models: `Product`, `CartItem`, `WishlistItem`, `Order`, `OrderItem`. CartItem has a unique constraint on `(sessionId, productId, color, size)` — adding the same variant again increments quantity.

### Frontend patterns
- **`store.js`** — shared API client imported by all pages. Handles cart/wishlist fetch calls and updates the nav badge count.
- Product pages (`dresses.html`, `miraz.html`) fetch from `/api/products?type=dress` or `?type=miraz` and render a grid.
- `product.html` reads `?id=` from the URL and handles color/size selection, a size guide modal with metric/imperial sliders, add-to-cart, and add-to-wishlist.
- `cart.html` loads the PayPal JS SDK and handles the full checkout flow.
- `admin.html` is a standalone CRUD panel (has its own embedded CSS, no shared styles).

### Styles (`styles.css`)
Single flat stylesheet, ~1 137 lines. No CSS variables — color values are repeated inline. Brand palette: `#c9607a` (rose), `#fdf6f8` (pale pink background), `#111111` (text). Font: Inter via Google Fonts.

## Environment Variables (`.env`)
```
DATABASE_URL          # PostgreSQL connection string
CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET
PAYPAL_ENV            # "sandbox" or "live"
```
