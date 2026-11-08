package migrations

import (
	"bytes"
	"context"
	"database/sql"
	"io/fs"
	"sort"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func TestAppliedMigrationChecksumsSurviveLineEndingChanges(t *testing.T) {
	for _, lineEnding := range []struct {
		name  string
		value []byte
	}{
		{name: "LF", value: []byte("\n")},
		{name: "CRLF", value: []byte("\r\n")},
	} {
		t.Run(lineEnding.name, func(t *testing.T) {
			ctx := context.Background()
			db := openTestDB(t)
			if err := Run(ctx, db); err != nil {
				t.Fatal(err)
			}
			names, err := fs.Glob(files, "*.sql")
			if err != nil {
				t.Fatal(err)
			}
			recorded := make(map[string]string, len(names))
			for _, name := range names {
				content, err := files.ReadFile(name)
				if err != nil {
					t.Fatal(err)
				}
				lf := bytes.ReplaceAll(content, []byte("\r\n"), []byte("\n"))
				recorded[name] = checksum(bytes.ReplaceAll(lf, []byte("\n"), lineEnding.value))
				if _, err := db.ExecContext(ctx, `UPDATE schema_migrations SET checksum=? WHERE name=?`, recorded[name], name); err != nil {
					t.Fatal(err)
				}
			}
			inspection, err := Inspect(ctx, db)
			if err != nil || inspection.NeedsMigration {
				t.Fatalf("line ending change must preserve current migration history: %+v, %v", inspection, err)
			}
			if err := Run(ctx, db); err != nil {
				t.Fatalf("restart after line ending change: %v", err)
			}
			for name, want := range recorded {
				var got string
				if err := db.QueryRowContext(ctx, `SELECT checksum FROM schema_migrations WHERE name=?`, name).Scan(&got); err != nil {
					t.Fatal(err)
				}
				if got != want {
					t.Fatalf("recorded checksum rewritten for %s: got %s, want %s", name, got, want)
				}
			}
		})
	}
}

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
	if err := Run(ctx, db); err == nil || !strings.Contains(err.Error(), "unsupported database schema") {
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
	for _, name := range []string{"0001_projects.sql", "0025_remove_notes.sql"} {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			db := openTestDB(t)
			if err := Run(ctx, db); err != nil {
				t.Fatal(err)
			}
			content, err := files.ReadFile(name)
			if err != nil {
				t.Fatal(err)
			}
			changed := checksum(append(content, []byte("\nSELECT 'modified SQL';\n")...))
			if _, err := db.ExecContext(ctx, `UPDATE schema_migrations SET checksum=? WHERE name=?`, changed, name); err != nil {
				t.Fatal(err)
			}
			if _, err := Inspect(ctx, db); err == nil || !strings.Contains(err.Error(), "checksum changed") {
				t.Fatalf("modified migration must be rejected, got %v", err)
			}
			if err := Run(ctx, db); err == nil || !strings.Contains(err.Error(), "checksum changed") {
				t.Fatalf("modified migration must block startup, got %v", err)
			}
			var recorded string
			if err := db.QueryRowContext(ctx, `SELECT checksum FROM schema_migrations WHERE name=?`, name).Scan(&recorded); err != nil || recorded != changed {
				t.Fatalf("rejected history must remain untouched: %s, %v", recorded, err)
			}
		})
	}
}

func TestKnownLocalNoteRetirementChecksumAllowsFollowupMigration(t *testing.T) {
	const recordedChecksum = "a720ac182f7ca06542bd4a91b64827f3d7525d75f5b3d6193e36684dbc8d4c41"
	const followupMigration = "0026_scrub_retired_note_artifacts.sql"
	ctx := context.Background()
	db := openTestDB(t)
	if err := Run(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE schema_migrations SET checksum=? WHERE name='0025_remove_notes.sql'`, recordedChecksum); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name=?`, followupMigration); err != nil {
		t.Fatal(err)
	}

	inspection, err := Inspect(ctx, db)
	if err != nil || !inspection.NeedsMigration {
		t.Fatalf("known local 0025 checksum should permit the pending follow-up: %+v, %v", inspection, err)
	}
	followupRan := false
	err = RunWithHook(ctx, db, func(_ context.Context, _ *sql.Tx, name string) error {
		followupRan = followupRan || name == followupMigration
		return nil
	})
	if err != nil {
		t.Fatalf("pending follow-up should run with the known local checksum: %v", err)
	}
	if !followupRan {
		t.Fatalf("follow-up migration %s did not run", followupMigration)
	}
	var retainedChecksum string
	if err := db.QueryRowContext(ctx, `SELECT checksum FROM schema_migrations WHERE name='0025_remove_notes.sql'`).Scan(&retainedChecksum); err != nil || retainedChecksum != recordedChecksum {
		t.Fatalf("known historical checksum must remain unchanged: %q, %v", retainedChecksum, err)
	}
	inspection, err = Inspect(ctx, db)
	if err != nil || inspection.NeedsMigration {
		t.Fatalf("schema should be current after follow-up: %+v, %v", inspection, err)
	}
}
