#!/usr/bin/env python3
"""Regression checks for the read-only desktop upgrade inventory contract."""
import importlib.util
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("desktop-upgrade-inventory.py")
SPEC = importlib.util.spec_from_file_location("desktop_upgrade_inventory", MODULE_PATH)
inventory = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(inventory)


class InventoryContractTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "notespace.db"
        db = sqlite3.connect(self.path)
        db.executescript("""
            PRAGMA foreign_keys=ON;
            CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL);
            CREATE TABLE workspace_notes (
                workspace_id TEXT NOT NULL REFERENCES projects(id),
                id TEXT NOT NULL, document_state TEXT NOT NULL,
                PRIMARY KEY(workspace_id,id)
            );
            CREATE TABLE workspace_assets (
                workspace_id TEXT NOT NULL REFERENCES projects(id),
                id TEXT NOT NULL, data BLOB NOT NULL,
                PRIMARY KEY(workspace_id,id)
            );
            CREATE TABLE schema_migrations(name TEXT PRIMARY KEY);
            INSERT INTO schema_migrations(name) VALUES ('0001.sql');
            INSERT INTO projects(id,title) VALUES ('w1','Important workspace');
            INSERT INTO workspace_notes(workspace_id,id,document_state)
                VALUES('w1','n1','{ "content": "private" }');
            INSERT INTO workspace_assets(workspace_id,id,data)
                VALUES('w1','asset1',X'00010203');
        """)
        db.close()
        self.before = inventory.snapshot(self.path)

    def mutate(self, sql, args=()):
        db = sqlite3.connect(self.path)
        try:
            db.execute(sql, args)
            db.commit()
        finally:
            db.close()

    def test_preserved_library_passes(self):
        inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_missing_note_fails(self):
        self.mutate("DELETE FROM workspace_notes WHERE id='n1'")
        with self.assertRaisesRegex(RuntimeError, "authored Workspace and Note data"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_mutated_note_content_without_id_change_fails(self):
        self.mutate("UPDATE workspace_notes SET document_state=? WHERE id='n1'", ('{"content":"corrupted"}',))
        with self.assertRaisesRegex(AssertionError, "User data content changed"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_mutated_workspace_title_without_id_change_fails(self):
        self.mutate("UPDATE projects SET title='Corrupted title' WHERE id='w1'")
        with self.assertRaisesRegex(AssertionError, "User data content changed"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_changed_binary_asset_fails(self):
        self.mutate("UPDATE workspace_assets SET data=X'FFFF' WHERE id='asset1'")
        with self.assertRaisesRegex(AssertionError, "binary asset"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_migration_without_recovery_snapshot_fails(self):
        self.mutate("INSERT INTO schema_migrations(name) VALUES ('0002.sql')")
        with self.assertRaisesRegex(AssertionError, "recovery snapshot"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_migration_with_matching_snapshot_passes(self):
        recovery = Path(str(self.path) + ".recovery")
        recovery.mkdir()
        shutil.copy2(self.path, recovery / "pre-migration-before.db")
        self.mutate("INSERT INTO schema_migrations(name) VALUES ('0002.sql')")
        inventory.verify(self.before, inventory.snapshot(self.path), self.path)


if __name__ == "__main__":
    unittest.main()
