function cloudinaryUrl(url, width) {
  if (!url || !url.includes('/upload/')) return url;
  // c_limit never upscales. Cloudinary rejects an upscale of an animated asset
  // outright (HTTP 400 — a broken hero image), and for stills it only wasted
  // bytes enlarging a small source.
  // f_auto leaves an animated GIF as a GIF; f_webp turns it into an animated
  // WebP roughly 80% smaller, which matters for a full-bleed hero.
  const format = /\.gif($|\?)/i.test(url) ? 'f_webp' : 'f_auto';
  return url.replace('/upload/', `/upload/${format},q_auto,w_${width},c_limit/`);
}

// Build a responsive srcset (`url widthw, ...`) so browsers download an
// appropriately-sized image per device. Returns '' for non-Cloudinary URLs
// (e.g. placeholders), in which case callers fall back to plain `src`.
function cloudinarySrcset(url, widths) {
  if (!url || !url.includes('/upload/')) return '';
  return widths.map(w => `${cloudinaryUrl(url, w)} ${w}w`).join(', ');
}

// Prices show only once they are set. A product at 0 is one whose price has
// not been decided yet — the seeded drafts are all 0 — and rendering "€0.00"
// would read as free. Returns '' so callers can drop the element entirely.
function formatPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  // Test the rounded value, not the raw one: 0.004 is > 0 but renders as
  // "€0.00", which is the very thing this guard exists to avoid.
  const cents = Math.round(value * 100);
  return cents > 0 ? `€${(cents / 100).toFixed(2)}` : '';
}

// How long a product keeps its "New" badge. The homepage always shows the
// newest four regardless of age — a strict cutoff would empty the row (and
// hide the section) in any month nothing was added. The badge is what keeps
// the "New Arrivals" heading honest when stock has not moved recently.
const NEW_ARRIVAL_DAYS = 30;

function isNewArrival(createdAt) {
  if (!createdAt) return false;
  const added = new Date(createdAt);
  if (Number.isNaN(added.getTime())) return false;
  // Negative ages (a clock-skewed future date) still count as new.
  return (Date.now() - added.getTime()) / 86400000 < NEW_ARRIVAL_DAYS;
}

// The footer year is hardcoded in every page so it still reads correctly with
// JS off; this just stops it going stale. Runs on load since store.js is
// included on every page.
document.querySelectorAll('.footer-year').forEach(el => {
  el.textContent = new Date().getFullYear();
});

const Store = {
  _config: null,

  async getConfig() {
    if (!this._config) {
      this._config = await fetch('/api/config').then(r => r.json());
    }
    return this._config;
  },

  async getCart() {
    const r = await fetch('/api/cart');
    return r.json();
  },

  async addToCart(item) {
    await fetch('/api/cart', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(item),
    });
    await this.updateBadge();
  },

  async updateQuantity(itemId, delta) {
    await fetch(`/api/cart/${itemId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ delta }),
    });
    await this.updateBadge();
  },

  async removeFromCart(itemId) {
    await fetch(`/api/cart/${itemId}`, { method: 'DELETE' });
    await this.updateBadge();
  },

  async getWishlist() {
    const r = await fetch('/api/wishlist');
    return r.json();
  },

  async addToWishlist(item) {
    const r = await fetch('/api/wishlist', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(item),
    });
    const data = await r.json();
    return data.added;
  },

  async removeFromWishlist(itemId) {
    await fetch(`/api/wishlist/${itemId}`, { method: 'DELETE' });
  },

  async findInWishlist(productId, color, size) {
    const list = await this.getWishlist();
    return list.find(i => i.productId === productId && i.color === color && i.size === size) || null;
  },

  async updateBadge() {
    const cfg = await this.getConfig();
    if (!cfg.paymentsEnabled) {
      document.body.classList.add('payments-off');
      return;
    }
    document.querySelectorAll('.nav-cart').forEach(el => { el.hidden = false; });
    const cart  = await this.getCart();
    const count = cart.reduce((n, i) => n + i.quantity, 0);
    document.querySelectorAll('.cart-badge').forEach(el => {
      el.textContent  = count;
      el.style.display = count === 0 ? 'none' : 'flex';
    });
  },
};
