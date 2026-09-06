# Notespace landing

Standalone Astro landing page for Notespace. It intentionally lives outside the root pnpm workspace so marketing-site dependencies do not affect the application runtime or existing verification contract.

## Development

```sh
cd landing
pnpm install
pnpm dev
```

## Production build

```sh
pnpm build
```

The landing reuses the product's Geist typography and neutral/steel-blue design tokens. Copy should follow `.agents/PROJECT.md` and `DESIGN.md`; do not advertise capabilities that are not implemented.
