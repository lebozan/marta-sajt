const Store = {
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
    const cart  = await this.getCart();
    const count = cart.reduce((n, i) => n + i.quantity, 0);
    document.querySelectorAll('.cart-badge').forEach(el => {
      el.textContent  = count;
      el.style.display = count === 0 ? 'none' : 'flex';
    });
  },
};
