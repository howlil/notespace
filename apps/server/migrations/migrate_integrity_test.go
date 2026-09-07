package migrations

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "integrity.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestAppliedMigrationChecksumMismatchFails(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	if err := Run(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE schema_migrations SET checksum='tampered' WHERE name='0001_projects.sql'`); err != nil {
		t.Fatal(err)
	}
	if err := Run(ctx, db); err == nil || !strings.Contains(err.Error(), "checksum changed") {
		t.Fatalf("Run() error = %v, want checksum mismatch", err)
	}
}

func TestOutOfBandSchemaDriftFails(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	if err := Run(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `CREATE TABLE rogue_schema(id TEXT PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	if err := Run(ctx, db); err == nil || !strings.Contains(err.Error(), "schema drift detected") {
		t.Fatalf("Run() error = %v, want schema drift", err)
	}
}

func TestValidateDetectsForeignKeyViolation(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys=OFF; CREATE TABLE parent(id TEXT PRIMARY KEY); CREATE TABLE child(parent_id TEXT REFERENCES parent(id)); INSERT INTO child(parent_id) VALUES ('missing')`); err != nil {
		t.Fatal(err)
	}
	if err := Validate(ctx, db); err == nil || !strings.Contains(err.Error(), "foreign key violation") {
		t.Fatalf("Validate() error = %v, want foreign key violation", err)
	}
}
