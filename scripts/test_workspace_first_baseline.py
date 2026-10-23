"""Targeted proof of the Workspace-first M0 read-only baseline inventory."""
from __future__ import annotations

from contextlib import closing
import importlib.util
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("workspace_first_baseline.py")
SPEC = importlib.util.spec_from_file_location("workspace_first_baseline", SCRIPT)
assert SPEC and SPEC.loader
baseline = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(baseline)


class WorkspaceFirstBaselineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "notespace.db"
        with closing(sqlite3.connect(self.path)) as db, db:
            db.executescript(
                """
                CREATE TABLE projects (id TEXT PRIMARY KEY);
                CREATE TABLE planning_tasks (
                  id TEXT PRIMARY KEY, workspace_id TEXT,
                  planned_for TEXT, completed_at TEXT
                );
                CREATE TABLE activity_sessions (
                  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL DEFAULT ''
                );
                INSERT INTO projects VALUES ('w1');
                INSERT INTO planning_tasks VALUES ('t1',NULL,NULL,NULL);
                INSERT INTO planning_tasks VALUES ('t2',NULL,'2026-10-24',NULL);
                INSERT INTO planning_tasks VALUES ('t3',NULL,NULL,'2026-10-23');
                INSERT INTO planning_tasks VALUES ('t4','w1','2026-10-24',NULL);
                INSERT INTO activity_sessions VALUES ('a1','');
                INSERT INTO activity_sessions VALUES ('a2','w1');
                INSERT INTO activity_sessions VALUES ('a3','deleted-workspace');
                """
            )

    def test_inventory_separates_legacy_ownership_and_dates(self) -> None:
        with closing(sqlite3.connect(self.path)) as db, db:
            result = baseline.collect_baseline(db)
            self.assertEqual(result["workspaces"], 1)
            self.assertEqual(result["tasks"], {
                "total": 4,
                "workspace_owned": 1,
                "standalone_total": 3,
                "standalone_inbox_open": 1,
                "standalone_scheduled_open": 1,
                "standalone_completed": 1,
            })
            self.assertEqual(result["activity_rows"], {
                "total": 3,
                "no_workspace": 1,
                "missing_workspace_reference": 1,
            })
            self.assertFalse(result["capture_table_present"])
            self.assertRaises(
                sqlite3.OperationalError,
                db.execute,
                "INSERT INTO projects VALUES ('should-not-write')",
            )

    def test_cli_json_inventory_leaves_database_unchanged(self) -> None:
        before = self.path.read_bytes()
        run = subprocess.run(
            [sys.executable, str(SCRIPT), str(self.path)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(json.loads(run.stdout)["tasks"]["standalone_total"], 3)
        self.assertEqual(before, self.path.read_bytes())

    def test_missing_required_schema_is_actionable(self) -> None:
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("DROP TABLE activity_sessions")
            with self.assertRaisesRegex(ValueError, "activity_sessions"):
                baseline.collect_baseline(db)

    def test_cli_missing_path_does_not_create_database(self) -> None:
        missing = Path(self.temp.name) / "not-present.db"
        run = subprocess.run(
            [sys.executable, str(SCRIPT), str(missing)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(run.returncode, 2)
        self.assertFalse(missing.exists())


if __name__ == "__main__":
    unittest.main()
