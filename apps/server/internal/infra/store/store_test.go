package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite/migrations"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"
)

// --- merged from sqlite_test.go ---

func TestConcurrentSavesHaveExactlyOneWinner(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := store.CreateWorkspace(ctx, "Concurrency")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, title := range []string{"first tab", "second tab"} {
		wg.Add(1)
		go func(title string) {
			defer wg.Done()
			_, err := store.RenameWorkspace(ctx, p.ID, title, &p.Title)
			results <- err
		}(title)
	}
	wg.Wait()
	close(results)
	wins, conflicts := 0, 0
	for err := range results {
		if err == nil {
			wins++
		} else if errors.Is(err, domain.ErrWorkspaceConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("wins=%d conflicts=%d", wins, conflicts)
	}
	var mode string
	if err := store.db.Writer().QueryRow(`PRAGMA journal_mode`).Scan(&mode); err != nil || mode != "wal" {
		t.Fatalf("WAL: %s %v", mode, err)
	}
}

func TestWorkspaceTrashReturnsStorageErrorWithoutPanicking(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "delete-error.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := store.CreateWorkspace(ctx, "Delete failure")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.Writer().ExecContext(ctx, `CREATE TRIGGER block_project_delete BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT, 'delete blocked'); END`); err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, p.ID, p.Version); err == nil {
		t.Fatal("trash should return the SQLite trigger error")
	}
	if _, err := store.GetWorkspace(ctx, p.ID); err != nil {
		t.Fatalf("workspace should remain after failed trash: %v", err)
	}
}

func seedPre0026Database(t *testing.T, dbPath string, seed func(context.Context, *sql.DB) error) {
	t.Helper()
	ctx := context.Background()
	dsn := filepath.ToSlash(dbPath) + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=synchronous(FULL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	if _, err := db.ExecContext(ctx, `CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, checksum TEXT, applied_at TEXT)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `CREATE TABLE schema_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`); err != nil {
		t.Fatal(err)
	}

	migrationsDir := filepath.Join("..", "sqlite", "migrations", "sql")
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") && entry.Name() < migrations.RetiredNotesMigration {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		contents, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, string(contents)); err != nil {
			t.Fatalf("apply %s: %v", name, err)
		}
		sum := sha256.Sum256(contents)
		if _, err := db.ExecContext(ctx, `INSERT INTO schema_migrations(name,checksum,applied_at) VALUES (?,?,'2026-01-01T00:00:00Z')`, name, hex.EncodeToString(sum[:])); err != nil {
			t.Fatal(err)
		}
	}

	if err := seed(ctx, db); err != nil {
		t.Fatal(err)
	}
}

func TestOpenUpgradesFromPre0026ScrubbingRetiredArtifactsWhileKeepingCanvasNotes(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "upgrade-0025.db")
	seedPre0026Database(t, dbPath, func(ctx context.Context, db *sql.DB) error {
		activeCanvas := `{"format":"excalidraw","version":1,"data":{"elements":[{"id":"retired-art","isDeleted":false,"customData":{"notespaceNoteArtifact":{"noteId":"old"}}},{"id":"live-note","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-keep","instanceId":"inst-keep"}}},{"id":"shape-1","isDeleted":false}],"appState":{},"files":{}}}`
		if _, err := db.ExecContext(ctx, `INSERT INTO projects(id,title,split_ratio,created_at,updated_at,version,category_id,references_state,notes_revision) VALUES ('ws-active','Active Workspace',0.5,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',1,'legacy','[]',1)`); err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at,element_count) VALUES ('ws-active',?,1,'2026-01-01T00:00:00Z',3)`, activeCanvas); err != nil {
			return err
		}

		// Legacy pre-binary JSON trash envelope with a retired note artifact + kept shape.
		legacyTrash := domain.WorkspaceEnvelope{
			Project: domain.Workspace{
				WorkspaceSummary: domain.WorkspaceSummary{ID: "ws-json-trash", CategoryID: "legacy", Title: "JSON Trash", CreatedAt: "2026-01-01T00:00:00Z", UpdatedAt: "2026-01-01T00:00:00Z", Version: 1},
				CanvasVersion:    1,
				Canvas: domain.CanvasSnapshot{
					Format:  "excalidraw",
					Version: 1,
					Data:    json.RawMessage(`{"elements":[{"id":"trash-retired","isDeleted":false,"customData":{"notespaceNoteArtifact":{"noteId":"old"}}},{"id":"trash-keep","isDeleted":false}],"appState":{},"files":{}}`),
				},
			},
			Assets: []domain.StoredAsset{},
		}
		legacyJSON, err := json.Marshal(legacyTrash)
		if err != nil {
			return err
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES ('ws-json-trash','legacy','JSON Trash','2026-01-02T00:00:00Z',?)`, legacyJSON); err != nil {
			return err
		}
		return nil
	})

	store, err := Open(ctx, dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	active, err := store.GetWorkspace(ctx, "ws-active")
	if err != nil {
		t.Fatal(err)
	}
	canvasJSON := string(active.Canvas.Data)
	if strings.Contains(canvasJSON, "notespaceNoteArtifact") {
		t.Fatalf("retired artifact survived 0026/0031 upgrade: %s", canvasJSON)
	}
	if !strings.Contains(canvasJSON, `"notespaceNote"`) || !strings.Contains(canvasJSON, `"shape-1"`) {
		t.Fatalf("active Canvas Note or shape stripped during upgrade: %s", canvasJSON)
	}

	var elementCount int
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT element_count FROM workspace_canvas WHERE workspace_id='ws-active'`).Scan(&elementCount); err != nil {
		t.Fatal(err)
	}
	if elementCount != 2 {
		t.Fatalf("element_count after scrub = %d, want 2", elementCount)
	}

	restored, err := store.RestoreTrashedWorkspace(ctx, "ws-json-trash")
	if err != nil {
		t.Fatal(err)
	}
	restoredJSON := string(restored.Canvas.Data)
	if strings.Contains(restoredJSON, "notespaceNoteArtifact") {
		t.Fatalf("retired artifact survived in restored JSON trash: %s", restoredJSON)
	}
	if !strings.Contains(restoredJSON, `"trash-keep"`) {
		t.Fatalf("kept shape missing from restored trash: %s", restoredJSON)
	}
}

