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
	var duplicateAuthoredColumns int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM pragma_table_info('projects') WHERE name IN ('document_state','notes_state','canvas_state')`).Scan(&duplicateAuthoredColumns); err != nil {
		t.Fatal(err)
	}
	if duplicateAuthoredColumns != 0 {
		t.Fatalf("legacy authored project columns = %d, want 0", duplicateAuthoredColumns)
	}
	var granularNotes, granularCanvas int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_notes WHERE workspace_id='legacy-project'`).Scan(&granularNotes); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_canvas WHERE workspace_id='legacy-project'`).Scan(&granularCanvas); err != nil {
		t.Fatal(err)
	}
	if granularNotes != 1 || granularCanvas != 1 {
		t.Fatalf("granular backfill = notes:%d canvas:%d, want 1/1", granularNotes, granularCanvas)
	}
}

func TestUnifiedPlanningTaskMigrationPreservesWorkspaceTasks(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "planning-v17.db"))
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
		if strings.Compare(name, "0018_unified_planning_tasks.sql") >= 0 {
			break
		}
		contents, err := files.ReadFile(name)
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

	if _, err := db.ExecContext(ctx, `INSERT INTO categories(id,title,created_at,updated_at) VALUES ('legacy','Uncategorized','created','updated') ON CONFLICT(id) DO NOTHING`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO projects(id,category_id,title,references_state,split_ratio,created_at,updated_at,version) VALUES ('workspace-1','legacy','Workspace','[]',0.5,'created','updated',1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO workspace_tasks(id,workspace_id,milestone_id,title,description,position,completed_at,created_at,updated_at,version) VALUES ('task-1','workspace-1',NULL,'Keep me','',0,NULL,'created','updated',3)`); err != nil {
		t.Fatal(err)
	}

	if err := Run(ctx, db); err != nil {
		t.Fatal(err)
	}

	var workspaceID, title string
	var version int
	var plannedFor sql.NullString
	if err := db.QueryRowContext(ctx, `SELECT workspace_id,title,planned_for,version FROM planning_tasks WHERE id='task-1'`).Scan(&workspaceID, &title, &plannedFor, &version); err != nil {
		t.Fatal(err)
	}
	if workspaceID != "workspace-1" || title != "Keep me" || plannedFor.Valid || version != 3 {
		t.Fatalf("migrated task = workspace:%q title:%q planned:%v version:%d", workspaceID, title, plannedFor, version)
	}
	var oldTable int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='workspace_tasks'`).Scan(&oldTable); err != nil {
		t.Fatal(err)
	}
	if oldTable != 0 {
		t.Fatal("workspace_tasks table still exists after unified task migration")
	}
}
