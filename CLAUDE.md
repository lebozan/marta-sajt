# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ZiraFiona is a fashion e-commerce site — a Node.js/Express backend with a vanilla HTML/CSS/JS frontend. No build step, no framework, no TypeScript. Files are served directly by Express.

## Commands

```bash
npm start          # Start the Express server on port 3000
npm run db:push    # Push Prisma schema changes to the database
```

To develop: run `npm start` and open `http://localhost:3000`.

## Architecture

### Backend (`server.js`)
Express server with session-based auth via a `sid` cookie (anonymous sessions, no login). The session ID is auto-assigned as a UUID on first visit and stored in the cookie for 30 days. All API routes are prefixed `/api/`.

**Input validation:** Write routes validate body shape via small helpers near the top of `server.js` (`nonEmpty`, `validType`, `validPrice`, `validImages`, `validColors`, `validSizes`, `intParam`) plus a `LIMITS` map for max lengths. Unlike `validImages`, `validColors` and `validSizes` accept an empty array — a product need not offer a choice. Invalid input returns `400` with an `{ error }` message; numeric `:id` params are parsed with `intParam` and reject non-integers before hitting Prisma.

**Admin auth:** A single shared password (`ADMIN_PASSWORD` env var) guards all mutating and PII routes via the `requireAdmin` middleware. `POST /api/admin/login` sets an httpOnly `admin` cookie (7-day expiry) holding the password, which protected routes compare back with a constant-time check. If `ADMIN_PASSWORD` is unset, protected routes return 503. `admin.html` shows a login gate until `GET /api/admin/status` reports authenticated. Protected routes: `POST /api/upload`, product `POST/PATCH/DELETE`, carousel `POST/PATCH/DELETE` (incl. `/move`), and `GET /api/wishlist/inquiries`. The `?all=true` bypass on `GET /api/products` and `GET /api/carousel` only applies for authenticated admins; anonymous callers always get the active-only filter.

**Key endpoints:**
- `GET /api/config` — returns `{ paymentsEnabled }` driven by `ENABLE_PAYMENTS` env var
- `POST /api/admin/login` / `logout` — set/clear the admin cookie; `GET /api/admin/status` — `{ authenticated, configured }`
- `GET /api/products` — accepts `?type=dress|miraz|accessories` and `?all=true` (admin-only, bypasses active filter). Non-string query values are rejected with 400 by `queryStr` before reaching Prisma
- `GET/POST/PATCH/DELETE /api/products/:id` — product CRUD; PATCH accepts `name`, `price`, `type`, `description`, `images`, `colors`, `sizes`, `active`
- `GET /api/products/search?q=` — name search, returns up to 3 results, active-only
- `GET/POST/PATCH/DELETE /api/cart` — cart management; unique constraint on `(sessionId, productId, color, size)`, adding same variant increments quantity. `POST` takes only `{ id, color, size }` — `name`/`price`/`image` are snapshotted from the DB product server-side (client-sent values are ignored to prevent price tampering). `PATCH` `delta` must be `1` or `-1`
- `GET/POST/DELETE /api/wishlist` — wishlist management; `POST` takes `{ id, color, size }` and snapshots product data server-side like the cart
- `GET /api/wishlist/inquiries` — admin only, returns all WishlistInquiry records
- `POST /api/admin/test-email` — admin only, sends a sample notification to `NOTIFY_EMAIL`; 503 if mail is unconfigured
- `POST /api/upload` — uploads image to Cloudinary, returns `{ url, publicId }`
- `GET/POST/DELETE /api/carousel` — carousel slides; GET filters `active: true` unless `?all=true`
- `PATCH /api/carousel/:id` — toggle `active` on a slide
- `PATCH /api/carousel/:id/move` — reorder slides by swapping `position` values
- `POST /api/checkout/create-order` / `capture-order` — PayPal payment flow; both guarded by `PAYMENTS_ENABLED`

**Email notifications:** `POST /api/wishlist/inquiry` emails the shop owner via the Resend REST API (plain `fetch`, no SDK). Helpers live in the "Email notifications" section of `server.js`: `sendMail()` posts to `api.resend.com/emails`, `inquiryEmailHtml()` renders a table-layout HTML mail with the contact, message, and item snapshot. Sending is off unless both `RESEND_API_KEY` and `NOTIFY_EMAIL` are set, and is fire-and-forget — a mail failure is logged but never fails the inquiry. `Reply-To` is set to the customer's contact when it looks like an email address.

**SEO:**
- Static pages (`index`, `dresses`, `miraz`) have hardcoded meta description + Open Graph + Twitter tags + `<link rel="canonical">`. Base URL is `SITE_URL` (defaults to the Railway URL).
- `cart.html` / `wishlist.html` carry `<meta name="robots" content="noindex, follow">`; `admin.html` is `noindex, nofollow`.
- `GET /product.html` is intercepted server-side (before `express.static`): it reads the file and replaces the `<!--SEO-->` placeholder in the `<head>` with a per-product `<title>`, description, OG image, and `Product` JSON-LD (falls back to generic ZiraFiona meta when `?id=` is missing/not found). `buildMeta()` + `escapeHtml()` build the block; JSON-LD escapes `<` to prevent tag breakout.
- `GET /sitemap.xml` — generated from `SITE_URL` + all active products (with `lastmod`). `GET /robots.txt` — references the sitemap and disallows admin/cart/wishlist/api.

### Database (Prisma + PostgreSQL)
Schema at `prisma/schema.prisma`. After any schema change, run `npm run db:push`.

