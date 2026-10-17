# Notespace desktop — review remediation (M1–M5)

This branch is stacked on M5 PR #115. It does not release, merge, or
automatically restore user data. The implementation below follows the saved
Design Thinking graph: shapes → success path → execution → failure → capability
→ boundary → policy → scope → proof.

## Shapes and owners

| Shape | Owner | Invariant |
|---|---|---|
| DesktopSession {bootstrap, cookie, used} | Go server process | Independent 256-bit secrets; bootstrap single-use |
| DesktopAuthority {address, session} | Go HTTP boundary | Only the OS-selected 127.0.0.1 port and valid session can access private API |
| Quiescence {active, sealed, pendingWrites} | Web desktop lifecycle | One owner; all HTTP adapter mutations drained before installation |
| RuntimeGeneration u64 | Rust Tauri supervisor | Stale child events cannot clear or restart the current process |
| UpgradeInventory {identities, fields, asset digests} | Python CI | Existing user rows and individual fields unchanged unless explicitly permitted |
| DiagnosticEvent | Rust local operations journal | Fixed allowlist, no personal text, reads bounded active+archive tails |

## Successful graph

```text
Tauri spawn
  -> Go SQLite safety gates (M1)
  -> Go tries stable loopback ports 49832 → 41371 → 41372 → OS-assigned fallback
  -> cryptographic bootstrap and session secrets
  -> install Host/Origin/Cookie guards on private API
  -> stdout readiness URL (parent-only pipe)
  -> Tauri validates host + port + single-use bootstrap URL
  -> WebView navigates to one-use route
  -> Go atomically consumes bootstrap token
  -> HttpOnly SameSite=Strict session cookie
  -> redirect to /, ordinary React same-origin API starts
       -> every mutating HTTP transport promise joins pendingWrites
       -> backup/update click synchronously begins input quiescence
       -> flush all mounted editors
       -> drain pendingWrites; rejected promises fail closed
       -> seal future writes
       -> native backup/installer command
       -> backup completion releases seal; successful install leaves it sealed
  -> on failed native installation, restart via supervisor launch_runtime()
       -> previous generation invalidated, new generation owns child events
```

## Execution and failures

- Stable loopback ports preserve the WebView origin across ordinary restarts. If\n  all candidates are unavailable, the OS-assigned fallback changes origin and\n  browser-local cache/preferences may not persist; SQLite remains authoritative.\n- Session cookie lives only until Go process exits; app reload gets a fresh
  bootstrap/session pair. No credentials are committed to SQLite or repository.
- Desktop only: self-hosted Go deployments still use existing Basic Auth or
  their existing explicit trust configuration.
- Wrong Host/Origin rejects before bootstrap even with a guessed token.
- Browser-origin cross-site requests reject except for the one-use initial
  Tauri WebView navigation carrying a cryptographically random bootstrap code.
- Request without session fails HTTP 401 for **every** `/api/*` resource.
- Updating while an HTTP write is pending waits; rejected writes cancel
  the installation/backup. An input barrier blocks both pointer and keyboard
  events before waiting for any save. Backup releases the barrier.
- Failed installer returns control to the sole Rust supervisor; stale
  `Terminated` events cannot evict a newer process.
- SQLite identity-only upgrade evidence is insufficient. The M2 inventory
  records per-column SHA256 digests on all identified user-owned records,
  including authored Note, Canvas, task, and activity fields. JSON object
  key ordering is normalized.
- Rotated logs are read newest-first across active and three archives,
  capped to 20 allowed event codes.

## Small faithful proofs

- Go: no cookie 401, wrong cookie 401, replayed bootstrap 403, forged Host
  403, HttpOnly + SameSite cookie accepted by private API.
- Rust: dynamic port readiness accepts loopback-only with one 64-hex code,
  rejects untrusted URL origin, invalid codes or extra query fields.
- Browser: native WebDriver both reads and mutates through the *authenticated
  WebView*, never bypasses the security boundary using Node raw fetch.
- Frontend: global mutation flush waits for completion; sealing rejects writes;
  only one UI save barrier runs at a time.
- M2 upgrade fixture: changing Note content or workspace title with unchanged
  ID causes inventory verification failure.
- Operations: event logger can read pre-rotation events.
- Full Windows native MSI upgrade N→N+1 with an authored SQLite DB remains
  mandatory. Do not bypass signing, recovery checks or provenance gates.

## Known limits / unresolved safety gates

- Cookie authorization on ordinary HTTP loopback isolates unauthenticated
  callers but does **not** defend against all malicious processes running as
  the same OS user (e.g., compromised WebView profile or cookie theft).
  It is an additional per-process boundary, not OS-user isolation.
- HTTP adapter mutations and Canvas asset PUT uploads are tracked. Any future direct raw fetch with writes
  must adopt the same tracked transport; add a lint/contract test to prevent
  regression before release.
- CI Windows WebDriver acceptance, real publisher signing credentials,
  installer fault injection and upgrade tests are still required.
- A corrupted drive, unsaved keystrokes at sudden process termination, and
  device loss cannot be absolutely ruled out; off-device backups remain
  necessary.

## Required release closure

1. Full Go, Rust and frontend CI passing on this PR's latest commit.
2. Windows native WebDriver login/bootstrap, autosave, restart, crash,
   recovery and port-selection acceptance passing.
3. Signed Windows MSI previous→candidate upgrade with seeded Note/Canvas,
   tasks, Trash and Activity data, plus field digests.
4. Signed update/backup quiescence fault-injection proof.
5. Explicit review of all changed API/desktop trust boundaries.
6. Merge stacked PRs in order only after acceptance, with current CI rerun
   on the resulting integrated commit.
