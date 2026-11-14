package sqlite

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	backupquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/backup"
	workspacequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/workspace"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"path/filepath"
	"sync"
	"testing"
)

func TestConcurrentSavesHaveExactlyOneWinner(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := workspacepkg.NewService(store).Create(ctx, "Concurrency")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, title := range []string{"first tab", "second tab"} {
		wg.Add(1)
		go func(title string) {
			defer wg.Done()
			_, err := store.Update(ctx, p.ID, workspacepkg.Update{Title: title, Document: p.Document, Canvas: p.Canvas, SplitRatio: .5, Version: 1})
			results <- err
		}(title)
	}
	wg.Wait()
	close(results)
	wins, conflicts := 0, 0
	for err := range results {
		if err == nil {
			wins++
		} else if errors.Is(err, workspacepkg.ErrConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("wins=%d conflicts=%d", wins, conflicts)
	}
	var mode string
	if err := store.db.QueryRow(`PRAGMA journal_mode`).Scan(&mode); err != nil || mode != "wal" {
		t.Fatalf("WAL: %s %v", mode, err)
	}
}

func TestAutosaveDoesNotCreatePeriodicHistoryCheckpoints(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "history-policy.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := workspacepkg.NewService(store).Create(ctx, "History policy")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := store.Update(ctx, p.ID, workspacepkg.Update{
		Title: p.Title, Document: p.Document, Notes: p.Notes, Canvas: p.Canvas,
		References: p.References, SplitRatio: .7, Version: p.Version,
	}); err != nil {
		t.Fatal(err)
	}
	updatedDocument := p.Document
	updatedDocument.Data = []byte(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"new content"}]}]}`)
	if _, err := store.Update(ctx, p.ID, workspacepkg.Update{
		Title: p.Title, Document: updatedDocument, Notes: p.Notes, Canvas: p.Canvas,
		References: p.References, SplitRatio: .7, Version: p.Version + 1,
	}); err != nil {
		t.Fatal(err)
	}

	entries, err := store.ListHistory(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("creation baseline entries = %d, want 1", len(entries))
	}
	var payloadRows int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_history_payload WHERE history_id=?`, entries[0].ID).Scan(&payloadRows); err != nil {
		t.Fatal(err)
	}
	if payloadRows != 1 {
		t.Fatalf("creation baseline payload rows = %d, want 1", payloadRows)
	}

	// Even if the retained baseline is old, autosave must not create a new
	// checkpoint. History is no longer part of the normal editing write path.
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_history SET created_at=? WHERE id=?`, "2020-01-01T00:00:00Z", entries[0].ID); err != nil {
		t.Fatal(err)
	}
	checkpointDocument := updatedDocument
	checkpointDocument.Data = []byte(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"not checkpointed"}]}]}`)
	if _, err := store.Update(ctx, p.ID, workspacepkg.Update{
		Title: p.Title, Document: checkpointDocument, Notes: p.Notes, Canvas: p.Canvas,
		References: p.References, SplitRatio: .7, Version: p.Version + 2,
	}); err != nil {
		t.Fatal(err)
	}
	entries, err = store.ListHistory(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("autosave created history rows = %d, want creation baseline only", len(entries))
	}
	snapshot, err := store.GetHistory(ctx, p.ID, entries[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if string(snapshot.Document.Data) != string(p.Document.Data) {
		t.Fatalf("creation baseline changed = %s, want %s", snapshot.Document.Data, p.Document.Data)
	}
}

func TestWorkspaceTrashRemovesActiveCheckpointHistory(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "history-delete.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := workspacepkg.NewService(store).Create(ctx, "Delete history")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, p.ID, p.Version); err != nil {
		t.Fatal(err)
	}
	entries, err := store.ListHistory(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("deleted workspace history rows = %d, want 0", len(entries))
	}
	var payloadRows int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_history_payload`).Scan(&payloadRows); err != nil {
		t.Fatal(err)
	}
	if payloadRows != 0 {
		t.Fatalf("orphaned compressed payload rows = %d, want 0", payloadRows)
	}
}

func TestWorkspaceTrashReturnsStorageErrorWithoutPanicking(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "delete-error.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := workspacepkg.NewService(store).Create(ctx, "Delete failure")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `CREATE TRIGGER block_project_delete BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT, 'delete blocked'); END`); err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, p.ID, p.Version); err == nil {
		t.Fatal("trash should return the SQLite trigger error")
	}
	if _, err := store.Get(ctx, p.ID); err != nil {
		t.Fatalf("workspace should remain after failed trash: %v", err)
	}
	entries, err := store.ListHistory(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Fatal("trash transaction should roll back creation-baseline removal")
	}
}

func TestHistoryReadsLegacy0006Rows(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "legacy-history.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := workspacepkg.NewService(store).Create(ctx, "Legacy history")
	if err != nil {
		t.Fatal(err)
	}
	entries, err := store.ListHistory(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}

	document, _ := json.Marshal(p.Document)
	notes, _ := json.Marshal(p.Notes)
	canvas, _ := json.Marshal(p.Canvas)
	references, _ := json.Marshal(p.References)
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_history SET document_state=?,notes_state=?,canvas_state=?,references_state=? WHERE id=?`, document, notes, canvas, references, entries[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `DELETE FROM workspace_history_payload WHERE history_id=?`, entries[0].ID); err != nil {
		t.Fatal(err)
	}
	snapshot, err := store.GetHistory(ctx, p.ID, entries[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if string(snapshot.Document.Data) != string(p.Document.Data) || len(snapshot.Notes) != len(p.Notes) {
		t.Fatalf("legacy snapshot was not restored: %+v", snapshot)
	}
}

func TestRetiredNotesMigrationScrubsHistoryAndCanvasCount(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "retired-notes.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	p, err := workspacepkg.NewService(store).Create(ctx, "Retired notes")
	if err != nil {
		t.Fatal(err)
	}
	canvas := canvasWithRetiredNoteArtifact(false)
	encodedCanvas, err := json.Marshal(canvas)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := store.ListHistory(ctx, p.ID)
	if err != nil || len(entries) != 1 {
		t.Fatalf("history entries = %+v err=%v", entries, err)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_canvas SET canvas_state=?,element_count=? WHERE workspace_id=?`, encodedCanvas, 1, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_history SET canvas_state=? WHERE id=?`, encodedCanvas, entries[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `DELETE FROM workspace_history_payload WHERE history_id=?`, entries[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE projects SET references_state=? WHERE id=?`, `["legacy-reference"]`, p.ID); err != nil {
		t.Fatal(err)
	}
	const recordedNoteMigrationChecksum = "a720ac182f7ca06542bd4a91b64827f3d7525d75f5b3d6193e36684dbc8d4c41"
	if _, err := store.db.ExecContext(ctx, `UPDATE schema_migrations SET checksum=? WHERE name='0025_remove_notes.sql'`, recordedNoteMigrationChecksum); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name>=?`, backupquery.RetiredNotesMigration); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	var retainedNoteMigrationChecksum string
	if err := store.db.QueryRowContext(ctx, `SELECT checksum FROM schema_migrations WHERE name='0025_remove_notes.sql'`).Scan(&retainedNoteMigrationChecksum); err != nil || retainedNoteMigrationChecksum != recordedNoteMigrationChecksum {
		t.Fatalf("startup should retain the known local checksum: %q, %v", retainedNoteMigrationChecksum, err)
	}
	var elementCount int
	if err := store.db.QueryRowContext(ctx, `SELECT element_count FROM workspace_canvas WHERE workspace_id=?`, p.ID).Scan(&elementCount); err != nil {
		t.Fatal(err)
	}
	if elementCount != 0 {
		t.Fatalf("retired-only Canvas element_count = %d, want 0", elementCount)
	}
	page, err := workspacepkg.NewService(store).ListWorkspaces(ctx, workspacepkg.WorkspaceQuery{HasCanvas: true, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 0 {
		t.Fatalf("retired-only Canvas returned by HasCanvas query: %+v", page.Items)
	}
	snapshot, err := store.GetHistory(ctx, p.ID, entries[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(snapshot.Canvas.Data, []byte("notespaceNoteArtifact")) {
		t.Fatalf("legacy history retained retired Canvas artifact: %s", snapshot.Canvas.Data)
	}
	backup, err := store.exportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(backup, []byte("notespaceNoteArtifact")) || bytes.Contains(backup, []byte("legacy-reference")) {
		t.Fatalf("retired payload survived backup: %s", backup)
	}
}

func TestRetiredNotesMigrationPreservesModernHistoryPayload(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "retired-notes-modern-history.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	p, err := workspacepkg.NewService(store).Create(ctx, "Modern history")
	if err != nil {
		t.Fatal(err)
	}
	entries, err := store.ListHistory(ctx, p.ID)
	if err != nil || len(entries) != 1 {
		t.Fatalf("history entries = %+v err=%v", entries, err)
	}
	snapshot, err := store.GetHistory(ctx, p.ID, entries[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	snapshot.Document.Data = []byte(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"legacy document"}]}]}`)
	snapshot.Notes = []workspacepkg.Note{{ID: "legacy-note", Title: "Legacy", Document: backupquery.EmptyDocumentSnapshot()}}
	snapshot.References = []workspacepkg.Reference{{ID: "legacy-reference", BlockID: "block", ElementID: "element"}}
	snapshot.Canvas = canvasWithRetiredNoteArtifact(true)
	payload, hash, err := workspacequery.EncodeHistoryPayload(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_history_payload SET content_hash=?,codec=?,payload=?,payload_size=? WHERE history_id=?`, hash, "zlib-json-v1", payload, len(payload), snapshot.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name>=?`, backupquery.RetiredNotesMigration); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	got, err := store.GetHistory(ctx, p.ID, snapshot.ID)
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Document.Data) != string(backupquery.EmptyDocumentSnapshot().Data) || len(got.Notes) != 0 || len(got.References) != 0 {
		t.Fatalf("retired history fields survived: %+v", got)
	}
	if bytes.Contains(got.Canvas.Data, []byte("notespaceNoteArtifact")) || !bytes.Contains(got.Canvas.Data, []byte("keep-me")) {
		t.Fatalf("modern Canvas payload was not scrubbed without data loss: %s", got.Canvas.Data)
	}
	var payloadRows int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_history_payload WHERE history_id=?`, snapshot.ID).Scan(&payloadRows); err != nil {
		t.Fatal(err)
	}
	if payloadRows != 1 {
		t.Fatalf("modern history payload rows = %d, want 1", payloadRows)
	}
	var storedHash string
	var storedPayload []byte
	if err := store.db.QueryRowContext(ctx, `SELECT content_hash,payload FROM workspace_history_payload WHERE history_id=?`, snapshot.ID).Scan(&storedHash, &storedPayload); err != nil {
		t.Fatal(err)
	}
	wantHash, err := workspacequery.HistoryAuthoredHash(got)
	if err != nil {
		t.Fatal(err)
	}
	if storedHash != wantHash {
		t.Fatalf("re-encoded history hash = %s, want %s", storedHash, wantHash)
	}
	var decoded workspacepkg.HistorySnapshot
	if err := workspacequery.DecodeHistoryPayload("zlib-json-v1", storedPayload, &decoded); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(decoded.Canvas.Data, []byte("notespaceNoteArtifact")) || !bytes.Contains(decoded.Canvas.Data, []byte("keep-me")) {
		t.Fatalf("stored payload was not re-encoded with safe Canvas: %s", decoded.Canvas.Data)
	}
}

func TestRetiredNotesMigrationProcessesAllHistoryPayloads(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "retired-notes-history-batch.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	service := workspacepkg.NewService(store)
	type historyFixture struct {
		workspaceID string
		historyID   string
	}
	fixtures := make([]historyFixture, 0, 32)
	for i := 0; i < 32; i++ {
		project, err := service.Create(ctx, "Modern history batch")
		if err != nil {
			t.Fatal(err)
		}
		entries, err := store.ListHistory(ctx, project.ID)
		if err != nil || len(entries) != 1 {
			t.Fatalf("history entries for %s = %+v err=%v", project.ID, entries, err)
		}
		snapshot, err := store.GetHistory(ctx, project.ID, entries[0].ID)
		if err != nil {
			t.Fatal(err)
		}
		snapshot.Document.Data = []byte(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"legacy document"}]}]}`)
		snapshot.Notes = []workspacepkg.Note{{ID: "legacy-note", Title: "Legacy", Document: backupquery.EmptyDocumentSnapshot()}}
		snapshot.References = []workspacepkg.Reference{{ID: "legacy-reference", BlockID: "block", ElementID: "element"}}
		snapshot.Canvas = canvasWithRetiredNoteArtifact(true)
		payload, hash, err := workspacequery.EncodeHistoryPayload(snapshot)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := store.db.ExecContext(ctx, `UPDATE workspace_history_payload SET content_hash=?,codec=?,payload=?,payload_size=? WHERE history_id=?`, hash, "zlib-json-v1", payload, len(payload), snapshot.ID); err != nil {
			t.Fatal(err)
		}
		fixtures = append(fixtures, historyFixture{workspaceID: project.ID, historyID: snapshot.ID})
	}
	if _, err := store.db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name>=?`, backupquery.RetiredNotesMigration); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	for _, fixture := range fixtures {
		got, err := store.GetHistory(ctx, fixture.workspaceID, fixture.historyID)
		if err != nil {
			t.Fatal(err)
		}
		if len(got.Notes) != 0 || len(got.References) != 0 || bytes.Contains(got.Canvas.Data, []byte("notespaceNoteArtifact")) || !bytes.Contains(got.Canvas.Data, []byte("keep-me")) {
			t.Fatalf("retired fields survived for history %s: %+v", fixture.historyID, got)
		}
	}
	var payloadRows int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_history_payload`).Scan(&payloadRows); err != nil {
		t.Fatal(err)
	}
	if payloadRows != len(fixtures) {
		t.Fatalf("history payload rows = %d, want %d", payloadRows, len(fixtures))
	}
}

func TestRetiredNotesMigrationRollsBackMalformedHistoryPayload(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "retired-notes-malformed-history.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	p, err := workspacepkg.NewService(store).Create(ctx, "Malformed history")
	if err != nil {
		t.Fatal(err)
	}
	entries, err := store.ListHistory(ctx, p.ID)
	if err != nil || len(entries) != 1 {
		t.Fatalf("history entries = %+v err=%v", entries, err)
	}
	corrupt := []byte("not-zlib")
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_history_payload SET content_hash=?,codec=?,payload=?,payload_size=? WHERE history_id=?`, "before", "zlib-json-v1", corrupt, len(corrupt), entries[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE projects SET references_state=? WHERE id=?`, `["must-survive"]`, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name>=?`, backupquery.RetiredNotesMigration); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	if _, err := Open(ctx, path); err == nil {
		t.Fatal("malformed history migration unexpectedly succeeded")
	} else if !bytes.Contains([]byte(err.Error()), []byte("verified pre-upgrade snapshot retained")) {
		t.Fatalf("migration error omitted recovery path: %v", err)
	}
	db, err := sql.Open("sqlite", filepath.ToSlash(path)+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var references string
	if err := db.QueryRowContext(ctx, `SELECT references_state FROM projects WHERE id=?`, p.ID).Scan(&references); err != nil {
		t.Fatal(err)
	}
	if references != `["must-survive"]` {
		t.Fatalf("partial migration changed references_state = %s", references)
	}
	var payload []byte
	if err := db.QueryRowContext(ctx, `SELECT payload FROM workspace_history_payload WHERE history_id=?`, entries[0].ID).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(payload, corrupt) {
		t.Fatalf("failed migration changed malformed payload = %q", payload)
	}
	var migrationCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE name=?`, backupquery.RetiredNotesMigration).Scan(&migrationCount); err != nil {
		t.Fatal(err)
	}
	if migrationCount != 0 {
		t.Fatal("failed history migration was recorded")
	}
}

func TestRetiredNotesMigrationRollsBackMalformedCanvas(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "retired-notes-malformed.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	p, err := workspacepkg.NewService(store).Create(ctx, "Malformed Canvas")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_canvas SET canvas_state=? WHERE workspace_id=?`, `{"format":"excalidraw","version":1,"data":{"elements":[1],"appState":{},"files":{}}}`, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE projects SET references_state=? WHERE id=?`, `["must-survive"]`, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name>=?`, backupquery.RetiredNotesMigration); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	if _, err := Open(ctx, path); err == nil {
		t.Fatal("malformed Canvas migration unexpectedly succeeded")
	} else if !bytes.Contains([]byte(err.Error()), []byte("verified pre-upgrade snapshot retained")) {
		t.Fatalf("migration error omitted recovery path: %v", err)
	}

	db, err := sql.Open("sqlite", filepath.ToSlash(path)+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var references string
	if err := db.QueryRowContext(ctx, `SELECT references_state FROM projects WHERE id=?`, p.ID).Scan(&references); err != nil {
		t.Fatal(err)
	}
	if references != `["must-survive"]` {
		t.Fatalf("partial migration changed references_state = %s", references)
	}
	var migrationCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE name=?`, backupquery.RetiredNotesMigration).Scan(&migrationCount); err != nil {
		t.Fatal(err)
	}
	if migrationCount != 0 {
		t.Fatal("failed retirement migration was recorded")
	}
	if files := migrationRecoveryFiles(t, path); len(files) != 1 {
		t.Fatalf("expected one recovery snapshot, got %v", files)
	}
}

func TestRetiredNotesMigrationPreservesTrashedCanvas(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "retired-notes-trash.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()
	service := workspacepkg.NewService(store)
	created, err := service.Create(ctx, "Trashed canvas")
	if err != nil {
		t.Fatal(err)
	}
	canvas := canvasWithRetiredNoteArtifact(true)
	if _, err := service.UpdateCanvas(ctx, created.ID, workspacepkg.CanvasUpdate{Canvas: canvas, Version: created.CanvasVersion}); err != nil {
		t.Fatal(err)
	}
	current, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, created.ID, current.Version); err != nil {
		t.Fatal(err)
	}
	plantRetiredNoteTrash(t, store, created.ID, canvas)
	title, deletedAt, _ := trashIdentity(t, store, created.ID)

	store = reopenRetiredNotesMigration(t, store, path)

	gotTitle, gotDeletedAt, payload := trashIdentity(t, store, created.ID)
	if gotTitle != title || gotDeletedAt != deletedAt {
		t.Fatalf("trash identity = %s %s, want %s %s", gotTitle, gotDeletedAt, title, deletedAt)
	}
	var envelope backupquery.WorkspaceEnvelope
	if err := backupquery.DecodeTrashEnvelope(payload, &envelope); err != nil {
		t.Fatal(err)
	}
	if len(envelope.Project.Notes) != 0 || len(envelope.Project.References) != 0 {
		t.Fatalf("retired trash fields survived: notes=%d references=%d", len(envelope.Project.Notes), len(envelope.Project.References))
	}
	if bytes.Contains(envelope.Project.Canvas.Data, []byte("notespaceNoteArtifact")) || !bytes.Contains(envelope.Project.Canvas.Data, []byte("keep-me")) {
		t.Fatalf("trash canvas was not scrubbed: %s", envelope.Project.Canvas.Data)
	}
	for _, checkpoint := range envelope.History {
		if len(checkpoint.Notes) != 0 || len(checkpoint.References) != 0 || bytes.Contains(checkpoint.Canvas.Data, []byte("notespaceNoteArtifact")) || !bytes.Contains(checkpoint.Canvas.Data, []byte("keep-me")) {
			t.Fatalf("trash history was not scrubbed: %+v", checkpoint)
		}
	}
	restored, err := store.RestoreTrashedWorkspace(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Title != title || len(restored.Notes) != 0 {
		t.Fatalf("restored workspace = %+v", restored)
	}
	state, err := store.GetCanvasState(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(state.Canvas.Data, []byte("notespaceNoteArtifact")) || !bytes.Contains(state.Canvas.Data, []byte("keep-me")) {
		t.Fatalf("restored canvas = %s", state.Canvas.Data)
	}
}

func TestRetiredNotesMigrationPreservesCanvasOnlyTrash(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "retired-notes-canvas-trash.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()
	service := workspacepkg.NewService(store)
	created, err := service.Create(ctx, "Canvas only trash")
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(map[string]any{
		"elements": []map[string]any{{"id": "keep-me", "type": "rectangle"}},
		"appState": map[string]any{},
		"files":    map[string]any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	canvas := workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: data}
	if _, err := service.UpdateCanvas(ctx, created.ID, workspacepkg.CanvasUpdate{Canvas: canvas, Version: created.CanvasVersion}); err != nil {
		t.Fatal(err)
	}
	current, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, created.ID, current.Version); err != nil {
		t.Fatal(err)
	}
	title, deletedAt, _ := trashIdentity(t, store, created.ID)

	store = reopenRetiredNotesMigration(t, store, path)

	gotTitle, gotDeletedAt, payload := trashIdentity(t, store, created.ID)
	if gotTitle != title || gotDeletedAt != deletedAt {
		t.Fatalf("trash identity = %s %s, want %s %s", gotTitle, gotDeletedAt, title, deletedAt)
	}
	var envelope backupquery.WorkspaceEnvelope
	if err := backupquery.DecodeTrashEnvelope(payload, &envelope); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(envelope.Project.Canvas.Data, []byte("notespaceNoteArtifact")) || !bytes.Contains(envelope.Project.Canvas.Data, []byte("keep-me")) {
		t.Fatalf("canvas-only trash changed: %s", envelope.Project.Canvas.Data)
	}
	if _, err := store.RestoreTrashedWorkspace(ctx, created.ID); err != nil {
		t.Fatal(err)
	}
	state, err := store.GetCanvasState(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(state.Canvas.Data, []byte("keep-me")) {
		t.Fatalf("restored canvas-only trash = %s", state.Canvas.Data)
	}
}

func TestRetiredNotesMigrationRollsBackMalformedTrash(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "retired-notes-malformed-trash.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	created, err := workspacepkg.NewService(store).Create(ctx, "Malformed trash")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, created.ID, created.Version); err != nil {
		t.Fatal(err)
	}
	corrupt := []byte("not-a-trash-envelope")
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_trash SET payload=? WHERE id=?`, corrupt, created.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name>=?`, backupquery.RetiredNotesMigration); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	if _, err := Open(ctx, path); err == nil {
		t.Fatal("malformed trash migration unexpectedly succeeded")
	} else if !bytes.Contains([]byte(err.Error()), []byte("decode trash envelope")) || !bytes.Contains([]byte(err.Error()), []byte("verified pre-upgrade snapshot retained")) {
		t.Fatalf("migration error = %v", err)
	}

	db, err := sql.Open("sqlite", filepath.ToSlash(path)+"?mode=ro")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var payload []byte
	if err := db.QueryRowContext(ctx, `SELECT payload FROM workspace_trash WHERE id=?`, created.ID).Scan(&payload); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(payload, corrupt) {
		t.Fatalf("failed migration changed trash payload = %q", payload)
	}
	var migrationCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE name=?`, backupquery.RetiredNotesMigration).Scan(&migrationCount); err != nil {
		t.Fatal(err)
	}
	if migrationCount != 0 {
		t.Fatal("failed trash migration was recorded")
	}
	if files := migrationRecoveryFiles(t, path); len(files) != 1 {
		t.Fatalf("expected one recovery snapshot, got %v", files)
	}
}

