Plan to fix the mobile catálogo blockage:

1. Fix the real source of the left-side “Bultos disponibles” panel
   - The exported availability image component is currently positioned as a fixed 1000px-wide element and moved left with `translateX(-200vw)`.
   - On mobile Safari, that can still affect the page’s scrollable layout, creating a huge horizontal canvas where only the right side of the catálogo remains visible and the availability table header (“Bultos disponibles”) appears as a blocking white strip.
   - I’ll change that hidden print/export node so it is truly isolated from mobile layout: hidden visual box, clipped, non-interactive, and not contributing to horizontal page width.

2. Add mobile overflow guards on catálogo itself
   - Make the catálogo page root explicitly `w-full min-w-0 overflow-x-hidden`.
   - Remove remaining negative-margin horizontal breakout behavior in the mobile controls that can make the page wider than the viewport.
   - Keep horizontal scrolling only where intended, inside bounded containers.

3. Keep desktop behavior and exports intact
   - The visible availability dialog will stay responsive with the mobile card layout.
   - The PNG export will still render from the hidden print card, only with safer offscreen positioning.
   - No changes to inventory math, pricing logic, PDF generation, or database queries.

4. Verify on mobile width
   - Check the `/admin/catalogo` mobile layout after the changes to confirm there is no horizontal offset, no left-side white panel, and the product grid starts within the viewport.