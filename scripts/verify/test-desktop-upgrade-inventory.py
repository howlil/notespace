#!/usr/bin/env python3
"""Regression checks for the read-only desktop upgrade inventory contract."""
import importlib.util
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "release" / "desktop-upgrade-inventory.py"
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
            CREATE TABLE workspace_canvas (
                workspace_id TEXT PRIMARY KEY REFERENCES projects(id),
                canvas_state TEXT NOT NULL
            );
            CREATE TABLE workspace_assets (
                workspace_id TEXT NOT NULL REFERENCES projects(id),
                id TEXT NOT NULL, data BLOB NOT NULL,
                PRIMARY KEY(workspace_id,id)
            );
            CREATE TABLE schema_migrations(name TEXT PRIMARY KEY);
            INSERT INTO schema_migrations(name) VALUES ('0001.sql');
            INSERT INTO projects(id,title) VALUES ('w1','Important workspace');
            INSERT INTO workspace_canvas(workspace_id,canvas_state)
                VALUES('w1','{ "content": "private" }');
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

    def test_missing_canvas_fails(self):
        self.mutate("DELETE FROM workspace_canvas WHERE workspace_id='w1'")
        with self.assertRaisesRegex(RuntimeError, "authored Workspace and Canvas data"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_mutated_canvas_content_without_id_change_fails(self):
        self.mutate("UPDATE workspace_canvas SET canvas_state=? WHERE workspace_id='w1'", ('{"content":"corrupted"}',))
        with self.assertRaisesRegex(AssertionError, "User data content changed"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_mutated_workspace_title_without_id_change_fails(self):
        self.mutate("UPDATE projects SET title='Corrupted title' WHERE id='w1'")
        with self.assertRaisesRegex(AssertionError, "User data content changed"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_changed_binary_asset_fails(self):
        self.mutate("UPDATE workspace_assets SET data=X'FFFF' WHERE id='asset1'")
        with self.assertRaisesRegex(AssertionError, "User data content changed|binary asset"):
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


RICH = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"kept"}]}]}'
MARKDOWN = '{"type":"markdown","text":"kept"}'


class NoteConversionContractTest(unittest.TestCase):
    """Migration 0033 may rewrite a rich Note only while keeping its original."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "notespace.db"
        db = sqlite3.connect(self.path)
        db.executescript(f"""
            CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT NOT NULL);
            CREATE TABLE workspace_canvas (workspace_id TEXT PRIMARY KEY, canvas_state TEXT NOT NULL);
            CREATE TABLE canvas_notes (id TEXT PRIMARY KEY, document_state TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE schema_migrations(name TEXT PRIMARY KEY);
            INSERT INTO projects VALUES ('w1','W');
            INSERT INTO workspace_canvas VALUES ('w1','{{}}');
            INSERT INTO canvas_notes VALUES ('n1','{RICH}',3,'u');
        """)
        db.close()
        self.before = inventory.snapshot(self.path)

    def convert(self, original=RICH, converted=MARKDOWN):
        db = sqlite3.connect(self.path)
        db.executescript("CREATE TABLE canvas_note_legacy_documents (note_id TEXT PRIMARY KEY, document_state TEXT NOT NULL);")
        db.execute("INSERT INTO canvas_note_legacy_documents VALUES ('n1',?)", (original,))
        db.execute("UPDATE canvas_notes SET document_state=?, revision=4 WHERE id='n1'", (converted,))
        db.commit()
        db.close()

    def test_converted_note_with_preserved_original_passes(self):
        self.convert()
        inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_rewritten_note_without_original_fails(self):
        db = sqlite3.connect(self.path)
        db.execute("UPDATE canvas_notes SET document_state=?, revision=4 WHERE id='n1'", (MARKDOWN,))
        db.commit()
        db.close()
        with self.assertRaisesRegex(AssertionError, "canvas_notes field document_state"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_altered_original_fails(self):
        self.convert(original=RICH.replace("kept", "changed"))
        with self.assertRaisesRegex(AssertionError, "canvas_notes field document_state"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)

    def test_conversion_cannot_touch_other_fields(self):
        self.convert()
        db = sqlite3.connect(self.path)
        db.execute("UPDATE canvas_notes SET updated_at='changed' WHERE id='n1'")
        db.commit()
        db.close()
        with self.assertRaisesRegex(AssertionError, "canvas_notes field updated_at"):
            inventory.verify(self.before, inventory.snapshot(self.path), self.path)


if __name__ == "__main__":
    unittest.main()
