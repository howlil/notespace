# Notespace landing

The public Notespace marketing site is a **standalone Astro static site** in `landing/`, outside the root pnpm workspace. Do not deploy the root TanStack Start build or the Go/SQLite self-hosted application to this Worker. Only `landing/dist` is published to Cloudflare Workers Static Assets.

## Local development

```sh
cd landing
pnpm install --frozen-lockfile
pnpm dev
```

## Local production build

```sh
cd landing
pnpm build
pnpm deploy:check
```

`pnpm deploy:check` runs Wrangler with `--dry-run`, which checks the Worker packaging without publishing or requiring a live deployment.

## Cloudflare Workers Builds — recommended

Existing Cloudflare service: open **Workers & Pages → [Notespace worker] → Settings → Build**. Update and save:

| Setting | Value |
| --- | --- |
| Repository | `howlil/notespace` |
| Production branch | `master` |
| **Root directory** | **`landing`** |
| Build command | `pnpm build` |
| Deploy command | `pnpm run deploy` |
| Build variables | `NODE_VERSION=24`, `PNPM_VERSION=11.19.0` |
| Optional build watch paths | `landing/**` |

The essential fix is the root directory **`landing`**, since that is where `wrangler.jsonc`, `package.json`, and Astro's output directory reside. If the dashboard asks for an initial install, use `pnpm install --frozen-lockfile` **inside `landing`**. The package script pins Wrangler `4.149.0`, matching the version seen in the failing build.

The resulting Worker is named `notespace-landing` by `wrangler.jsonc`. For an existing Cloudflare service, verify its name and domain configuration before applying changes; an unmatched name can create a separate Worker rather than update the existing one.

## Cloudflare Workers Builds — existing root directory cannot be changed

If the existing Cloudflare configuration must keep **repo root `/`**, use these commands instead. They explicitly select the landing app even when Cloudflare installs the root workspace dependencies automatically:

| Setting | Value |
| --- | --- |
| Root directory | `/` (existing) |
| Build command | `pnpm run build:landing` |
| Deploy command | `pnpm run deploy:landing` |
| Production branch | `master` |

The root scripts are defined in `package.json`:

```json
{
  "build:landing": "pnpm --dir landing install --frozen-lockfile && pnpm --dir landing build",
  "deploy:landing": "pnpm dlx wrangler@4.149.0 deploy --config landing/wrangler.jsonc",
  "check:landing:deploy": "pnpm dlx wrangler@4.149.0 deploy --config landing/wrangler.jsonc --dry-run"
}
```

**Do not** use root `pnpm run build`: it builds `apps/web` into `apps/web/dist/client` and `apps/web/dist/server`. **Do not** use unqualified root `npx wrangler deploy`: it attempts monorepo auto-detection and fails with the error seen in the Cloudflare log.

## Manual deploy

From repository root (after `wrangler login` or with Cloudflare API token configured):

```sh
pnpm run build:landing
pnpm run check:landing:deploy
pnpm run deploy:landing
```

Or from `landing/` itself:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm run deploy
```

Wrangler prints the actual `*.workers.dev` URL after a successful deployment. No publicly deployed URL should be assumed before then.

## What is NOT deployed

The Astro landing is pre-rendered and contains an **illustrative**, client-only product preview. It is *not* a hosted live Notespace application. Running the actual product requires the Go server, API and persistent SQLite volume; see [self-host instructions](../README.md#self-host-with-docker).

## Troubleshooting

| Symptom | Explanation and fix |
| --- | --- |
| `pnpm --filter @notespace/web build` in Cloudflare logs | Wrong root build command; set `landing` root or `build:landing`. |
| Wrangler says it detected a monorepo root | It did not find a Wrangler config in the executed project. Set `landing` root or use `--config landing/wrangler.jsonc`. |
| `Missing asset directory ./dist` | Build of Astro landing never ran; check that `landing/dist/index.html` is generated. |
| Cloudflare deploy permission denied | Check the connected Workers Builds API token permissions and selected Cloudflare account. |
| Only the landing loads; notes can't be saved | Expected: the Go API and SQLite backend are not part of the static landing. |

The chosen White Canvas design and interaction policy are documented in [HERO-DESIGN-SYSTEM.md](HERO-DESIGN-SYSTEM.md).
