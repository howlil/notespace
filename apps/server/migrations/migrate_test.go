package migrations

import (
	"context"
	"database/sql"
	_ "modernc.org/sqlite"
	"path/filepath"
	"testing"
)

func TestFailedMigrationIsNotRecorded(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE projects (id TEXT)`); err != nil {
		t.Fatal(err)
	}
	if err := Run(context.Background(), db); err == nil {
		t.Fatal("expected conflicting schema to fail startup")
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("failed migration recorded: %d %v", count, err)
	}
}

func TestCategoriesMigrationPreservesLegacyProjects(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "legacy.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	for _, name := range []string{"0001_projects.sql", "0002_project_references.sql"} {
		contents, err := files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations(name) VALUES (?)`, name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO projects(id,title,document_state,canvas_state,split_ratio,created_at,updated_at,version,references_state) VALUES ('legacy-project','Legacy','{}','{}',0.5,'created','updated',1,'[]')`); err != nil {
		t.Fatal(err)
	}

	if err := Run(ctx, db); err != nil {
		t.Fatal(err)
	}

	var categoryID string
	if err := db.QueryRowContext(ctx, `SELECT category_id FROM projects WHERE id='legacy-project'`).Scan(&categoryID); err != nil {
		t.Fatal(err)
	}
	if categoryID != "legacy" {
		t.Fatalf("legacy project category_id = %q, want legacy", categoryID)
	}
	var notNull int
	if err := db.QueryRowContext(ctx, `SELECT "notnull" FROM pragma_table_info('projects') WHERE name='category_id'`).Scan(&notNull); err != nil {
		t.Fatal(err)
	}
	if notNull != 1 {
		t.Fatalf("category_id notnull = %d, want 1", notNull)
	}
	var foreignKeyCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_foreign_key_list('projects') WHERE "table"='categories'`).Scan(&foreignKeyCount); err != nil {
		t.Fatal(err)
	}
	if foreignKeyCount != 1 {
		t.Fatalf("projects foreign keys to categories = %d, want 1", foreignKeyCount)
	}
}
