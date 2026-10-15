# Notespace Landing — Ambient Editorial Hero

Status: Approved redesign for the production Astro landing, implemented in `landing/src/pages/index.astro` and `landing/src/styles/white-hero.css`.

## Intent

Match the supplied Notespace ambient reference faithfully: restrained white editorial canvas, black pill actions, left-aligned oversized typography, and one wide panoramic visual. **This is not an AI SaaS, sign-up funnel, or hosted collaboration product.** The CTA leads to the real Docker self-host section. Docs lead to the repository instructions.

## Composition and responsive contract

- Desktop navigation: Notespace identity, Product / Workflow / Self-Host / Docs / GitHub, Documentation and Get Notespace.
- Desktop hero: three-line headline, concise copy, two pill actions, wide image with a 1349:506 aspect ratio. No centered preview frame or orbit decoration.
- Max shell: 1560px; header: 94px; left-aligned body copy; hero artwork fills the content width.
- Mobile: collapsible accessible navigation; headline reflows naturally; image becomes a taller crop without horizontal overflow.
- Exact hero asset is checked into `landing/public/notespace-ambient-hero.webp`; it is a marketing illustration, not a product screenshot.
- Motion limited to subtle button press/hover. Respect reduced motion.
- The existing Product, Workflow, Self-host, metrics, and footer sections remain intact.

## Verification

Build with `pnpm --dir landing build`, then `node --test landing/tests/hero.test.mjs`. Inspect desktop 1448px and mobile 390px/320px screenshots. Root Cloudflare deployment continues to package only the Astro `landing/dist` static assets.
