# Applying Howlil design rules to Notespace's hero

Source: [Howlil design contract](https://github.com/howlil/howlil-app/blob/main/design.md). Scope: navbar and hero only. **The Notespace color palette is unchanged.**

## What transfers

| Howlil rule | Hero implementation |
| --- | --- |
| Concrete copy; each sentence earns its space | “Write notes beside your canvas.” Names the product operation, not an abstract emotional outcome |
| 40rem / 60ch reading width | 640px copy shell; **980px exception for the real product preview** |
| Body 16/24, display 36/40, meta 12/16 | Semantic sizes, regular 400 display, 500/600 only for hierarchy; avoid arbitrary 13/15/17px |
| 4/8/12/16/24/32px scale | Structural spacing only from finite 4px rhythm |
| System sans + mono metadata | No decorative typeface, giant all-caps hero, or fractional 650 weights |
| Flat pill controls | Borderless single primary button; secondary action is a quiet text link |
| Depth only for floating items | Actual Notespace app preview receives complete border and **no deep shadow** |
| No generic marketing SaaS composition | No ambient glow, fake metrics, glowing status dot, testimonial, bento, or mock multi-device gallery |
| Navigation follows context | Simple header links. **Do not copy Howlil's bottom navbar** (portfolio-specific). |
| Semantic state / a11y | Single h1, focus-visible ring, links with real destinations, reduced motion, mobile copy before preview |

## Non-transfer

- **Colors**: all Notespace semantic values remain from `landing/src/styles/global.css` / `DESIGN.md`.
- **Product identity**: Foldling logo, actual note/canvas Raft example, self-hosted deployment, storage model.
- **Whole-page width**: source Howlil's 40rem reading width is appropriate for copy only, not a legible Notespace split-editor preview.

## Evidence and checks

1. The original screenshot's black-on-dark line is a contrast bug. No dark hero mode is permitted to inherit light-only hard-coded text colors.
2. CTA “Self-host with Docker” links to the actual deployment section; GitHub opens the actual repository.
3. Do not present demo-only search cards as if they were real screenshots; reuse `ProductPreview.astro`.
4. Verify desktop/mobile and dark/light. A static Astro build passes before promoting any design.
5. This route is an **isolated review**, not the deployed homepage. Source-of-truth home is unchanged.

Use `landing/src/components/HowlilHero.astro` and `landing/src/styles/howlil-hero.css` only inside `/hero-lab/` until a final selection.
