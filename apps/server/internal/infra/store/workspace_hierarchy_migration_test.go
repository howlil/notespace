package store

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/domain/archive"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite/migrations"
)

func seedPre0035Database(t *testing.T, dbPath string, seed func(context.Context, *sql.DB) error) {
	t.Helper()
	seedDatabaseBeforeMigration(t, dbPath, migrations.WorkspaceHierarchyMigration, seed)
}

func TestOpenUpgradesCategoriesToWorkspaceHierarchyPreservingIDsCollisionsAssetsNotesAndTrash(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "hierarchy-upgrade.db")
	now := "2026-11-25T10:00:00Z"

	seedPre0035Database(t, dbPath, func(ctx context.Context, db *sql.DB) error {
		for _, stmt := range []struct {
			query string
			args  []any
		}{
			// Ordinary category, empty ordinary category, category colliding with workspace ID, category colliding with trash ID.
			{`INSERT INTO categories(id,title,created_at,updated_at) VALUES (?,?,?,?)`, []any{"cat-systems", "Systems", now, now}},
			{`INSERT INTO categories(id,title,created_at,updated_at) VALUES (?,?,?,?)`, []any{"cat-empty", "Empty Topic", now, now}},
			{`INSERT INTO categories(id,title,created_at,updated_at) VALUES (?,?,?,?)`, []any{"shared-ws-id", "Colliding Workspace Cat", now, now}},
			{`INSERT INTO categories(id,title,created_at,updated_at) VALUES (?,?,?,?)`, []any{"shared-trash-id", "Colliding Trash Cat", now, now}},

			// Workspaces: one in cat-systems, one in 'legacy', one whose ID collides with a category.
			{`INSERT INTO projects(id,category_id,title,created_at,updated_at,version) VALUES (?,?,?,?,?,?)`, []any{"ws-raft", "cat-systems", "Raft", now, now, 3}},
			{`INSERT INTO projects(id,category_id,title,created_at,updated_at,version) VALUES (?,?,?,?,?,?)`, []any{"ws-legacy", "legacy", "Inbox Topic", now, now, 2}},
			{`INSERT INTO projects(id,category_id,title,created_at,updated_at,version) VALUES (?,?,?,?,?,?)`, []any{"shared-ws-id", "shared-ws-id", "Original Workspace", now, now, 4}},

			{`INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at,element_count) VALUES (?,?,?,?,?)`,
				[]any{"ws-raft", `{"format":"excalidraw","version":1,"data":{"elements":[{"id":"el-note-1","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-1","instanceId":"inst-1"}}}],"appState":{},"files":{}}}`, 5, now, 1}},
			{`INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at,element_count) VALUES (?,?,?,?,?)`,
				[]any{"ws-legacy", `{"format":"excalidraw","version":1,"data":{"elements":[],"appState":{},"files":{}}}`, 1, now, 0}},
			{`INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at,element_count) VALUES (?,?,?,?,?)`,
				[]any{"shared-ws-id", `{"format":"excalidraw","version":1,"data":{"elements":[],"appState":{},"files":{}}}`, 1, now, 0}},

			// Shared Canvas Note & placement + Asset
			{`INSERT INTO canvas_notes(id,schema_version,document_state,revision,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
				[]any{"note-1", 1, `{"type":"markdown","text":"# Raft Consensus\n\n![img](/api/workspaces/ws-raft/assets/asset-1)"}`, 2, now, now}},
			{`INSERT INTO canvas_note_instances(id,note_id,workspace_id,element_id,x,y,width,height,compact,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
				[]any{"inst-1", "note-1", "ws-raft", "el-note-1", 10, 20, 300, 160, 0, now, now}},
			{`INSERT INTO workspace_assets(id,workspace_id,mime_type,data,created_at,staged) VALUES (?,?,?,?,?,?)`,
				[]any{"asset-1", "ws-raft", "image/png", []byte("png-data"), now, 0}},
		} {
			if _, err := db.ExecContext(ctx, stmt.query, stmt.args...); err != nil {
				return err
			}
		}

		// Trash record whose ID collides with 'shared-trash-id' category, and belongs to 'cat-systems'.
		trashEnv := domain.WorkspaceEnvelope{
			Project: domain.Workspace{
				WorkspaceSummary: domain.WorkspaceSummary{ID: "shared-trash-id", Title: "Trashed Child", CreatedAt: now, UpdatedAt: now, Version: 1},
				Canvas:           domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)},
				CanvasVersion:    1,
			},
			Assets: []domain.StoredAsset{},
		}
		encodedTrash, err := archive.EncodeTrashEnvelope(trashEnv)
		if err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES (?,?,?,?,?)`,
			"shared-trash-id", "cat-systems", "Trashed Child", now, encodedTrash); err != nil {
			return err
		}
		return nil
	})

	store, err := Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// 1. Verify legacy category redirects.
	if target, found, err := store.ResolveLegacyCategory(ctx, "legacy"); err != nil || !found || target != nil {
		t.Fatalf("ResolveLegacyCategory(legacy) = (%v, %v, %v), want (nil, true, nil)", target, found, err)
	}
	catSysTarget, found, err := store.ResolveLegacyCategory(ctx, "cat-systems")
	if err != nil || !found || catSysTarget == nil || *catSysTarget != "cat-systems" {
		t.Fatalf("ResolveLegacyCategory(cat-systems) = (%v, %v, %v), want cat-systems", catSysTarget, found, err)
	}
	catEmptyTarget, found, err := store.ResolveLegacyCategory(ctx, "cat-empty")
	if err != nil || !found || catEmptyTarget == nil || *catEmptyTarget != "cat-empty" {
		t.Fatalf("ResolveLegacyCategory(cat-empty) = (%v, %v, %v), want cat-empty", catEmptyTarget, found, err)
	}
	collidingWsTarget, found, err := store.ResolveLegacyCategory(ctx, "shared-ws-id")
	if err != nil || !found || collidingWsTarget == nil || *collidingWsTarget == "shared-ws-id" {
		t.Fatalf("ResolveLegacyCategory(shared-ws-id) = (%v, %v, %v), want deterministic non-colliding ID", collidingWsTarget, found, err)
	}
	collidingTrashTarget, found, err := store.ResolveLegacyCategory(ctx, "shared-trash-id")
	if err != nil || !found || collidingTrashTarget == nil || *collidingTrashTarget == "shared-trash-id" {
		t.Fatalf("ResolveLegacyCategory(shared-trash-id) = (%v, %v, %v), want deterministic non-colliding ID", collidingTrashTarget, found, err)
	}

	// 2. Verify migrated Workspaces, Canvas, Assets, Notes, and parent relationships.
	raft, err := store.GetWorkspace(ctx, "ws-raft")
	if err != nil || raft.ParentID == nil || *raft.ParentID != "cat-systems" || raft.Version != 3 || raft.CanvasVersion != 5 {
		t.Fatalf("ws-raft = %+v, err=%v", raft, err)
	}
	legacyWs, err := store.GetWorkspace(ctx, "ws-legacy")
	if err != nil || legacyWs.ParentID != nil || legacyWs.Version != 2 {
		t.Fatalf("ws-legacy = %+v, err=%v", legacyWs, err)
	}
	origWs, err := store.GetWorkspace(ctx, "shared-ws-id")
	if err != nil || origWs.Title != "Original Workspace" || origWs.ParentID == nil || *origWs.ParentID != *collidingWsTarget {
		t.Fatalf("shared-ws-id = %+v, err=%v", origWs, err)
	}
	emptyRoot, err := store.GetWorkspace(ctx, "cat-empty")
	if err != nil || emptyRoot.ParentID != nil || emptyRoot.Title != "Empty Topic" || emptyRoot.CanvasVersion != 1 {
		t.Fatalf("cat-empty = %+v, err=%v", emptyRoot, err)
	}
	asset, err := store.GetAsset(ctx, "ws-raft", "asset-1")
	if err != nil || string(asset.Data) != "png-data" {
		t.Fatalf("asset = %+v, err=%v", asset, err)
	}
	note, err := store.GetNote(ctx, "note-1")
	if err != nil || !strings.Contains(string(note.Document), "Raft Consensus") {
		t.Fatalf("note = %+v, err=%v", note, err)
	}

	// 3. Verify Trash record upgraded and restores under migrated parent.
	trashItems, err := store.ListTrash(ctx)
	if err != nil || len(trashItems) != 1 || trashItems[0].ParentID == nil || *trashItems[0].ParentID != "cat-systems" {
		t.Fatalf("trashItems = %+v, err=%v", trashItems, err)
	}
	restoredTrash, err := store.RestoreTrashedWorkspace(ctx, "shared-trash-id")
	if err != nil || restoredTrash.ParentID == nil || *restoredTrash.ParentID != "cat-systems" || restoredTrash.RestoredToRoot {
		t.Fatalf("restoredTrash = %+v, err=%v", restoredTrash, err)
	}

	// 4. Verify idempotent reopen.
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, dbPath)
	if err != nil {
		t.Fatalf("reopen failed: %v", err)
	}
	defer reopened.Close()
}

func TestOpenRollsBackCorrupt0035MigrationAndRetainsRecoverySnapshot(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "corrupt-0035.db")
	now := "2026-11-25T10:00:00Z"

	seedPre0035Database(t, dbPath, func(ctx context.Context, db *sql.DB) error {
		if _, err := db.ExecContext(ctx, `INSERT INTO projects(id,category_id,title,created_at,updated_at,version) VALUES ('ws-1','legacy','Good',?,?,1)`, now, now); err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at,element_count) VALUES ('ws-1','{"format":"excalidraw","version":1,"data":{"elements":[],"appState":{},"files":{}}}',1,?,0)`, now); err != nil {
			return err
		}
		// Corrupt trash payload forces verifyAndUpgradeWorkspaceHierarchyTx to fail inside 0035.
		_, err := db.ExecContext(ctx, `INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES ('bad-trash','legacy','Corrupt',?,?)`, now, []byte("not-valid-envelope"))
		return err
	})

	if _, err := Open(ctx, dbPath); err == nil || !strings.Contains(err.Error(), ".recovery") {
		t.Fatalf("Open error = %v; want rollback error referencing .recovery snapshot", err)
	}

	// Original database must remain at pre-0035 schema (categories table still intact).
	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer rawDB.Close()
	var catCount int
	if err := rawDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='categories'`).Scan(&catCount); err != nil || catCount != 1 {
		t.Fatalf("rolled-back DB categories table count = %d, err=%v", catCount, err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	foundRecovery := false
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".recovery") {
			foundRecovery = true
		}
	}
	if !foundRecovery {
		t.Fatal("expected .recovery snapshot directory after failed 0035 migration")
	}
}

func TestRestoreLegacyV4BackupConvertsCategoriesToRootWorkspaces(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "v4-restore.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	now := "2026-11-25T10:00:00Z"
	legacyArchive, err := createLegacyV4Zip(t, now)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupArchive(ctx, legacyArchive); err != nil {
		t.Fatalf("RestoreBackupArchive(v4) failed: %v", err)
	}

	target, found, err := store.ResolveLegacyCategory(ctx, "cat-arch")
	if err != nil || !found || target == nil || *target != "cat-arch" {
		t.Fatalf("ResolveLegacyCategory(cat-arch) = (%v, %v, %v)", target, found, err)
	}
	child, err := store.GetWorkspace(ctx, "ws-child")
	if err != nil || child.ParentID == nil || *child.ParentID != "cat-arch" {
		t.Fatalf("ws-child = %+v, err=%v", child, err)
	}
	rootWs, err := store.GetWorkspace(ctx, "ws-uncat")
	if err != nil || rootWs.ParentID != nil {
		t.Fatalf("ws-uncat = %+v, err=%v", rootWs, err)
	}
}

func TestOrphanedTrashedWorkspaceRestoresToRootWithNoticeFlag(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "orphan-restore.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	parent, err := store.CreateWorkspace(ctx, "Parent")
	if err != nil {
		t.Fatal(err)
	}
	child, err := store.CreateWorkspace(ctx, "Child", &parent.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, child.ID, child.Version); err != nil {
		t.Fatal(err)
	}
	refetchedParent, err := store.GetWorkspace(ctx, parent.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, parent.ID, refetchedParent.Version); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteTrashedWorkspace(ctx, parent.ID); err != nil {
		t.Fatal(err)
	}

	restored, err := store.RestoreTrashedWorkspace(ctx, child.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.ParentID != nil || !restored.RestoredToRoot {
		t.Fatalf("orphaned child restore = %+v, want parentId=nil and RestoredToRoot=true", restored)
	}
}

func TestTrashNonEmptyParentBlockedUntilReparented(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "nonempty-parent.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	parent, err := store.CreateWorkspace(ctx, "Parent")
	if err != nil {
		t.Fatal(err)
	}
	child, err := store.CreateWorkspace(ctx, "Child", &parent.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, parent.ID, parent.Version); !errors.Is(err, domain.ErrWorkspaceHasChildren) {
		t.Fatalf("TrashWorkspace(nonempty parent) = %v, want ErrWorkspaceHasChildren", err)
	}
	moved, err := store.ReparentWorkspaceChildren(ctx, parent.ID, nil)
	if err != nil || moved != 1 {
		t.Fatalf("ReparentWorkspaceChildren = (%d, %v), want (1, nil)", moved, err)
	}
	if err := store.TrashWorkspace(ctx, parent.ID, parent.Version); err != nil {
		t.Fatalf("TrashWorkspace(after reparent) = %v", err)
	}
	gotChild, err := store.GetWorkspace(ctx, child.ID)
	if err != nil || gotChild.ParentID != nil {
		t.Fatalf("reparented child = %+v, err=%v", gotChild, err)
	}
}

func createLegacyV4Zip(t *testing.T, now string) ([]byte, error) {
	t.Helper()
	manifest := map[string]any{
		"format":        domain.LibraryBackupFormat,
		"version":       4,
		"schemaVersion": 16,
		"generatedAt":   now,
		"categories": []map[string]any{
			{"id": "legacy", "title": "Uncategorized", "createdAt": now, "updatedAt": now},
			{"id": "cat-arch", "title": "Architecture", "createdAt": now, "updatedAt": now},
		},
		"workspaces": []map[string]any{
			{
				"project": map[string]any{
					"id": "ws-child", "categoryId": "cat-arch", "title": "Child",
					"createdAt": now, "updatedAt": now, "version": 1, "canvasVersion": 1,
					"canvas": map[string]any{"format": "excalidraw", "version": 1, "data": map[string]any{"elements": []any{}, "appState": map[string]any{}, "files": map[string]any{}}},
				},
				"assets": []any{},
			},
			{
				"project": map[string]any{
					"id": "ws-uncat", "categoryId": "legacy", "title": "Uncat",
					"createdAt": now, "updatedAt": now, "version": 1, "canvasVersion": 1,
					"canvas": map[string]any{"format": "excalidraw", "version": 1, "data": map[string]any{"elements": []any{}, "appState": map[string]any{}, "files": map[string]any{}}},
				},
				"assets": []any{},
			},
		},
		"trash": []any{},
		"blobs": []any{},
	}
	raw, err := json.Marshal(manifest)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	f, err := w.Create(archive.ManifestPath)
	if err != nil {
		return nil, err
	}
	if _, err := f.Write(raw); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
