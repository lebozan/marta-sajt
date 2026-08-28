# Catalogue image sources

The draft products created by `npm run seed` use free Unsplash photographs. The dress and miraz entries are intentionally inactive until ZiraFiona confirms the photographed item, its copy, and its price. The three accessories are created **active**, so the Accessories category is not empty out of the box — their photographs are still stock, so replace them with ZiraFiona's own before treating the listings as exact inventory.

| Draft product | Photographer | Source |
| --- | --- | --- |
| Crimson Evening Dress | Ba Ba | https://unsplash.com/photos/woman-wearing-red-dress-2SppXR9Cx58 |
| Golden Embellished Gown | Mihaela Claudia Puscas | https://unsplash.com/photos/woman-in-a-gown-poses-for-the-camera-emfDaSTC0rM |
| Black Cocktail Dress | ian kelsall | https://unsplash.com/photos/a-woman-wearing-a-black-dress-YMGkmZ_yUI0 |
| Veiled Bridal Gown | Alexander Mass | https://unsplash.com/photos/bride-in-a-white-wedding-dress-with-veil-dhq14gX0Y7I |
| Long Veil Wedding Dress | Alexander Mass | https://unsplash.com/photos/bride-in-a-white-wedding-dress-with-a-long-veil-f1nYe7yTpCA |
| Lace Bridal Ball Gown | Marius Muresan | https://unsplash.com/photos/bride-in-a-white-wedding-dress-on-stairs-dK5Zh7cAFPc |
| Cotton Scrunchie Set | StartVisuals | https://unsplash.com/photos/a-pair-of-glasses-and-a-hair-scrunch-on-a-table-pktdXwoZrJI |
| Canvas Tote Bag | Tereza Rubá | https://unsplash.com/photos/black-leather-tote-bag-TK-rrTgYqzo |
| Bucket Hat | Aedrian Salazar | https://unsplash.com/photos/woman-in-white-red-and-blue-shirt-wearing-green-hat-RlnvkAjO7mM |

## Carousel GIFs

The three hero slides are animated GIFs rendered locally with ffmpeg — a slow
Ken Burns move over photographs already listed above — then uploaded to
Cloudinary. `cloudinaryUrl()` delivers them as animated WebP (`f_webp`), which
is roughly 80-97% smaller than the source GIF.

| Slide | Built from | Photographer |
| --- | --- | --- |
| The Dresses Edit | `emfDaSTC0rM` | Mihaela Claudia Puscas |
| The Miraz Collection | `f1nYe7yTpCA` | Alexander Mass |
| Finishing Touches | `RlnvkAjO7mM` | Aedrian Salazar |

Source pages state that these photographs are available under the Unsplash License. Keep this record, and replace each image with ZiraFiona-owned product photography before representing it as exact sale inventory.
