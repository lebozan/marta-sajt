// Shared size vocabulary for the admin product form and the product page.
//
// Sizes are stored on the product as plain strings (Product.sizes), the same
// way colours are. This list is only what the admin picker offers.
const SIZE_PALETTE = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'];

// Products created before sizes existed — and any left blank in admin — fall
// back to this, so the picker is never empty and add-to-cart always has a
// value to send. Matches what product.html used to hardcode.
const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL'];

// The fit finder maps body measurements onto this scale. A product sold in
// "One size" (accessories) has nothing to recommend, so the "Find your fit"
// link is hidden unless at least one of its sizes is on the scale.
const MEASURED_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];

const hasMeasuredSize = sizes =>
  Array.isArray(sizes) && sizes.some(s => MEASURED_SIZES.includes(s));