func TestOpenRollsBackCorruptPre0026MigrationAndRetainsRecoverySnapshot(t *testing.T) {
	ctx := context.Background()
	for _, tc := range []struct {
		name string
		seed func(context.Context, *sql.DB) error
	}{
		{
			name: "malformed canvas JSON",
			seed: func(ctx context.Context, db *sql.DB) error {
				if _, err := db.ExecContext(ctx, `INSERT INTO projects(id,title,split_ratio,created_at,updated_at,version,category_id,references_state,notes_revision) VALUES ('ws-bad-canvas','Bad Canvas',0.5,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',1,'legacy','[]',1)`); err != nil {
					return err
				}
				// Satisfy SQLite CHECK(json_valid(canvas_state)) with a valid outer JSON envelope
				// whose inner `data` is corrupted ("[]"/non-object or invalid raw elements).
				_, err := db.ExecContext(ctx, `INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at,element_count) VALUES ('ws-bad-canvas','{"format":"excalidraw","version":1,"data":{"elements":[123]}}',1,'2026-01-01T00:00:00Z',0)`)
				return err
			},
		},
		{
			name: "malformed trash payload",
			seed: func(ctx context.Context, db *sql.DB) error {
				_, err := db.ExecContext(ctx, `INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES ('ws-bad-trash','legacy','Bad Trash','2026-01-02T00:00:00Z',?)`, []byte("not-json-or-gob"))
				return err
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			dbPath := filepath.Join(dir, "corrupt-0025.db")
			seedPre0026Database(t, dbPath, tc.seed)

			if _, err := Open(ctx, dbPath); err == nil || !strings.Contains(err.Error(), ".recovery") {
				t.Fatalf("Open error = %v; want rollback error referencing .recovery snapshot", err)
			}

			entries, err := os.ReadDir(dir)
			if err != nil {
				t.Fatal(err)
			}
			foundRecovery := false
			for _, entry := range entries {
				if strings.Contains(entry.Name(), ".recovery") {
					foundRecovery = true
					break
				}
			}
			if !foundRecovery {
				t.Fatalf("expected pre-upgrade .recovery snapshot in %s", dir)
			}

			dsn := filepath.ToSlash(dbPath) + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
			db, err := sql.Open("sqlite", dsn)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			var count int
			if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE name=?`, migrations.RetiredNotesMigration).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != 0 {
				t.Fatalf("migration %s recorded despite rollback (count=%d)", migrations.RetiredNotesMigration, count)
			}
		})
	}
}

// --- merged from dual_pool_test.go ---

// TestDualPoolReadsBypassActiveWriterLock proves that read queries and clean
// search projections run exclusively on the concurrent read-only WAL pool
// without acquiring the single-connection writer pool.
func TestDualPoolReadsBypassActiveWriterLock(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "dual-pool.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	ws, err := store.CreateWorkspace(ctx, "Dual Pool Architecture")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateNoteInstance(ctx, ws.ID, domain.CreateNoteInstanceRequest{
		ClientRequestID:       "req-dual-pool",
		ClientNoteID:          "note-dual-pool",
		ClientInstanceID:      "inst-dual-pool",
		ElementID:             "el-dual-pool",
		ExpectedCanvasVersion: ws.CanvasVersion,
		Document:              json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"wal concurrent reader verification"}]}]}`),
		Canvas:                backupNoteCanvas("el-dual-pool", "note-dual-pool", "inst-dual-pool"),
		X:                     10,
		Y:                     20,
		Width:                 280,
		Height:                160,
	}); err != nil {
		t.Fatal(err)
	}

	// Warm the search projection once so the index is clean.
	initialHits, err := store.Search(ctx, "verification")
	if err != nil {
		t.Fatal(err)
	}
	if len(initialHits) == 0 {
		t.Fatal("expected initial search hit")
	}
	stale, err := store.searchIndexIsStale(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stale {
		t.Fatal("expected search index to be clean immediately after Search")
	}

	// Hold the single writer connection open with an uncommitted write transaction.
	// Because store.db has MaxOpenConns(1), any read that accidentally uses store.db
	// will block until readCtx times out.
	tx, err := store.db.Writer().BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE projects SET updated_at=updated_at WHERE id=?`, ws.ID); err != nil {
		t.Fatal(err)
	}

	readCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if _, err := store.GetWorkspace(readCtx, ws.ID); err != nil {
		t.Fatalf("Get blocked by active writer tx: %v", err)
	}
	if _, err := store.ListWorkspaces(readCtx, domain.WorkspaceQuery{Limit: 10}); err != nil {
		t.Fatalf("ListWorkspaces blocked by active writer tx: %v", err)
	}
	if _, err := store.ListNotes(readCtx, domain.NoteListQuery{Limit: 10}); err != nil {
		t.Fatalf("ListNotes blocked by active writer tx: %v", err)
	}
	hits, err := store.Search(readCtx, "verification")
	if err != nil {
		t.Fatalf("clean Search blocked by active writer tx: %v", err)
	}
	if len(hits) == 0 {
		t.Fatal("expected clean Search to return cached FTS hits while writer is busy")
	}
}

// --- merged from concurrency_test.go ---

func TestVersionedTrashRejectsStaleDelete(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "stale-delete.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := store.CreateWorkspace(ctx, "Initial")
	if err != nil {
		t.Fatal(err)
	}
	updated, err := store.RenameWorkspace(ctx, workspace.ID, "Newer acknowledged state", &workspace.Title)
	if err != nil {
		t.Fatal(err)
	}

	staleVersion := workspace.Version
	if err := store.TrashWorkspace(ctx, workspace.ID, staleVersion); !errors.Is(err, domain.ErrWorkspaceConflict) {
		t.Fatalf("stale delete error = %v, want conflict", err)
	}
	current, err := store.GetWorkspace(ctx, workspace.ID)
	if err != nil {
		t.Fatalf("workspace disappeared after stale delete: %v", err)
	}
	if current.Version != updated.Version || current.Title != updated.Title {
		t.Fatalf("workspace after stale delete = %+v, want version %d title %q", current.WorkspaceSummary, updated.Version, updated.Title)
	}
	var trashCount int
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_trash WHERE id=?`, workspace.ID).Scan(&trashCount); err != nil {
		t.Fatal(err)
	}
	if trashCount != 0 {
		t.Fatalf("stale delete created %d trash rows, want 0", trashCount)
	}

	currentVersion := updated.Version
	if err := store.TrashWorkspace(ctx, workspace.ID, currentVersion); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetWorkspace(ctx, workspace.ID); !errors.Is(err, domain.ErrWorkspaceNotFound) {
		t.Fatalf("current delete get error = %v, want not found", err)
	}
}

