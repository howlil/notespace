# Notespace landing

Standalone Astro landing page for Notespace. It intentionally lives outside the root pnpm workspace so marketing-site dependencies do not affect the Go/SQLite application runtime or existing verification contract.

## Development

```sh
cd landing
pnpm install --frozen-lockfile
pnpm dev
```

## Build and preview

```sh
cd landing
pnpm build
pnpm dlx wrangler@4.148.0 dev
```

Astro pre-renders this site into `landing/dist`. Cloudflare Workers serves these **static assets** using `landing/wrangler.jsonc`. No Astro Cloudflare SSR adapter, API bindings, or D1 database are required for the landing page.

## Deploy to Cloudflare Workers

Connect [howlil/notespace](https://github.com/howlil/notespace) in **Cloudflare Workers & Pages → Create → Worker → Import a repository** using these Workers Builds settings:

| Setting | Value |
| --- | --- |
| Repository | `howlil/notespace` |
| Production branch | `master` |
| Root directory | `landing` |
| Build command | `pnpm build` |
| Deploy command | `pnpm dlx wrangler@4.148.0 deploy` |
| Build variable | `PNPM_VERSION=11.19.0` |
| Build variable | `NODE_VERSION=24` |
| Build watch paths (include) | `landing/*` |

The root directory is essential: the repository-root `pnpm build` builds the Notespace application, **not** the marketing site. The deployment configuration uses `assets.directory="./dist"` relative to `landing/`.

For a manual deployment, authenticate Wrangler once with `pnpm dlx wrangler@4.148.0 login` and run:

```sh
cd landing
pnpm install --frozen-lockfile
pnpm build
pnpm dlx wrangler@4.148.0 deploy
```

Wrangler will report the deployed Workers URL when Cloudflare accepts the deployment. Attach a custom domain in the Cloudflare dashboard if needed. The service name is `notespace-landing`.

**Scope:** Only the public marketing site is deployed on Workers. Notespace's interactive application still requires its own Go API and persistent SQLite storage; follow the [self-host instructions](../README.md#self-host-with-docker) for the actual application. Do not point the landing's static build at the Go app API expecting it to work without a running server.

The landing reuses the product's Geist typography and neutral/steel-blue design tokens. Copy should follow `.agents/PROJECT.md` and `DESIGN.md`; do not advertise capabilities that are not implemented.
