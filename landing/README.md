# Notespace landing

Standalone Astro static marketing site in `landing/`, outside the root pnpm workspace. Cloudflare Workers serves only the pre-rendered `landing/dist` assets. The Go / SQLite Notespace application is self-hosted separately.

## Local development

```sh
cd landing
pnpm install --frozen-lockfile
pnpm dev
```

## Build and test without deploying

```sh
cd landing
pnpm install --frozen-lockfile
pnpm build
npx wrangler@4.149.0 deploy --dry-run
```

`wrangler.jsonc` is located in `landing/`. A Wrangler dry run validates the static-assets package without publishing it.

## Cloudflare Workers Builds — recommended configuration

Open **Cloudflare → Workers & Pages → Notespace Worker → Settings → Build**. Configure:

| Setting | Value |
| --- | --- |
| Repository | `howlil/notespace` |
| Production branch | `master` |
| **Root directory** | **`landing`** |
| Build command | `pnpm build` |
| Deploy command | **`npx wrangler deploy`** |
| Build environment | Node.js 24, pnpm 11.19.0 |

**Why root directory matters:** From `landing/`, `pnpm build` builds the Astro landing to `landing/dist` and `npx wrangler deploy` automatically finds `landing/wrangler.jsonc`. From the repository root, the same commands build a different project and Wrangler cannot safely auto-detect a deployment target.

Check the name of the existing deployed Worker before going live: `landing/wrangler.jsonc` currently specifies `notespace-landing`. Deploying under a different name may create a separate Worker, not update your existing one.

## Alternative if Cloudflare's root directory stays at `/`

If you cannot change the Cloudflare root directory, explicitly target the nested landing app. Use these **direct commands** in Workers Builds:

| Setting | Value |
| --- | --- |
| Root directory | `/` |
| Build command | `pnpm --dir landing install --frozen-lockfile && pnpm --dir landing build` |
| Deploy command | `npx wrangler deploy --config landing/wrangler.jsonc` |

No `pnpm run deploy`, extra package scripts, or app auto-detection are required.

## Manual deployment

```sh
cd landing
pnpm install --frozen-lockfile
pnpm build
npx wrangler deploy
```

Authenticate Wrangler using your Cloudflare login or appropriately scoped API token. The deployment URL appears only after Cloudflare confirms success.

## Scope

This Worker hosts the Notespace landing page only. The interactive illustration (note, canvas, search) works with example data and does not provide a live multi-user Notespace environment or persistent notes. Running the real Notespace app requires the Go server, API and persistent SQLite state. See [self-host instructions](../README.md#self-host-with-docker).

The [White Canvas design system](HERO-DESIGN-SYSTEM.md) documents navbar, hero, accessibility and interaction behavior.
