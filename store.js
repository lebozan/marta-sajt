const Store = {
  getCart() {
    return JSON.parse(localStorage.getItem('marta_cart') || '[]');
  },

  saveCart(cart) {
    localStorage.setItem('marta_cart', JSON.stringify(cart));
    this.updateBadge();
  },

  addToCart(item) {
    const cart = this.getCart();
    const hit = cart.find(i => i.id === item.id && i.color === item.color && i.size === item.size);
    if (hit) { hit.quantity++; } else { cart.push({ ...item, quantity: 1 }); }
    this.saveCart(cart);
  },

  removeFromCart(id, color, size) {
    this.saveCart(this.getCart().filter(i => !(i.id === id && i.color === color && i.size === size)));
  },

  updateQuantity(id, color, size, delta) {
    const cart = this.getCart();
    const item = cart.find(i => i.id === id && i.color === color && i.size === size);
    if (!item) return;
    item.quantity = Math.max(1, item.quantity + delta);
    this.saveCart(cart);
  },

  getCartCount() {
    return this.getCart().reduce((n, i) => n + i.quantity, 0);
  },

  getWishlist() {
    return JSON.parse(localStorage.getItem('marta_wishlist') || '[]');
  },

  saveWishlist(wishlist) {
    localStorage.setItem('marta_wishlist', JSON.stringify(wishlist));
  },

  addToWishlist(item) {
    const list = this.getWishlist();
    if (list.find(i => i.id === item.id && i.color === item.color && i.size === item.size)) return false;
    list.push(item);
    this.saveWishlist(list);
    return true;
  },

  removeFromWishlist(id, color, size) {
    this.saveWishlist(this.getWishlist().filter(i => !(i.id === id && i.color === color && i.size === size)));
  },

  isInWishlist(id, color, size) {
    return this.getWishlist().some(i => i.id === id && i.color === color && i.size === size);
  },

  updateBadge() {
    const count = this.getCartCount();
    document.querySelectorAll('.cart-badge').forEach(el => {
      el.textContent = count;
      el.style.display = count === 0 ? 'none' : 'flex';
    });
  }
};
