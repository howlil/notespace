package migrations

import (
	"context"
	"database/sql"
	"io/fs"
	"path/filepath"
	"sort"
	"testing"

	_ "modernc.org/sqlite"
)

// The rewrite of rich documents must not release the images they reference, and
// once it is done an image is released only when no Markdown destination uses it.
func TestMarkdownMigrationKeepsReferencedAssetsAndReleasesOrphans(t *testing.T) {
	db, err := sql.Open("sqlite", "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "assets.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	ctx := context.Background()

	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(names)
	if _, err := db.ExecContext(ctx, `CREATE TABLE schema_migrations (name TEXT PRIMARY KEY)`); err != nil {
		t.Fatal(err)
	}
	for _, name := range names {
		if name >= NoteMarkdownMigration {
			break
		}
		contents, err := fs.ReadFile(files, name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations(name) VALUES (?)`, name); err != nil {
			t.Fatal(err)
		}
	}
	for _, statement := range []string{
		`INSERT INTO categories(id,title,created_at,updated_at) VALUES ('cat','Cat','c','c')`,
		`INSERT INTO projects(id,title,created_at,updated_at,version,category_id) VALUES ('w1','W','c','c',1,'cat')`,
		`INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at,staged) VALUES ('w1','img-1','image/png','x','c',0),('w1','img-12','image/png','x','c',0),('w1','img-orphan','image/png','x','c',0)`,
		`INSERT INTO canvas_notes(id,schema_version,document_state,revision,created_at,updated_at) VALUES
		 ('n1',1,'{"type":"doc","content":[{"type":"noteImage","attrs":{"src":"/api/workspaces/w1/assets/img-1","assetId":"img-1"}},{"type":"noteImage","attrs":{"src":"/api/workspaces/w1/assets/img-12","assetId":"img-12"}}]}',1,'c','u')`,
	} {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}

	// Stand-in for the Go conversion that infra/store injects.
	convert := func(ctx context.Context, tx *sql.Tx, name string) error {
		if name != NoteMarkdownMigration {
			return nil
		}
		_, err := tx.ExecContext(ctx, `UPDATE canvas_notes SET document_state='{"type":"markdown","text":"![a](/api/workspaces/w1/assets/img-1)\n\n![b](/api/workspaces/w1/assets/img-12)"}',revision=2 WHERE id='n1'`)
		return err
	}
	if err := RunWithHook(ctx, db, convert); err != nil {
		t.Fatal(err)
	}

	assets := func() map[string]bool {
		rows, err := db.QueryContext(ctx, `SELECT id FROM workspace_assets`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		out := map[string]bool{}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				t.Fatal(err)
			}
			out[id] = true
		}
		return out
	}
	// img-orphan was never referenced and is only swept by the next note write.
	if got := assets(); !got["img-1"] || !got["img-12"] {
		t.Fatalf("conversion released referenced assets: %v", got)
	}

	// Dropping the only reference to img-1 must release img-1 but not img-12.
	if _, err := db.ExecContext(ctx, `UPDATE canvas_notes SET document_state='{"type":"markdown","text":"![b](/api/workspaces/w1/assets/img-12)"}' WHERE id='n1'`); err != nil {
		t.Fatal(err)
	}
	if got := assets(); got["img-1"] || !got["img-12"] || got["img-orphan"] {
		t.Fatalf("after editing, assets = %v, want only img-12 (a1 must not match a12)", got)
	}
}