func TestDeleteCategoryRejectsTrashedWorkspace(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "category-trash.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	category, err := store.CreateCategory(ctx, "Concurrency")
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := store.CreateWorkspace(ctx, "Owned workspace", category.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, workspace.ID, workspace.Version); err != nil {
		t.Fatal(err)
	}

	if err := store.DeleteCategory(ctx, category.ID); !errors.Is(err, domain.ErrCategoryNotEmpty) {
		t.Fatalf("category delete error = %v, want not empty", err)
	}
	var count int
	if err := store.db.Writer().QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, category.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("category count = %d, want 1", count)
	}
}

func TestRestoreAndPurgeTrashHaveSingleWinner(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "restore-purge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := store.CreateWorkspace(ctx, "Race")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, workspace.ID, workspace.Version); err != nil {
		t.Fatal(err)
	}

	type result struct {
		op  string
		err error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	go func() {
		<-start
		_, err := store.RestoreTrashedWorkspace(ctx, workspace.ID)
		results <- result{op: "restore", err: err}
	}()
	go func() {
		<-start
		results <- result{op: "purge", err: store.DeleteTrashedWorkspace(ctx, workspace.ID)}
	}()
	close(start)

	var winner string
	successes, misses := 0, 0
	for range 2 {
		outcome := <-results
		switch {
		case outcome.err == nil:
			successes++
			winner = outcome.op
		case errors.Is(outcome.err, domain.ErrWorkspaceNotFound):
			misses++
		default:
			t.Fatalf("%s error = %v", outcome.op, outcome.err)
		}
	}
	if successes != 1 || misses != 1 {
		t.Fatalf("successes=%d misses=%d, want one winner and one not-found", successes, misses)
	}

	_, err = store.GetWorkspace(ctx, workspace.ID)
	if winner == "restore" && err != nil {
		t.Fatalf("restored winner workspace missing: %v", err)
	}
	if winner == "purge" && !errors.Is(err, domain.ErrWorkspaceNotFound) {
		t.Fatalf("purged winner workspace error = %v, want not found", err)
	}
}
