# Notespace landing deployment

Notespace is a monorepo containing the Go/SQLite self-hosted application, its TanStack Start web UI, and an independent static Astro landing page at `landing/`.

**Cloudflare Workers only hosts the static marketing landing.** It does not host the Notespace Go backend or provide persistent SQLite.

## Cloudflare Workers Builds: current account settings (root `/`)

Cloudflare's build logs on October 13, 2026 demonstrate that the Worker currently invokes `pnpm run build` and `npx wrangler deploy` from the **repository root**, not `landing/`. Both commands now work without changing those dashboard fields:

| Cloudflare setting | Value |
| --- | --- |
| Repository | `howlil/notespace` |
| Production branch | `master` |
| Root directory | `/` |
| Build command | `pnpm run build` |
| Deploy command | `npx wrangler deploy` |
| Environment | Node.js 24 / pnpm 11.19.0 |

What happens:

1. Root `pnpm run build` builds the existing `@notespace/web` application **and** installs/builds the independent Astro landing from `landing/`. The existing app build is preserved for local, CI, and desktop consumers.
2. Root `wrangler.jsonc` points only to `./landing/dist` and specifies Worker name `notespace-landing`, so root `npx wrangler deploy` has an explicit deploy target and does **not** attempt framework auto-detection.
3. The existing `landing/wrangler.jsonc` remains valid for people who deploy while working inside `landing/` (it points to `./dist`).

**Do not rely on `build.command` in the Wrangler config** to produce missing assets. Cloudflare Workers Builds currently ignores Wrangler custom builds; the root `pnpm run build` has to do that work itself.

## Reproduce Cloudflare's root commands locally

```sh
pnpm install --frozen-lockfile
pnpm run build
node --test landing/tests/workers-root.test.mjs
npx wrangler deploy --dry-run
```

The dry-run command simulates Wrangler packaging without deploying or requiring a live production Worker.

## Deploy from `landing/` instead (alternative)

When your Cloudflare dashboard uses **Root directory = `landing`**:

| Setting | Value |
| --- | --- |
| Build command | `pnpm build` |
| Deploy command | `npx wrangler deploy` |

```sh
cd landing
pnpm install --frozen-lockfile
pnpm build
npx wrangler deploy --dry-run
```

No `pnpm run deploy` wrapper is required for either method.

## Worker identity and hosting boundaries

Both Wrangler configurations deliberately use the same Worker name, `notespace-landing`. Check whether your existing Cloudflare Worker has this name before deployment; if it has another name, rename the configuration appropriately to update the existing service rather than create a separate one.

The landing hero uses a static panoramic marketing illustration and has no app session, authentication, or cloud service. Running Notespace requires the separate Go API and persistent SQLite backend; see the [Docker self-host instructions](../README.md#self-host-with-docker).

The [Ambient Editorial Hero design contract](HERO-DESIGN-SYSTEM.md) describes the landing UI. Root deploy regression tests reside in `landing/tests/workers-root.test.mjs`.
