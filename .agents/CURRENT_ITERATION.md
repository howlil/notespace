# Current Iteration

## Active milestone

**M15 — Trust, Portability & Deliberate Recall**

State: **implementation in progress**.

## Product outcome

Notespace becomes safe enough to trust with a durable personal knowledge library, easier to enter and navigate at scale, and capable of one evidence-based learning loop without expanding into generic productivity, collaboration, AI, or gamification.

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

Execution order:

1. **Slice 1 — Workspace Trash & Restore**
2. **Slice 2 — Lossless Full-Library Backup & Restore**
3. **Slice 3 — Optional Single-User Remote Protection**
4. **Slice 4 — Bulk Markdown / Obsidian-Vault Migration**
5. **Slice 5 — Universal Quick Open**
6. **Slice 6 — Deliberate Recall**

One branch and one integration PR own the milestone. Each slice must remain vertically usable; no independent infrastructure, account platform, plugin framework, analytics expansion, or new top-level knowledge aggregate is authorized.

## Slice 1 — Workspace Trash & Restore

User outcome:

- deleting a Workspace moves it out of the active library instead of destroying authored content immediately;
- Trash lists deleted Workspaces with their original Category and deletion time;
- Restore returns the same Workspace identity, Notes, Canvas, history, assets, and study association to the active library;
- permanent deletion is explicit and destructive.

Implementation boundary:

- add nullable `deleted_at` to the existing Workspace row;
- all active list, category count, get/edit, and search paths exclude trashed Workspaces;
- soft deletion must not remove history/assets;
- permanent deletion reuses the existing transactional hard-delete behavior.

Acceptance:

- deleted Workspace disappears from Home/category/search but appears in Trash;
- restoring it makes the same Workspace readable again with history/assets intact;
- permanent deletion removes authored Workspace/history/assets while historical study telemetry retains its title snapshot;
- Category deletion still refuses when active or trashed Workspaces depend on it.

## Slice 2 — Lossless Full-Library Backup & Restore

User outcome:

- one action exports a versioned Notespace backup containing all durable user-owned data;
- a fresh compatible Notespace installation can restore that backup and recover the same library state.

Backup contract:

- Categories;
- active and trashed Workspaces with complete authored snapshots;
- Workspace history/checkpoint payloads;
- durable image assets;
- study-session ledger;
- derived FTS/search rows are excluded and rebuilt lazily.

Acceptance:

- backup is versioned and rejected when format/version is unsupported;
- restore is transactional: malformed/incomplete backup cannot leave a partially replaced library;
- restored IDs and timestamps remain stable;
- search projection is regenerated from restored authored state rather than treated as source data.

## Slice 3 — Optional Single-User Remote Protection

User outcome:

- a self-hosted instance intentionally exposed beyond a trusted private network can require one shared owner password without introducing accounts, teams, RBAC, invitations, sessions, or SaaS identity infrastructure.

Implementation boundary:

- optional `NOTESPACE_PASSWORD` deployment setting;
- when configured, all application/API access except health probing requires HTTP Basic authentication;
- fixed owner username `notespace`;
- password comparison uses constant-time comparison;
- when unset, the existing private/local deployment behavior remains unchanged.

Acceptance:

- configured instance returns `401` + authentication challenge without valid credentials;
- valid owner credentials reach existing routes unchanged;
- `/api/health` remains available for container/platform health checks;
- deployment documentation states that TLS must terminate at the reverse proxy/platform before Basic auth is suitable for remote use.

## Slice 4 — Bulk Markdown / Obsidian-Vault Migration

User outcome:

- user can select a Markdown folder/vault and migrate many documents in one operation instead of importing files individually;
- imported Markdown becomes native Notespace Workspaces/Notes in a chosen Category;
- relative image files referenced by Markdown are copied into server-owned Workspace assets when present.

Implementation boundary:

- browser directory/multi-file ingestion only; no vendor-specific importer framework;
- one Markdown file maps to one Workspace containing one native Note;
- basename becomes Workspace/Note title unless Markdown provides a better heading-derived title;
- existing Markdown adapter remains the canonical conversion path, extended only for standalone image references.

Acceptance:

- multiple `.md`/`.markdown` files import in one user action;
- non-Markdown files are ignored except image files referenced by selected Markdown;
- duplicate input paths do not create duplicate assets within one imported Workspace;
- partial file failure is surfaced with an explicit imported/failed count rather than silently discarded.

## Slice 5 — Universal Quick Open

User outcome:

- `Ctrl/Cmd + K` works from Home, Category, or full-screen Workspace;
- user can immediately open recent Workspaces or search Category / Workspace / Note / Block and land on exact context.

Implementation boundary:

- root-level command surface;
- reuse current recent-workspace APIs and FTS search endpoint;
- no generic command framework, plugin action registry, or second search backend.

Acceptance:

- empty query shows bounded recent destinations;
- typed query uses existing global search and preserves note/block deep links;
- selecting a result closes the surface and navigates directly;
- Home's inline search remains available but no longer owns the global shortcut.

## Slice 6 — Deliberate Recall

User outcome:

- from a Workspace Note, user can hide the source, write what they remember, then reveal the source for self-comparison.

Implementation boundary:

- Recall is an ephemeral study interaction over the currently selected Note;
- no generated questions, score, grade, spaced-repetition scheduler, review database, XP, badges, or streak changes;
- authored Note remains unchanged.

Acceptance:

- Recall starts with source content hidden;
- user can type unrestricted recall text without mutating the Note;
- Reveal displays recall text beside/before the source text for comparison;
- closing Recall discards the temporary response.

## Final verification gate

Because this milestone changes persistence, destructive behavior, deployment security, import/export, and global navigation, the final exact PR head must pass all deterministic repository gates, including Go race tests, web type/lint/unit/build checks, production composition, and restart-persistence verification selected by CI.

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

All six user-visible capabilities are integrated coherently on one final PR head, deterministic gates are green, documentation/product contract matches shipped behavior, and the PR is merged into `master`.
