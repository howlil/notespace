# Notespace Landing — Navbar + Hero Design Contract

Status: **exploration only**. The production `landing/src/pages/index.astro` is unchanged until a direction is selected.

## Authority and product

1. `DESIGN.md` and `apps/web/src/shared/styles/globals.css` are the canonical application design tokens.
2. `landing/src/styles/global.css` defines the existing landing colors and currently uses Geist, while the app uses Open Sans. Treat **Open Sans 400/500/600** as the intended shared typography; do not silently change typography in unrelated landing sections during this exploration.
3. The product is a free self-hosted knowledge workspace: categories → workspaces → multiple Notes + one Canvas, with split authoring, search, and backups. Do not imply a hosted SaaS account, AI generation, collaborative live cursors, or an online demo.

## Information architecture

```text
Header: identity → Product / Workflow / Self-host → GitHub
Hero:   explicit value → short explanation → self-host CTA → GitHub secondary → product proof
Mobile: same reading order, one column, CTA before proof
```

No unverified testimonials, social-proof counts, conversion statistics, or extra feature cards in the hero.

## Primitive system

| Foundation | Contract |
| --- | --- |
| Light colors | Background `#F7F8FA`, surface `#FFFFFF`, ink `#252630`, muted `#787B8A`, line `#E4E5EC`, accent `#4F7396`, tint `#E8EEF6` |
| Dark colors | Background `#18191D`, surface `#202126`, ink `#E8E8EF`, muted `#999BA9`, line `#34353E`, accent `#7FA6C9`, tint `#1B2636` |
| Typography | Open Sans; title desktop 48–56px, mobile 36–42px; body 14–16px; navigation 11–12px; eyebrow 10–11px. Max heading weight 600 |
| Layout | Max content width 1180px, navbar 56–64px, columns only when they clarify relationship; 4px spacing system; no large empty space just for decoration |
| Corners | 6px control / 8px surface / 12px featured product frame; pill only for semantic chips |
| Borders/elevation | Quiet 1px line; restrained product frame elevation only; no full-viewport blur/glow, shader, or image background |
| States | 100–160ms hover/press, clear 2px keyboard focus, semantic selected state, reduced-motion-safe |
| Accessibility | One h1, navigation landmark, functional links, 44px minimum tap target where possible, demo selectors as real buttons with ARIA state |
| Responsive | Content first in the DOM; mobile stack must retain explanation and CTA before product proof; no false phone mockup |

## CTA vocabulary

- Primary: **Self-host Notespace** → existing `#self-host` or GitHub self-host instructions.
- Secondary: **View on GitHub** → `https://github.com/howlil/notespace`.
- No **Start free**, **Sign in**, or **Try demo** until those destinations are real.

## Sliced experiment

Only header + hero are in scope, sharing the existing `Brand.astro` and `ProductPreview.astro`.

- D / **Editorial Stage**: left-side product descriptor + right-side message, full-width real UI below. Inspired by 21st Editorial Hero: https://mcp.21st.dev/%40felipemenezes098/components/hero-05
- E / **Knowledge Stack**: centered title with three visually related authored surfaces. Inspired by 21st Centered Hero with Image Fan: https://docs.21st.dev/%40felipemenezes098/components/hero-10
- F / **Interactive Workspace**: direct pitch + 3 UI mode tabs (Note/Canvas/Split) that change the local preview; no real server interaction. Inspired by 21st Hero Section with Device Mockups: https://mcp.21st.dev/%40solaceui/components/hero-section-6

Do not install the templates' React/Next.js/Motion dependencies into the Astro landing. Use the structural idea, authored HTML/CSS, existing Notespace components, and progressive enhancement only.

## Implementation boundary and gate

`landing/src/pages/hero-lab.astro` and `landing/src/styles/hero-lab.css` own the isolated review page. The production homepage, Go API, SQLite runtime, root workspace, and Cloudflare configuration must remain untouched. Before promoting one variant: review desktop/mobile, light/dark, focus/ARIA, links, reduced motion, production font self-hosting, then build. Remove the lab route once the production hero is selected.
