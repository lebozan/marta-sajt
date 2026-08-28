function cloudinaryUrl(url, width) {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
}

// Build a responsive srcset (`url widthw, ...`) so browsers download an
// appropriately-sized image per device. Returns '' for non-Cloudinary URLs
// (e.g. placeholders), in which case callers fall back to plain `src`.
function cloudinarySrcset(url, widths) {
  if (!url || !url.includes('/upload/')) return '';
  return widths.map(w => `${cloudinaryUrl(url, w)} ${w}w`).join(', ');
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
