# Self-hosting and operations

Notespace serves the web application and API from a single Go process with a SQLite database. It is a single-owner application, not a multi-user account or RBAC service.

## Self-host with Docker

For a local source build, use the localhost port-publishing override:

```sh
git clone https://github.com/howlil/notespace.git
cd notespace
docker compose -f compose.yaml -f compose.local.yaml up --build -d --wait
```

Open `http://localhost:8080`.

`compose.yaml` intentionally exposes the container port without publishing it on the host because reverse-proxy/PaaS deployments own the public route. `compose.local.yaml` is the explicit localhost override. Both use the same stable `notespace-data` volume.

Do not use `docker compose down -v` unless you intentionally want to remove the data volume. Keep `NOTESPACE_DATA_VOLUME` stable across redeploys.

### Versioned container images

Maintainers explicitly run **Release** with mode **image** from verified `master` to publish to GitHub Container Registry. An optional stable `version` input (for example an existing `v1.2.3` tag pointing at current master) publishes versioned aliases and `latest`; leaving it blank publishes only the SHA tag. Desktop tags, including beta tags, never trigger image publication:

```text
ghcr.io/howlil/notespace:<version>
ghcr.io/howlil/notespace:latest
```

The source-build Compose path remains the simplest local setup. Operators may use the GHCR image in their existing container platform without rebuilding the repository.

### Remote access protection

Notespace remains usable without application authentication on a trusted private network. For an instance exposed beyond that boundary, set an owner password:

```env
NOTESPACE_PASSWORD=use-a-long-random-secret
```

The owner username is fixed to `notespace`. When configured, the application and API require HTTP Basic authentication; `/api/health` remains unauthenticated for platform health checks.

**Terminate HTTPS at your reverse proxy/platform before using Basic authentication remotely.** The scheme does not encrypt credentials on its own.

This is deliberately a single-owner deployment gate, not an account/RBAC system.

## Production without Docker

```sh
task build
./bin/notespace
```

On Windows, run `./bin/notespace.exe`.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `NOTESPACE_ADDR` | `127.0.0.1:8080` | Go listener |
| `NOTESPACE_DB` | `<process working directory>/data/notespace.db` | Durable SQLite path |
| `NOTESPACE_WEB_DIR` | `apps/web/dist/client` | Built SPA assets |
| `NOTESPACE_PASSWORD` | empty | Optional single-owner HTTP Basic protection |

Compose additionally supports `NOTESPACE_BIND_IP`, `NOTESPACE_PORT`, and `NOTESPACE_DATA_VOLUME` as documented in `.env.example`.

## Data locations

Development and production stores are deliberately separate:

| Runtime | SQLite location |
| --- | --- |
| `task dev` | `<repository>/data/dev/notespace.db` |
| Standalone server/binary | `<process working directory>/data/notespace.db`, unless `NOTESPACE_DB` is set |
| Docker Compose | `/data/notespace.db` in the stable `notespace-data` volume |
| `cargo tauri dev` or a debug desktop build | `<Tauri app data>/dev/notespace.db` |
| Packaged desktop release | `<Tauri app data>/notespace.db` |
| Desktop automated test | `<NOTESPACE_DESKTOP_TEST_DATA_DIR>/notespace.db` when explicitly provided |

The runtime never moves or merges these SQLite stores automatically. Existing
`apps/server/data` and desktop app-data databases stay untouched; use the
application backup/restore flow for an intentional data transfer.

## Operational checklist

- Keep the SQLite volume name and database location stable across upgrades.
- For remote access, configure a strong `NOTESPACE_PASSWORD`, HTTPS at the reverse proxy, and restrict network exposure to intended users. Do not publish secrets or expose an unauthenticated instance to the internet.
- Confirm `/api/health` responds before routing traffic. It is intentionally unauthenticated and is not a complete durability check.
- Export a library backup before updates. The in-app archive round trip is capped at 64 MiB; for larger libraries use a SQLite-safe backup procedure. Stop the application before copying the whole volume, or use a consistent SQLite snapshot method. Copying only the main database file while writes continue is not a safe backup.
- Restore is destructive to the current library by design. Test recovery on a separate installation before replacing production data.
- If troubleshooting startup, inspect `docker compose logs -f`; avoid volume deletion as a repair step.

See the [user guide](USER_GUIDE.md) for library recovery and [architecture](ARCHITECTURE.md) for persistence internals.
