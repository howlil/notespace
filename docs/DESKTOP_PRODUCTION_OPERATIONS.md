# Notespace desktop M5 — production distribution, security, and operations

## Objective and release authority

M5 strengthens Windows desktop distribution without replacing Notespace's local
SQLite library. It is stacked on M4 (#114), M3 (#113), M2 (#112), and M1 (#111).
It does **not** claim release approval until the actual signed installer,
schema migrations, native acceptance, and real N→N+1 MSI upgrade pass.

This phase does not set up monitoring servers or upload private notes or logs.

## Threat and responsibility graph

```text
External website / DNS rebinding
  -> Go desktop loopback Host + Origin + Fetch Metadata validation
  -> ownerless local HTTP API / local assets
      -> CSRF/origin checks still run at API mutation boundary
      -> canonical SQLite remains locally owned

Remote link in Tauri WebView
  -> opener allows HTTPS/mailto/tel; no arbitrary HTTP open-url
  -> Tauri bootstrap CSP limits script/object/embed and local connects
  -> Go-served HTML includes framing/object/base CSP restrictions

Tagged release
  -> exact current master HEAD + stable SemVer
  -> no earlier GitHub release with that tag
  -> M1/M2 migration and MSI upgrade proof
  -> Tauri update detached signature using stable minisign key
  -> Windows Authenticode publisher signature, verified identity
  -> Sigstore GitHub Actions attestation and verification
  -> immutable GitHub Release with MSI, .sig, latest.json, SHA256SUMS
```

### Desktop loopback security

`desktopLoopbackBoundary` is enabled only when the Tauri sidecar runs with
`NOTESPACE_PARENT_LIFECYCLE=1`. It requires an exact loopback authority and
rejects cross-origin browser requests. The API's same-origin mutation
middleware remains enabled.

**Residual risk:** another local process on the user's machine has access to
the loopback interface. Host/Origin checks are not a secret. Do not expose the
sidecar on the LAN or treat these checks as local process authentication.
A per-process random bearer token / trusted transport channel would further
reduce local-process access, but would require a coordinated WebView API auth
and bootstrap change. That is not claimed as completed by M5.

### Publisher and update signatures — separate trust chains

M3 Tauri minisign keys authenticate updater packages. M5 additionally
requires Windows Authenticode signing with an expected publisher subject. A
minisign `.msi.sig` does **not** make an MSI Authenticode signed. A valid
Authenticode signature does not replace Tauri's update signature.

Required GitHub Actions variables:

- `NOTESPACE_UPDATER_PUBLIC_KEY`
- `NOTESPACE_AZURE_SIGNING_ENDPOINT` (e.g. the assigned
  `https://<region>.codesigning.azure.net`)
- `NOTESPACE_AZURE_SIGNING_ACCOUNT`
- `NOTESPACE_AZURE_SIGNING_PROFILE`
- `NOTESPACE_WINDOWS_SIGNER_SUBJECT` (exact expected certificate Subject)

Required GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TENANT_ID`

The Azure Artifact Signing CLI is configured through Tauri's official
`bundle.windows.signCommand`. Azure credentials are injected as environment
variables only during the signed release build. Private key material must
never be embedded in config overlays, source or logs. These values require an
actual publisher account and certificates, which are not supplied by source.

### Immutable release policy

Release jobs refuse nonstable tags, stale tag targets, and existing releases.
They verify signed MSI publisher identity and provenance before uploading the
assets. Avoid `gh release upload --clobber`: silently replacing a published
MSI or manifest would break artifact provenance and rollback analysis.
`actions/attest@v4` signs build provenance using a short-lived Sigstore
certificate via the Actions OIDC token. Clients can validate using
`gh attestation verify <installer.msi> -R howlil/notespace`.

Release integrity is **not** proof that downloaded software is vulnerability-
free; it establishes origin and build provenance. A GitHub Release tag cannot
be used as a safe rollback signal after the database has migrated.

### Operational diagnostics and privacy

The native app writes a compact JSONL operational-event journal in the OS
application log directory under `ops/`. Events use a fixed allowlist of
identifiers, timestamped in seconds:

- runtime start requested / ready / failed / exited / retry;
- backup requested / success / failure;
- native update installation requested / failed.

No Note/Canvas content, SQL payloads, URLs, filesystem paths, private keys,
or raw exceptions are written to the diagnostic journal.

Retention: active file rotates at 256 KiB and up to three previous files are
kept. A maximum of 20 recent entries can be viewed in the recovery
diagnostics. Logs are local; no telemetry upload or server is created. Native
`eprintln` and Go `slog` still write process output for interactive
diagnosis and should not be treated as privacy-reviewed persistent logs.
The journal itself is not tamper-evident.

Recommended runbook for investigating an incident:

1. Capture exact application version and OS from safe diagnostics.
2. Check last event codes to classify startup, runtime, backup, or install.
3. Inspect M1 migration snapshots / M4 manual backups **without replacing** any
   live file.
4. Copy the application data directory offline before any recovery attempt.
5. Never attach personal Notes, Canvas JSON, or raw SQLite to a public issue.
6. Keep unverified native installer releases as draft; do not bypass release gates.

## Acceptance and unresolved blockers

- Go loopback host/origin/middleware tests green.
- Native Tauri Rust checks and WebDriver smoke green with bootstrap CSP.
- Windows MSI carries **valid Authenticode** signature from expected publisher.
- Windows update signature verifies with a pinned Tauri public key.
- Release provenance can be verified using GitHub CLI.
- Real Windows MSI N→N+1 test passes with a populated SQLite library.
- M4 recovery, backup and privacy acceptance passes on a real Windows desktop.
- A reserved `127.0.0.1:49832` on GitHub Windows runners remains a known
  native acceptance blocker; M5 does not waive or conceal it.
- Owner must provision publisher-signing service and credential secrets.

No automatic deployment may be treated as production-approved while any P0
native upgrade, recovery or signing acceptance step is unverified.
