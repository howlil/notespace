"""Read-only baseline inventory for a future Workspace-first Notespace migration.

Usage: python3 scripts/workspace_first_baseline.py /path/to/notespace.db

Never pass a live database through a tool that copies, mutates or checkpoints it.
The script reports aggregate counts only; it does not print titles or content.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

REQUIRED_TABLES = frozenset({"projects", "planning_tasks", "activity_sessions"})


def _count(connection: sqlite3.Connection, statement: str) -> int:
    row = connection.execute(statement).fetchone()
    if row is None:
        raise ValueError("Baseline count query returned no result")
    return int(row[0])


def collect_baseline(connection: sqlite3.Connection) -> dict[str, object]:
    """Inventory durable ownership without changing any database records."""
    connection.execute("PRAGMA query_only = ON")
    tables = {
        name for (name,) in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    missing = sorted(REQUIRED_TABLES - tables)
    if missing:
        raise ValueError("Database missing required Notespace tables: " + ", ".join(missing))

    tasks = connection.execute(
        """
        SELECT
          COUNT(*),
          COALESCE(SUM(CASE WHEN workspace_id IS NOT NULL THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN workspace_id IS NULL THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN workspace_id IS NULL
             AND planned_for IS NULL AND completed_at IS NULL THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN workspace_id IS NULL
             AND planned_for IS NOT NULL AND completed_at IS NULL THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN workspace_id IS NULL
             AND completed_at IS NOT NULL THEN 1 ELSE 0 END), 0)
        FROM planning_tasks
        """
    ).fetchone()
    if tasks is None:
        raise ValueError("Could not read planning task baseline")

    sessions = connection.execute(
        """
        SELECT
          COUNT(*),
          COALESCE(SUM(CASE WHEN s.workspace_id = '' THEN 1 ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN s.workspace_id <> '' AND p.id IS NULL
              THEN 1 ELSE 0 END), 0)
        FROM activity_sessions AS s
        LEFT JOIN projects AS p ON p.id = s.workspace_id
        """
    ).fetchone()
    if sessions is None:
        raise ValueError("Could not read activity baseline")

    return {
        "workspaces": _count(connection, "SELECT COUNT(*) FROM projects"),
        "tasks": {
            "total": int(tasks[0]),
            "workspace_owned": int(tasks[1]),
            "standalone_total": int(tasks[2]),
            "standalone_inbox_open": int(tasks[3]),
            "standalone_scheduled_open": int(tasks[4]),
            "standalone_completed": int(tasks[5]),
        },
        "activity_rows": {
            "total": int(sessions[0]),
            "no_workspace": int(sessions[1]),
            "missing_workspace_reference": int(sessions[2]),
        },
        "capture_table_present": "capture_items" in tables,
        "notes": [
            "Activity counts represent stored date-segment rows, not logical sessions.",
            "Missing Activity Workspace references may reflect deleted Workspaces, not corruption.",
            "No automatic legacy Task or Activity reassignment is permitted.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path, help="Path to an existing Notespace SQLite database")
    args = parser.parse_args(argv)
    try:
        path = args.database.resolve(strict=True)
        if not path.is_file():
            raise ValueError("Database path is not a file")
        with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=5) as db:
            result = collect_baseline(db)
    except (OSError, ValueError, sqlite3.Error) as error:
        print("Baseline audit failed: " + str(error), file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
