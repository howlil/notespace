package migrations

import (
	"context"
	"database/sql"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
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
		contents, err := fs.ReadFile(files, name)
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

	var parentID sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT parent_id FROM projects WHERE id='legacy-project'`).Scan(&parentID); err != nil {
		t.Fatal(err)
	}
	if parentID.Valid {
		t.Fatalf("legacy project parent_id = %q, want NULL", parentID.String)
	}
	var foreignKeyCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_foreign_key_list('projects') WHERE "table"='projects'`).Scan(&foreignKeyCount); err != nil {
		t.Fatal(err)
	}
	if foreignKeyCount != 1 {
		t.Fatalf("projects self foreign keys = %d, want 1", foreignKeyCount)
	}
	var duplicateAuthoredColumns int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('projects') WHERE name IN ('document_state','notes_state','canvas_state','references_state','split_ratio','notes_revision')`).Scan(&duplicateAuthoredColumns); err != nil {
		t.Fatal(err)
	}
	if duplicateAuthoredColumns != 0 {
		t.Fatalf("legacy authored project columns = %d, want 0", duplicateAuthoredColumns)
	}
	var granularCanvas int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_canvas WHERE workspace_id='legacy-project'`).Scan(&granularCanvas); err != nil {
		t.Fatal(err)
	}
	if granularCanvas != 1 {
		t.Fatalf("Canvas-only migration = canvas:%d, want 1", granularCanvas)
	}
	var retiredTables int
	if err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM sqlite_schema
		WHERE type='table' AND name IN (
			'workspace_notes',
			'workspace_history',
			'workspace_history_payload',
			'capture_items',
			'planning_tasks',
			'workspace_milestones',
			'planning_create_requests',
			'activity_sessions',
			'activity_deleted_sessions'
		)
	`).Scan(&retiredTables); err != nil {
		t.Fatal(err)
	}
	if retiredTables != 0 {
		t.Fatalf("retired tables remaining after migration = %d, want 0", retiredTables)
	}
}

func TestContractRetiredDomainsMigrationPreservesActiveWorkspaces(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "contract-v30.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `PRAGMA foreign_keys=ON`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT)`); err != nil {
		t.Fatal(err)
	}

	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(names)
	for _, name := range names {
		if strings.Compare(name, "0031_contract_retired_domains.sql") >= 0 {
			break
		}
		contents, err := fs.ReadFile(files, name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations(name,checksum,applied_at) VALUES (?,?,?)`, name, checksum(contents), "test"); err != nil {
			t.Fatal(err)
		}
	}

	if _, err := db.ExecContext(ctx, `INSERT INTO categories(id,title,created_at,updated_at) VALUES ('cat-1','Study','created','updated')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO projects(id,category_id,title,references_state,split_ratio,created_at,updated_at,version,notes_revision) VALUES ('workspace-1','cat-1','Workspace','[]',0.5,'created','updated',2,4)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO workspace_canvas(workspace_id,canvas_state,updated_at,version) VALUES ('workspace-1','{"version":1,"camera":{"x":0,"y":0,"zoom":1},"elements":[]}','updated',5)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO planning_tasks(id,workspace_id,title,description,position,created_at,updated_at,version) VALUES ('task-1','workspace-1','Retired task','',0,'created','updated',1)`); err != nil {
		t.Fatal(err)
	}

	if err := Run(ctx, db); err != nil {
		t.Fatal(err)
	}

	var title string
	var version int
	if err := db.QueryRowContext(ctx, `SELECT title,version FROM projects WHERE id='workspace-1'`).Scan(&title, &version); err != nil {
		t.Fatal(err)
	}
	var canvasVersion int
	if err := db.QueryRowContext(ctx, `SELECT version FROM workspace_canvas WHERE workspace_id='workspace-1'`).Scan(&canvasVersion); err != nil {
		t.Fatal(err)
	}
	if title != "Workspace" || version != 2 || canvasVersion != 5 {
		t.Fatalf("preserved project = title:%q version:%d canvasVersion:%d", title, version, canvasVersion)
	}
}
