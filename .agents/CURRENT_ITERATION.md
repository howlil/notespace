# Current Iteration

## Active milestone

**M15 — Trust, Portability & Deliberate Recall**

State: **implementation complete; integration is gated only by the final exact-head Verify run**.

## Product outcome

Notespace is safer to trust with a durable personal knowledge library, easier to enter and navigate at scale, and now supports one evidence-based recall loop without expanding into generic productivity, collaboration, AI, or gamification.

```text
CAPTURE / AUTHOR
      ↓
SAFE DELETE ── Restore / Permanent delete
      ↓
OWN DATA ───── Full backup / restore / Markdown migration
      ↓
OPEN SAFELY ── Optional single-user protection
      ↓
FIND FAST ──── Universal Quick Open
      ↓
RECALL ─────── Try from memory → reveal source
```

## Sprint — Core Trust Before More Surface Area

Execution order completed:

1. **Slice 1 — Workspace Trash & Restore**
2. **Slice 2 — Lossless Full-Library Backup & Restore**
3. **Slice 3 — Optional Single-User Remote Protection**
4. **Slice 4 — Bulk Markdown / Obsidian-Vault Migration**
5. **Slice 5 — Universal Quick Open**
6. **Slice 6 — Deliberate Recall**

One branch and PR #18 own the milestone. No independent infrastructure, account platform, plugin framework, analytics expansion, or new top-level knowledge aggregate was introduced.

## Slice 1 — Workspace Trash & Restore

User outcome:

- deleting a Workspace removes it from the active library without immediately destroying recoverable authored work;
- Library tools lists Trash with the original Category and deletion time;
- Restore returns the same Workspace identity, Notes, Canvas, checkpoint history, and image assets;
- permanent deletion is a separate explicit destructive action;
- historical study telemetry remains independent from authored Workspace deletion.

Implementation:

- migration `0010_workspace_trash.sql` adds a compact durable Trash store rather than changing every active-library query with a `deleted_at` predicate;
- Trash stores a complete versioned Workspace envelope containing authored snapshot, bounded checkpoint history, and durable assets;
- capture of the envelope, Trash insertion, checkpoint removal, and active Workspace deletion occur inside one SQLite transaction so autosave cannot land between snapshot and deletion;
- active list/category/search behavior therefore continues to operate only on the existing active Workspace table;
- Category deletion refuses while recoverable Trash still references it;
- permanent deletion drops the Trash envelope while study history keeps its title snapshot.

Acceptance evidence is owned by focused persistence tests plus the final repository verification gate.

## Slice 2 — Lossless Full-Library Backup & Restore

User outcome:

- one action exports a versioned Notespace backup containing all canonical durable library data;
- a compatible fresh installation can restore it and recover the same library state.

Backup contract:

- Categories;
- active Workspaces with complete authored snapshots;
- trashed Workspaces;
- Workspace checkpoint history/payloads;
- durable image assets;
- study-session ledger;
- derived FTS/search rows are excluded and rebuilt from authored state.

Implementation:

- export is captured through one SQLite read transaction for a consistent point-in-time backup;
- restore validates format/version and core category/workspace references before mutation;
- restore replaces canonical library state transactionally, so malformed or failed restore cannot leave a partially replaced library;
- IDs, authored timestamps, history timestamps, and asset identity are retained.

## Slice 3 — Optional Single-User Remote Protection

User outcome:

- an intentionally remote self-hosted instance can require one owner password without introducing accounts, registration, sessions, teams, RBAC, OAuth, SSO, or SaaS identity infrastructure.

Implementation:

- optional `NOTESPACE_PASSWORD` setting;
- fixed owner username `notespace`;
- when configured, application/API requests require HTTP Basic authentication except `/api/health`;
- credentials are compared with constant-time comparison;
- when unset, existing private-network behavior remains unchanged;
- README and `.env.example` explicitly require TLS termination at the reverse proxy/platform for remote Basic-auth use.

## Slice 4 — Bulk Markdown / Obsidian-Vault Migration

User outcome:

- user selects a Markdown folder/vault and migrates many documents in one operation;
- each Markdown document becomes a native Workspace/Note in a chosen Category;
- selected relative image files referenced by Markdown or Obsidian image embeds are copied into server-owned Workspace assets.

Implementation:

- browser directory/multi-file ingestion only; no vendor-specific importer framework;
- one `.md`/`.markdown` file maps to one Workspace containing one native Note;
- first H1-H3 is preferred as title, otherwise filename is used;
- existing Markdown parser remains authoritative;
- standalone `![alt](relative/path)` and Obsidian `![[image.ext]]` / `![[image.ext|alt]]` can resolve to selected local image assets;
- ordinary wiki-links remain text; no backlink/relationship system was introduced;
- partial failures are surfaced as imported/failed counts.

## Slice 5 — Universal Quick Open

User outcome:

- `Ctrl/Cmd + K` works from Home, Category, and full-screen Workspace;
- empty query exposes bounded recent Workspaces;
- typed query searches Category / Workspace / Note / Block and preserves exact Note/block deep links.

Implementation:

- root-level Quick Open surface;
- reuses existing recent-workspace API and SQLite FTS search endpoint;
- no second search backend, generic command framework, or plugin registry;
- Home's inline search remains a visible library surface while the keyboard shortcut is owned globally.

## Slice 6 — Deliberate Recall

User outcome:

- from a Workspace, user can select an existing Note, hide the source, write what they remember, then reveal the source for self-comparison.

Implementation:

- Recall is an ephemeral interaction entered from Quick Open for the current Workspace;
- response state exists only in the dialog and is discarded on close;
- source is rendered from the existing Note snapshot only after Reveal;
- authored Note, timer/streak data, and persistence are unchanged;
- no generated questions, score, grade, spaced-repetition scheduler, review database, XP, badges, or leaderboard.

## Verification status

Risk boundaries changed: web UI, persistence/destructive behavior, deployment security, import/export, and global navigation.

Qualification run #149 already proved:

- repository knowledge contract — pass;
- production Compose config/build/start — pass;
- migration `0010_workspace_trash.sql` applied in production composition — pass;
- production application health — pass;
- restart-persistence smoke — pass;
- one frontend TypeScript ref-mutability defect was detected and corrected before final integration.

The final exact PR head must still pass the complete deterministic gate sequence:

- web TypeScript;
- lint;
- unit tests;
- production web build;
- Go formatting/vet/race tests/build;
- Compose production build/health;
- restart persistence.

No manual browser/black-box gate is introduced.

## Explicit non-goals

- Archive or multi-stage document lifecycle;
- automatic Trash retention/cleanup scheduler;
- cloud backup or third-party storage integration;
- accounts, registration, sessions, teams, RBAC, OAuth, SSO;
- Notion/Evernote/vendor-specific importer zoo;
- generic command palette framework;
- AI question generation or AI writing;
- flashcard database, spaced repetition, grading, learning score, XP, badges, leaderboard;
- collaboration or synchronization architecture.

## Sprint exit criterion

PR #18 is merged into `master` only when the final exact-head deterministic Verify run is green. After merge, stop and reassess product friction before promoting another milestone.
