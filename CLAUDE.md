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
Express server with session-based auth via a `sid` cookie (anonymous sessions, no login). The session ID is auto-assigned as a UUID on first visit and stored in the cookie for 30 days. All API routes are prefixed `/api/`.

**Key endpoints:**
- `GET /api/config` — returns `{ paymentsEnabled }` driven by `ENABLE_PAYMENTS` env var
- `GET /api/products` — accepts `?type=dress|miraz` and `?all=true` (admin-only, bypasses active filter)
- `GET/POST/PATCH/DELETE /api/products/:id` — product CRUD; PATCH accepts `name`, `price`, `type`, `description`, `images`, `active`
- `GET /api/products/search?q=` — name search, returns up to 3 results, active-only
- `GET/POST/PATCH/DELETE /api/cart` — cart management; unique constraint on `(sessionId, productId, color, size)`, adding same variant increments quantity
- `GET/POST/DELETE /api/wishlist` — wishlist management
- `GET /api/wishlist/inquiries` — admin only, returns all WishlistInquiry records
- `POST /api/upload` — uploads image to Cloudinary, returns `{ url, publicId }`
- `GET/POST/DELETE /api/carousel` — carousel slides; GET filters `active: true` unless `?all=true`
- `PATCH /api/carousel/:id` — toggle `active` on a slide
- `PATCH /api/carousel/:id/move` — reorder slides by swapping `position` values
- `POST /api/checkout/create-order` / `capture-order` — PayPal payment flow; both guarded by `PAYMENTS_ENABLED`

### Database (Prisma + PostgreSQL)
Schema at `prisma/schema.prisma`. After any schema change, run `npm run db:push`.

Models and notable fields:
- **Product** — `name`, `description`, `price`, `image` (primary), `images[]`, `type` (`dress`|`miraz`), `active` (soft hide), `createdAt`, `updatedAt`
- **CartItem** — denormalised snapshot of product data at add-time (`name`, `price`, `image`); unique on `(sessionId, productId, color, size)`
- **WishlistItem** — same denormalised shape as CartItem, no quantity
- **CarouselSlide** — `image`, `eyebrow`, `heading`, `ctaLabel`, `ctaLink`, `position` (sort order), `active` (soft hide)
- **WishlistInquiry** — `contact`, `message`, `items` (JSON snapshot), `sessionId`
- **Order** / **OrderItem** — created on PayPal capture; Order holds `paypalId`, `total`, `status`

### Frontend shared patterns
- **`store.js`** — singleton `Store` object imported by all pages. Exposes cart/wishlist fetch helpers and `updateBadge()`. `updateBadge()` calls `/api/config` first; if `paymentsEnabled` is false it reveals nothing and returns early. Cart icon (`.nav-cart`) starts `hidden` in every page's HTML and is only un-hidden by `updateBadge()` when payments are enabled — this prevents a flash on load.
- **`search.js`** — search panel logic, loaded at the bottom of every page. Debounces input (300 ms) and calls `/api/products/search`. Depends on `cloudinaryUrl()` being in scope (defined in `store.js`).
- **`cloudinaryUrl(url, width)`** — defined in `store.js`, rewrites Cloudinary URLs to add `f_auto,q_auto,w_<width>` transformations. Used everywhere images are rendered.

### Page structure
- `index.html` — homepage with hero carousel (fetches `/api/carousel`)
- `dresses.html` / `miraz.html` — product grids with breadcrumb (`Home / Dresses` or `Home / Miraz`); fetch `/api/products?type=dress|miraz`
- `product.html` — detail page; reads `?id=` param, shows multi-image gallery, color/size selectors, size guide modal, add-to-cart, add-to-wishlist. Description is hidden when empty.
- `cart.html` — loads PayPal JS SDK, handles full checkout flow
- `wishlist.html` — wishlist display + inquiry form
- `admin.html` — standalone CRUD panel with its own embedded CSS (no shared `styles.css`). Manages products (create/edit/hide/delete), carousel slides (add/reorder/show/hide/delete), and views wishlist inquiries. Admin fetches always pass `?all=true` to see inactive records.

### Styles (`styles.css`)
Single flat stylesheet. No CSS variables — brand colours are repeated inline: `#c9607a` (rose), `#fdf6f8` (pale pink background), `#111111` (text). Font: Inter via Google Fonts.

## Environment Variables (`.env`)
```
DATABASE_URL                    # PostgreSQL connection string
CLOUDINARY_CLOUD_NAME           # Cloudinary credentials
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
PAYPAL_CLIENT_ID                # PayPal credentials
PAYPAL_CLIENT_SECRET
PAYPAL_ENV                      # "sandbox" or "live"
ENABLE_PAYMENTS                 # Set to "true" to show cart and enable checkout
```
