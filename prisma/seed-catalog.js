const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Prisma CLI loads .env automatically; this small script does the same without
// adding a runtime dependency solely for seeding.
function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(__dirname, '..', '.env');
  const line = fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find(entry => entry.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is not configured.');
  process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
}

loadDatabaseUrl();
const prisma = new PrismaClient();

const photo = id => `https://unsplash.com/photos/${id}/download?force=true&w=1200&q=85`;

// All records deliberately start inactive: the photographs are licensed stock
// references, not verified inventory. Set a real price and activate in Admin
// only after confirming that the photo matches the item being offered.
const products = [
  {
    name: 'DRAFT — Crimson Evening Dress',
    type: 'dress',
    price: 0,
    image: photo('2SppXR9Cx58'),
    description: 'Sleeved crimson midi dress with a relaxed, elegant silhouette. Confirm product details and price before publishing.',
  },
  {
    name: 'DRAFT — Golden Embellished Gown',
    type: 'dress',
    price: 0,
    image: photo('emfDaSTC0rM'),
    description: 'Strapless champagne evening gown with beadwork and a fitted silhouette. Confirm product details and price before publishing.',
  },
  {
    name: 'DRAFT — Black Cocktail Dress',
    type: 'dress',
    price: 0,
    image: photo('YMGkmZ_yUI0'),
    description: 'Black cocktail dress with contrasting ribbon detail. Confirm product details and price before publishing.',
  },
  {
    name: 'DRAFT — Veiled Bridal Gown',
    type: 'miraz',
    price: 0,
    image: photo('dhq14gX0Y7I'),
    description: 'Strapless bridal gown with crystal detail and a classic veil. Confirm product details and price before publishing.',
  },
  {
    name: 'DRAFT — Long Veil Wedding Dress',
    type: 'miraz',
    price: 0,
    image: photo('f1nYe7yTpCA'),
    description: 'Classic white wedding dress with a dramatic cathedral-length veil. Confirm product details and price before publishing.',
  },
  {
    name: 'DRAFT — Lace Bridal Ball Gown',
    type: 'miraz',
    price: 0,
    image: photo('dK5Zh7cAFPc'),
    description: 'Strapless lace bridal ball gown with a fitted bodice. Confirm product details and price before publishing.',
  },
  {
    name: 'Cotton Scrunchie Set',
    type: 'accessories',
    price: 12,
    active: true,
    colors: ['Cream', 'Yellow'],
    sizes: ['One size'],
    image: photo('pktdXwoZrJI'),
    description: 'A pair of soft cotton scrunchies in cream and ochre. Swap in your own photography before treating this as exact stock.',
  },
  {
    name: 'Canvas Tote Bag',
    type: 'accessories',
    price: 45,
    active: true,
    colors: ['Black'],
    sizes: ['One size'],
    image: photo('TK-rrTgYqzo'),
    description: 'A structured everyday tote with long shoulder straps. Swap in your own photography before treating this as exact stock.',
  },
  {
    name: 'Bucket Hat',
    type: 'accessories',
    price: 29,
    active: true,
    colors: ['Teal'],
    sizes: ['One size'],
    image: photo('RlnvkAjO7mM'),
    description: 'A soft-brim bucket hat for bright days. Swap in your own photography before treating this as exact stock.',
  },
];

async function main() {
  let added = 0;
  let skipped = 0;

  for (const product of products) {
    const exists = await prisma.product.findFirst({ where: { name: product.name } });
    if (exists) {
      skipped++;
      continue;
    }
    // Entries are hidden unless they opt in: the stock photographs are
    // licensed references, not verified inventory. The accessories opt in so
    // the category is not empty out of the box.
    const { active = false, colors = [], sizes = [], ...rest } = product;
    await prisma.product.create({
      data: { ...rest, images: [product.image], colors, sizes, active },
    });
    added++;
  }

  console.log(`Catalog seed complete: ${added} added, ${skipped} already present.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
