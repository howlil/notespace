package sqlite

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func migrationRecoveryFiles(t *testing.T, path string) []string {
	t.Helper()
	entries, err := os.ReadDir(path + ".recovery")
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".db") {
			names = append(names, filepath.Join(path+".recovery", entry.Name()))
		}
	}
	return names
}

func TestNewAndUnchangedLibraryDoNotGenerateRecoveryCopies(t *testing.T) {
	path := filepath.Join(t.TempDir(), "notespace.db")
	for i := 0; i < 2; i++ {
		store, err := Open(context.Background(), path)
		if err != nil {
			t.Fatal(err)
		}
		if err := store.Close(); err != nil {
			t.Fatal(err)
		}
		if files := migrationRecoveryFiles(t, path); len(files) != 0 {
			t.Fatalf("unchanged database created %d recovery copies", len(files))
		}
	}
}

func TestExistingLibraryUpgradeCreatesVerifiedSnapshotBeforeWriting(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notespace.db")
	old, err := sql.Open("sqlite", filepath.ToSlash(path))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := old.Exec(`CREATE TABLE preupgrade_notes (id TEXT PRIMARY KEY, text TEXT NOT NULL);
		INSERT INTO preupgrade_notes(id,text) VALUES ('n1','this must survive');`); err != nil {
		t.Fatal(err)
	}
	if err := old.Close(); err != nil {
		t.Fatal(err)
	}
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	var data string
	if err := store.db.QueryRow(`SELECT text FROM preupgrade_notes WHERE id='n1'`).Scan(&data); err != nil || data != "this must survive" {
		t.Fatalf("upgraded library content: %q, %v", data, err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	copies := migrationRecoveryFiles(t, path)
	if len(copies) != 1 {
		t.Fatalf("expected exactly one pre-upgrade snapshot, got %v", copies)
	}
	fi, err := os.Stat(copies[0])
	if err != nil || fi.Size() == 0 {
		t.Fatalf("snapshot missing or empty: %v", err)
	}
	copyDB, err := sql.Open("sqlite", filepath.ToSlash(copies[0])+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer copyDB.Close()
	if err := copyDB.QueryRow(`SELECT text FROM preupgrade_notes WHERE id='n1'`).Scan(&data); err != nil || data != "this must survive" {
		t.Fatalf("original content absent from snapshot: %q, %v", data, err)
	}
	var newSchema int
	if err := copyDB.QueryRow(`SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='schema_migrations'`).Scan(&newSchema); err != nil || newSchema != 0 {
		t.Fatalf("snapshot was taken after schema migration: %d, %v", newSchema, err)
	}
	again, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	again.Close()
	if got := len(migrationRecoveryFiles(t, path)); got != 1 {
		t.Fatalf("reopening unchanged library generated more snapshots: %d", got)
	}
}

func TestMigrationFailureRetainsIndependentRecoveryCopy(t *testing.T) {
	path := filepath.Join(t.TempDir(), "notespace.db")
	old, err := sql.Open("sqlite", filepath.ToSlash(path))
	if err != nil {
		t.Fatal(err)
	}
	// Conflicts with 0001_projects.sql. Real migration fails after a verified
	// snapshot has been published, not during a mock transaction.
	if _, err := old.Exec(`CREATE TABLE projects (marker TEXT); INSERT INTO projects(marker) VALUES ('keep-me');`); err != nil {
		t.Fatal(err)
	}
	old.Close()

	if _, err := Open(context.Background(), path); err == nil || !strings.Contains(err.Error(), "verified pre-upgrade snapshot retained") {
		t.Fatalf("failure must provide recovery location, got %v", err)
	}
	copies := migrationRecoveryFiles(t, path)
	if len(copies) != 1 {
		t.Fatalf("expected independently recoverable SQLite snapshot, got %v", copies)
	}
	for _, copyPath := range append(copies, path) {
		db, err := sql.Open("sqlite", filepath.ToSlash(copyPath)+"?mode=ro")
		if err != nil {
			t.Fatal(err)
		}
		var marker string
		err = db.QueryRow(`SELECT marker FROM projects`).Scan(&marker)
		db.Close()
		if err != nil || marker != "keep-me" {
			t.Fatalf("lost authored data at %s: %q, %v", copyPath, marker, err)
		}
	}
}

func TestNewerSchemaIsRejectedBeforeAnyMetadataWrite(t *testing.T) {
	path := filepath.Join(t.TempDir(), "notespace.db")
	store, err := Open(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.Exec(`INSERT INTO schema_migrations(name,checksum,applied_at) VALUES ('9999_future.sql','future-checksum','now')`); err != nil {
		t.Fatal(err)
	}
	store.Close()

	if _, err := Open(context.Background(), path); err == nil || !strings.Contains(err.Error(), "unsupported database schema") {
		t.Fatalf("old binary must refuse a newer library, got %v", err)
	}
	if files := migrationRecoveryFiles(t, path); len(files) != 0 {
		t.Fatalf("incompatible schema must not trigger snapshot/migration, got %v", files)
	}
	db, err := sql.Open("sqlite", filepath.ToSlash(path)+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var stillPresent int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE name='9999_future.sql'`).Scan(&stillPresent); err != nil || stillPresent != 1 {
		t.Fatalf("newer schema history was modified: %d, %v", stillPresent, err)
	}
}
