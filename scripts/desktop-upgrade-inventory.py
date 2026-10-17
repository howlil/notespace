#!/usr/bin/env python3
"""Independent, read-only library inventory for real MSI N -> N+1 upgrade tests.

Uses only Python stdlib SQLite. Snapshots stable user-owned row identities, not
physical file hashes (which legitimately change under SQLite WAL/migrations).
"""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

# Stable domain identity contracts. Derived FTS, schema state, and revision-only
# metadata are not user records and are intentionally excluded.
IDENTITIES = {
    "categories": ("id",),
    "projects": ("id",),
    "workspace_notes": ("workspace_id", "id"),
    "workspace_canvas": ("workspace_id",),
    "planning_tasks": ("id",),
    "workspace_milestones": ("id",),
    "workspace_assets": ("workspace_id", "id"),
    "activity_sessions": ("id",),
    "workspace_trash": ("id",),
    "workspace_history": ("id",),
}


def snapshot(database):
    path = Path(database).resolve(strict=True)
    con = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)
    try:
        quick = [x[0] for x in con.execute("PRAGMA quick_check")]
        if quick != ["ok"]:
            raise RuntimeError(f"SQLite quick_check failed: {quick!r}")
        violations = list(con.execute("PRAGMA foreign_key_check"))
        if violations:
            raise RuntimeError(f"Foreign key violations: {violations[:3]!r}")
        available = {r[0] for r in con.execute(
            "SELECT name FROM sqlite_schema WHERE type='table'"
        )}
        results = {}
        for table, identity in IDENTITIES.items():
            if table not in available:
                continue
            columns = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
            if not set(identity).issubset(columns):
                raise RuntimeError(f"{table} changed identity columns")
            select = ", ".join(identity)
            rows = [list(row) for row in con.execute(f"SELECT {select} FROM {table}")]
            # JSON encoding stable independent of SQLite row ordering.
            results[table] = sorted(json.dumps(row, separators=(",", ":")) for row in rows)
        if "projects" not in results or "workspace_notes" not in results:
            raise RuntimeError("Upgrade fixture requires canonical workspace + note tables")
        if not results["projects"] or not results["workspace_notes"]:
            raise RuntimeError("Upgrade proof must contain authored Workspace and Note data")

        assets = {}
        if "workspace_assets" in results:
            for workspace_id, asset_id, data in con.execute(
                "SELECT workspace_id,id,data FROM workspace_assets"
            ):
                assets[f"{workspace_id}:{asset_id}"] = hashlib.sha256(data).hexdigest()
        schema_history = sorted(
            row[0] for row in con.execute("SELECT name FROM schema_migrations")
        ) if "schema_migrations" in available else []
        return {"identities": results, "asset_sha256": assets, "schema_migrations": schema_history}
    finally:
        con.close()


def verify(before, after, database):
    for table, keys in before["identities"].items():
        present = after["identities"].get(table)
        if present is None:
            raise AssertionError(f"Data table {table} disappeared during upgrade")
        missing = set(keys) - set(present)
        if missing:
            raise AssertionError(f"Data lost from {table}: {sorted(missing)[:5]}")
    for key, digest in before["asset_sha256"].items():
        if after["asset_sha256"].get(key) != digest:
            raise AssertionError(f"Durable binary asset changed or disappeared: {key}")
    old_schema = set(before["schema_migrations"])
    new_schema = set(after["schema_migrations"])
    if not old_schema.issubset(new_schema):
        raise AssertionError("Upgrade removed recorded SQL migrations")
    if new_schema != old_schema:
        recovery = sorted(Path(str(database) + ".recovery").glob("pre-migration-*.db"))
        if not recovery:
            raise AssertionError("Database migrated but no M1 recovery snapshot exists")
        # Verify independently readable pre-upgrade snapshot exists. M1 owns the
        # full physical integrity check on creation.
        if not any(snapshot(p)["schema_migrations"] == before["schema_migrations"] for p in recovery):
            raise AssertionError("No recovery snapshot matches the pre-upgrade schema")


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("operation", choices=["capture", "verify"])
    cli.add_argument("database", type=Path)
    cli.add_argument("inventory", type=Path)
    args = cli.parse_args()
    current = snapshot(args.database)
    if args.operation == "capture":
        args.inventory.parent.mkdir(parents=True, exist_ok=True)
        with args.inventory.open("x", encoding="utf-8") as file:
            json.dump(current, file, indent=2, sort_keys=True)
        print(f"Recorded durable identities from {args.database}")
    else:
        before = json.loads(args.inventory.read_text(encoding="utf-8"))
        verify(before, current, args.database)
        print("PASS: authored SQLite identities and durable assets survive version upgrade")


if __name__ == "__main__":
    main()
