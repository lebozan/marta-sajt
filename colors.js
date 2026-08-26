// Shared colour palette for the admin product form and the product page.
//
// Products store colour NAMES (Product.colors) — the hex values here are
// presentation only, so restyling a swatch never orphans existing product
// rows, cart items, or wishlist entries that reference the name.
const COLOR_PALETTE = [
  { name: 'Black',     hex: '#1a1a1a' },
  { name: 'Charcoal',  hex: '#2b2b2b' },
  { name: 'Grey',      hex: '#9a9a9a' },
  { name: 'Silver',    hex: '#c8ccd0' },
  { name: 'White',     hex: '#ffffff' },
  { name: 'Ivory',     hex: '#f5efe3' },
  { name: 'Cream',     hex: '#e8e0d5' },
  { name: 'Beige',     hex: '#d9c7ad' },
  { name: 'Sand',      hex: '#c9b99a' },
  { name: 'Taupe',     hex: '#8b7d70' },
  { name: 'Brown',     hex: '#6b4a2f' },
  { name: 'Camel',     hex: '#b3854f' },
  { name: 'Gold',      hex: '#c9a227' },
  { name: 'Yellow',    hex: '#e8c33c' },
  { name: 'Orange',    hex: '#e07b39' },
  { name: 'Coral',     hex: '#f08272' },
  { name: 'Red',       hex: '#c0392b' },
  { name: 'Burgundy',  hex: '#6d2231' },
  { name: 'Pink',      hex: '#f2a7bb' },
  { name: 'Rose',      hex: '#c9607a' },
  { name: 'Lilac',     hex: '#c3aed6' },
  { name: 'Purple',    hex: '#6b4a8c' },
  { name: 'Navy',      hex: '#1f2a44' },
  { name: 'Blue',      hex: '#3a6ea5' },
  { name: 'Sky Blue',  hex: '#8fbedd' },
  { name: 'Teal',      hex: '#2f7d78' },
  { name: 'Sage',      hex: '#7a8c7e' },
  { name: 'Green',     hex: '#3f7d4f' },
  { name: 'Olive',     hex: '#6b6b3a' },
];

const COLOR_NAMES = COLOR_PALETTE.map(c => c.name);
const COLOR_HEX   = Object.fromEntries(COLOR_PALETTE.map(c => [c.name, c.hex]));

// Unknown names still render (as a neutral chip) rather than disappearing, so
// a colour removed from the palette never silently blanks an existing product.
const colorHex = name => COLOR_HEX[name] || '#cccccc';

// Ink that stays legible on top of a swatch — dark on pale fills (White,
// Ivory, Cream), light on everything else. Rec. 601 luma, good enough here.
function colorInk(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  if (!Number.isFinite(n)) return '#111111';
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma > 170 ? '#111111' : '#ffffff';
}
