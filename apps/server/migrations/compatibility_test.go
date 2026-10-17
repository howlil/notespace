package migrations

import (
	"context"
	"database/sql"
	"io/fs"
	"sort"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func TestInspectRejectsUnknownMigrationWithoutSchemaChanges(t *testing.T) {
	ctx := context.Background()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT);
		INSERT INTO schema_migrations(name,checksum) VALUES ('9999_future.sql','future');`); err != nil {
		t.Fatal(err)
	}
	if _, err := Run(ctx, db); err == nil || !strings.Contains(err.Error(), "unsupported database schema") {
		t.Fatalf("expected non-destructive forward-schema rejection, got %v", err)
	}
	var writes int
	if err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_schema WHERE name='schema_state'`).Scan(&writes); err != nil || writes != 0 {
		t.Fatalf("preflight changed schema before rejection: %d, %v", writes, err)
	}
}

func TestInspectRefusesMigrationHistoryWithMissingPredecessor(t *testing.T) {
	ctx := context.Background()
	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(names)
	if len(names) < 2 {
		t.Fatal("test requires at least two migrations")
	}
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT)`); err != nil {
		t.Fatal(err)
	}
	content, err := files.ReadFile(names[1])
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO schema_migrations(name,checksum) VALUES (?,?)`, names[1], checksum(content)); err != nil {
		t.Fatal(err)
	}
	if _, err := Inspect(ctx, db); err == nil || !strings.Contains(err.Error(), "inconsistent schema history") {
		t.Fatalf("expected missing predecessor rejection, got %v", err)
	}
}

func TestInspectDetectsPendingAndCurrentSchema(t *testing.T) {
	ctx := context.Background()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	before, err := Inspect(ctx, db)
	if err != nil || !before.NeedsMigration {
		t.Fatalf("fresh schema should need migration: %+v, %v", before, err)
	}
	if err := Run(ctx, db); err != nil {
		t.Fatal(err)
	}
	after, err := Inspect(ctx, db)
	if err != nil || after.NeedsMigration {
		t.Fatalf("current schema must not need migration: %+v, %v", after, err)
	}
}

func TestInspectRejectsModifiedRecordedMigration(t *testing.T) {
	ctx := context.Background()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	if err := Run(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE schema_migrations SET checksum='tampered' WHERE name=(SELECT MIN(name) FROM schema_migrations)`); err != nil {
		t.Fatal(err)
	}
	if _, err := Inspect(ctx, db); err == nil || !strings.Contains(err.Error(), "checksum changed") {
		t.Fatalf("modified migration must be rejected, got %v", err)
	}
}
