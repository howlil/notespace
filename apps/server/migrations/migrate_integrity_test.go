package migrations

import (
	"context"
	"database/sql"
	"errors"
	"io/fs"
	"path/filepath"
	"sort"
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

func TestCommittedMigrationFingerprintSurvivesLaterFailure(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	if err := ensureMetadata(ctx, db); err != nil {
		t.Fatal(err)
	}
	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(names)
	for _, name := range names {
		if name >= "0024" {
			break
		}
		contents, err := files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations(name,checksum) VALUES (?,?)`, name, checksum(contents)); err != nil {
			t.Fatal(err)
		}
	}
	fingerprint, err := schemaFingerprint(ctx, db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO schema_state VALUES ('schema_fingerprint',?)`, fingerprint); err != nil {
		t.Fatal(err)
	}
	interrupted := errors.New("interrupted after previous migration committed")
	err = RunWithHook(ctx, db, func(_ context.Context, _ *sql.Tx, name string) error {
		if name == "0025_remove_notes.sql" {
			return interrupted
		}
		return nil
	})
	if !errors.Is(err, interrupted) {
		t.Fatalf("RunWithHook error = %v, want interruption", err)
	}
	if err := verifyStoredFingerprint(ctx, db); err != nil {
		t.Fatalf("committed 0024 has stale metadata: %v", err)
	}
	if err := Run(ctx, db); err != nil {
		t.Fatalf("restart must resume the remaining migrations: %v", err)
	}
}