func trashIdentity(t *testing.T, store *Store, id string) (string, string, []byte) {
	t.Helper()
	var title, deletedAt string
	var payload []byte
	if err := store.db.QueryRowContext(context.Background(), `SELECT title,deleted_at,payload FROM workspace_trash WHERE id=?`, id).Scan(&title, &deletedAt, &payload); err != nil {
		t.Fatal(err)
	}
	return title, deletedAt, payload
}

func plantRetiredNoteTrash(t *testing.T, store *Store, id string, canvas workspacepkg.Snapshot) {
	t.Helper()
	ctx := context.Background()
	var raw []byte
	if err := store.db.QueryRowContext(ctx, `SELECT payload FROM workspace_trash WHERE id=?`, id).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var envelope backupquery.WorkspaceEnvelope
	if err := backupquery.DecodeTrashEnvelope(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	note := workspacepkg.Note{ID: "legacy-note", Title: "Legacy", Document: backupquery.EmptyDocumentSnapshot()}
	reference := workspacepkg.Reference{ID: "legacy-reference", BlockID: "block", ElementID: "element"}
	envelope.Project.Notes = []workspacepkg.Note{note}
	envelope.Project.References = []workspacepkg.Reference{reference}
	envelope.Project.Canvas = canvas
	for i := range envelope.History {
		envelope.History[i].Notes = []workspacepkg.Note{note}
		envelope.History[i].References = []workspacepkg.Reference{reference}
		envelope.History[i].Canvas = canvas
	}
	encoded, err := backupquery.EncodeTrashEnvelope(envelope)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_trash SET payload=? WHERE id=?`, encoded, id); err != nil {
		t.Fatal(err)
	}
}

func reopenRetiredNotesMigration(t *testing.T, store *Store, path string) *Store {
	t.Helper()
	ctx := context.Background()
	if _, err := store.db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name>=?`, backupquery.RetiredNotesMigration); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	return reopened
}

func canvasWithRetiredNoteArtifact(keepUnrelated bool) workspacepkg.Snapshot {
	elements := []map[string]any{{
		"id":         "retired-note",
		"customData": map[string]any{"notespaceNoteArtifact": true},
	}}
	if keepUnrelated {
		elements = append(elements, map[string]any{"id": "keep-me", "type": "rectangle"})
	}
	data, _ := json.Marshal(map[string]any{
		"elements": elements,
		"appState": map[string]any{},
		"files":    map[string]any{},
	})
	return workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: data}
}
