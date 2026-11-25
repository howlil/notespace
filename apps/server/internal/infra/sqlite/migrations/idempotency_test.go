package migrations

import (
	"context"
	"database/sql"
	"io/fs"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestRunIsIdempotentOnCurrentSchema(t *testing.T) {
	ctx := context.Background()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "idempotent.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if err := Run(ctx, db); err != nil {
		t.Fatal(err)
	}
	var firstCount int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations").Scan(&firstCount); err != nil {
		t.Fatal(err)
	}
	var firstFingerprint string
	if err := db.QueryRowContext(ctx, "SELECT value FROM schema_state WHERE key='schema_fingerprint'").Scan(&firstFingerprint); err != nil {
		t.Fatal(err)
	}

	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	if firstCount != len(names) {
		t.Fatalf("applied migrations = %d, embedded migrations = %d", firstCount, len(names))
	}

	if err := Run(ctx, db); err != nil {
		t.Fatalf("second Run(): %v", err)
	}
	var secondCount int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM schema_migrations").Scan(&secondCount); err != nil {
		t.Fatal(err)
	}
	var secondFingerprint string
	if err := db.QueryRowContext(ctx, "SELECT value FROM schema_state WHERE key='schema_fingerprint'").Scan(&secondFingerprint); err != nil {
		t.Fatal(err)
	}
	if secondCount != firstCount {
		t.Fatalf("migration count changed: first=%d second=%d", firstCount, secondCount)
	}
	if secondFingerprint != firstFingerprint {
		t.Fatalf("schema fingerprint changed without migration: first=%q second=%q", firstFingerprint, secondFingerprint)
	}
	if err := Validate(ctx, db); err != nil {
		t.Fatalf("Validate after repeated Run: %v", err)
	}
}