Models and notable fields:
- **Product** — `name`, `description`, `price`, `image` (primary), `images[]`, `colors[]` (colour *names* from the shared palette; may be empty), `sizes[]` (size labels; may be empty), `type` (`dress`|`miraz`|`accessories`, validated against `PRODUCT_TYPES` in `server.js`), `active` (soft hide), `createdAt`, `updatedAt`
- **CartItem** — denormalised snapshot of product data at add-time (`name`, `price`, `image`); unique on `(sessionId, productId, color, size)`
- **WishlistItem** — same denormalised shape as CartItem, no quantity
- **CarouselSlide** — `image`, `eyebrow`, `heading`, `ctaLabel`, `ctaLink`, `position` (sort order), `active` (soft hide)
- **WishlistInquiry** — `contact`, `message`, `items` (JSON snapshot), `sessionId`
- **Order** / **OrderItem** — created on PayPal capture; Order holds `paypalId`, `total`, `status`

### Frontend shared patterns
- **`store.js`** — singleton `Store` object imported by all pages. Exposes cart/wishlist fetch helpers and `updateBadge()`. `updateBadge()` calls `/api/config` first; if `paymentsEnabled` is false it reveals nothing and returns early. Cart icon (`.nav-cart`) starts `hidden` in every page's HTML and is only un-hidden by `updateBadge()` when payments are enabled — this prevents a flash on load.
- **`search.js`** — search panel logic, loaded at the bottom of every page. Debounces input (300 ms) and calls `/api/products/search`. Depends on `cloudinaryUrl()` being in scope (defined in `store.js`).
- **`formatPrice(value)`** — defined in `store.js`, used by every price render (cards, search results, wishlist rows, the product panel). Returns `''` for a price of 0, a negative, a non-number, or anything that would round to `€0.00`, so callers render nothing rather than "free". Price visibility is deliberately **not** tied to `ENABLE_PAYMENTS` — a product shows its price whenever it has one; only the buying controls depend on the payments flag.
- **`sizes.js`** — the shared size vocabulary (`SIZE_PALETTE`, `DEFAULT_SIZES`, `MEASURED_SIZES`, `hasMeasuredSize()`), loaded by `admin.html` and `product.html`. `hasMeasuredSize()` decides whether the "Find your fit" link shows: the fit finder maps body measurements onto XS–XXL, so a product sold only in `One size` hides it.
- **`colors.js`** — the shared colour palette (`COLOR_PALETTE`, `COLOR_NAMES`, `colorHex()`, `colorInk()`), loaded by `admin.html` and `product.html`. Products store colour **names**; hex values are presentation only, so restyling a swatch never orphans existing product/cart/wishlist rows. `colorHex()` returns a neutral grey for a name not in the palette rather than dropping it.
- **`cloudinaryUrl(url, width)`** — defined in `store.js`, rewrites Cloudinary URLs to add `q_auto,w_<width>,c_limit` transformations. `c_limit` never upscales: Cloudinary returns **HTTP 400** for an upscale of an animated asset, and upscaling a still only wastes bytes. The format is `f_webp` for `.gif` sources (`f_auto` leaves an animated GIF as a GIF; WebP is ~80% smaller) and `f_auto` otherwise. Used everywhere images are rendered.

### Page structure
- `index.html` — homepage with hero carousel (fetches `/api/carousel`)
- `dresses.html` / `miraz.html` / `accessories.html` — product grids with breadcrumb and an `<h1>` + item count; fetch `/api/products?type=<type>`. Adding a category means: a new page, `PRODUCT_TYPES` in `server.js`, the sitemap's `staticPaths`, both `<select>`s in `admin.html`, the nav link in every page's header, and a homepage collection tile
- `product.html` — detail page; reads `?id=` param, shows multi-image gallery, color/size selectors, size guide modal, add-to-cart, add-to-wishlist. Description is hidden when empty. Colour swatches and size buttons are rendered from the product's `colors[]` / `sizes[]` (first of each preselected); a product with none set falls back to `DEFAULT_COLORS` / `DEFAULT_SIZES` so the pickers are never empty and add-to-cart always has values to send.
- `cart.html` — loads PayPal JS SDK, handles full checkout flow
- `wishlist.html` — wishlist display + inquiry form
- `admin.html` — standalone CRUD panel with its own embedded CSS (no shared `styles.css`). Manages products (create/edit/hide/delete), carousel slides (add/reorder/show/hide/delete), and views wishlist inquiries. Admin fetches always pass `?all=true` to see inactive records. Colours and sizes are picked as toggleable buttons via `makeTokenPicker({ gridId, summaryId, names, renderButton, emptyLabel })`, which drives all four pickers (colour + size, on both the create and edit forms) and normalises each selection to vocabulary order. Buttons share `.picker-btn` for hit-testing plus a `.swatch` / `.size-chip` modifier for styling.

### Styles (`styles.css`)
Single flat stylesheet. No CSS variables — brand colours are repeated inline: `#c9607a` (rose), `#fdf6f8` (pale pink background), `#111111` (text). Font: Inter via Google Fonts.

**Navbar:** category links flow from the left, the logo is `position: absolute` at `left: 50%` so it stays centred however many categories exist, and `.nav-icons` is pinned right. Under 768px the header wraps to two rows (logo + icons, then the links) and is a fixed 104px tall — `.search-panel`'s `top` and `.hero-carousel`'s height offset against that number, so changing it means changing them too.

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
ADMIN_PASSWORD                  # Shared password for the admin panel; if unset, admin routes return 503
SITE_URL                        # Canonical base URL for SEO tags/sitemap (defaults to the Railway URL)
RESEND_API_KEY                  # Resend API key; with NOTIFY_EMAIL, enables wishlist inquiry emails
NOTIFY_EMAIL                    # Shop inbox that receives inquiry notifications
NOTIFY_FROM                     # Sender address, must be a Resend-verified domain (defaults to onboarding@resend.dev)
```
