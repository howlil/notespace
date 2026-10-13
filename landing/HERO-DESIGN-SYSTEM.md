# Notespace Landing — White Canvas Navbar + Hero

Status: **selected direction for the production landing page**, implemented by `landing/src/pages/index.astro` and `landing/src/styles/white-hero.css`.

Sources of truth:
1. Notespace [DESIGN.md](../DESIGN.md): product boundaries and muted-jade semantic palette.
2. Howlil [design.md](https://github.com/howlil/howlil-app/blob/main/design.md): hierarchy, type roles, spacing, anti-slop rules, conservative motion.
3. This document: explicit *landing-only* deviations (white by design, wider product preview).

## Product intent and hierarchy

Notespace is a **free, self-hosted knowledge workspace**, not a hosted sign-up SaaS.

```text
Navbar: Foldling + name → Product / Self-host / Documentation → GitHub
Hero: product identity → what it actually does → Docker CTA → GitHub secondary
      → true properties → labeled interactive illustration (Note / Canvas / Split)
```

The headline must name Notes/Canvas directly; never substitute generic thinking slogans or unsupported value claims.

## Visual contract

- Background: `#FFFFFF` in all OS color schemes for this landing. This is intentional: white is the requested direction, not automatic dark mode.
- Colors retain the Notespace muted-jade values: `--ink #252630`, `--muted #787B8A`, `--line #E4E5EC`, `--accent #3F6D61`, `--tint #EBF2EE`.
- Accent color only for links, CTA, headings with explicit semantic emphasis, controls' active/focus states, and product-owned diagram highlights. No giant colored backdrop, glow, decorative dot grid behind hero copy, or gradient display heading.
- Font: Howlil-style system sans (400/500/600), mono only for metadata. Main display `48px` desktop / `36px` mobile. Body `16/24`, navigation and controls `14/20`, labels `12/16`.
- Spacing: 4px base, favor 8/12/16/24/32px. Header ~64px desktop / 56px mobile; hero top padding 64px desktop / 40px mobile.
- Layout: headline ~720px, body 560px, real UI illustration max 980px (deliberate exception to Howlil's 640px reading column).
- Control: flat primary pill; secondary text action; full border on the real application frame. Only very subtle shadow on the framed UI.
- Interaction motion: 160ms max for local hover/press, no scroll-triggered reveal, honor `prefers-reduced-motion`.
- Accessibility: one hero `h1`, keyboard-visible focus, semantic nav and section headings, functional links.

## Interactive illustration contract

`ProductPreview.astro` supports `interactive` prop, but preserves a static mode for other callers.

- Note/Canvas/Split tabs update **only mock preview layout** and report active state with `aria-pressed`.
- Search demonstrates **static example data** only, with working query filter, Escape/outside dismissal, focus return and tab containment; it does not call the Go API.
- Canvas nodes are keyboard- and pointer-selectable, with `aria-pressed` and a text selection label. This is illustrative, not an editable or persistent Excalidraw workspace.
- Demo is explicitly labeled an illustration and does not imply online SaaS, login, cloud storage, or collaborative editing.
- Mobile stacks note and canvas, keeps the primary CTA ahead of demo, and exposes tab/search controls without horizontal overflow.

## QA gate

1. Static Astro build and emitted `dist/index.html` assertions succeed.
2. Review desktop/mobile at >= 1280px and <= 390px; inspect 320px controls for overflow.
3. Verify search filter, empty search, switch modes, canvas node click and Enter/Space, Escape and focus restoration.
4. Check outbound links and functional `#self-host` anchor.
5. Check contrast, reduced-motion and keyboard focus visibility.
6. Production deployment is a **separate step** after PR merge; this change does not imply Cloudflare is deployed.

## Scope boundary

Only the navbar/hero design and shared landing foundation tokens change. The Product, Workflow, Self-host, metrics, closing CTA, and footer sections retain their structure and copy. The existing Compose example in Self-host is corrected to publish localhost using `compose.local.yaml`.
