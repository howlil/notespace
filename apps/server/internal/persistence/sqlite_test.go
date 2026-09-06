package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/project"
)

func TestConcurrentSavesHaveExactlyOneWinner(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := (project.Service{Store: store}).Create(ctx, "Concurrency")
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, title := range []string{"first tab", "second tab"} {
		wg.Add(1)
		go func(title string) {
			defer wg.Done()
			_, err := store.Update(ctx, p.ID, project.Update{Title: title, Document: p.Document, Canvas: p.Canvas, SplitRatio: .5, Version: 1})
			results <- err
		}(title)
	}
	wg.Wait()
	close(results)
	wins, conflicts := 0, 0
	for err := range results {
		if err == nil {
			wins++
		} else if errors.Is(err, project.ErrConflict) {
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
	var count int
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil || count != 10 {
		t.Fatalf("migration ledger: %d %v", count, err)
	}
}

func TestHistorySkipsRapidAuthoredAndLayoutOnlyUpdates(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "history-policy.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := (project.Service{Store: store}).Create(ctx, "History policy")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := store.Update(ctx, p.ID, project.Update{
		Title: p.Title, Document: p.Document, Notes: p.Notes, Canvas: p.Canvas,
		References: p.References, SplitRatio: .7, Version: p.Version,
	}); err != nil {
		t.Fatal(err)
	}
	updatedDocument := p.Document
	updatedDocument.Data = []byte(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"new content"}]}]}`)
	if _, err := store.Update(ctx, p.ID, project.Update{
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
		t.Fatalf("history entries = %d, want 1", len(entries))
	}
	var payloadRows int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_history_payload WHERE history_id=?`, entries[0].ID).Scan(&payloadRows); err != nil {
		t.Fatal(err)
	}
	if payloadRows != 1 {
		t.Fatalf("compressed payload rows = %d, want 1", payloadRows)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_history SET created_at=? WHERE id=?`, "2020-01-01T00:00:00Z", entries[0].ID); err != nil {
		t.Fatal(err)
	}
	checkpointDocument := updatedDocument
	checkpointDocument.Data = []byte(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"checkpointed"}]}]}`)
	if _, err := store.Update(ctx, p.ID, project.Update{
		Title: p.Title, Document: checkpointDocument, Notes: p.Notes, Canvas: p.Canvas,
		References: p.References, SplitRatio: .7, Version: p.Version + 2,
	}); err != nil {
		t.Fatal(err)
	}
	entries, err = store.ListHistory(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("history entries after interval = %d, want 2", len(entries))
	}
	snapshot, err := store.GetHistory(ctx, p.ID, entries[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if string(snapshot.Document.Data) != string(checkpointDocument.Data) {
		t.Fatalf("checkpoint document = %s, want %s", snapshot.Document.Data, checkpointDocument.Data)
	}
}

func TestWorkspaceDeleteRemovesCheckpointHistory(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "history-delete.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := (project.Service{Store: store}).Create(ctx, "Delete history")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Delete(ctx, p.ID); err != nil {
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

func TestWorkspaceDeleteReturnsStorageErrorWithoutPanicking(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "delete-error.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := (project.Service{Store: store}).Create(ctx, "Delete failure")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `CREATE TRIGGER block_project_delete BEFORE DELETE ON projects BEGIN SELECT RAISE(ABORT, 'delete blocked'); END`); err != nil {
		t.Fatal(err)
	}
	if err := store.Delete(ctx, p.ID); err == nil {
		t.Fatal("delete should return the SQLite trigger error")
	}
	if _, err := store.Get(ctx, p.ID); err != nil {
		t.Fatalf("workspace should remain after failed delete: %v", err)
	}
	entries, err := store.ListHistory(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Fatal("delete transaction should roll back checkpoint removal")
	}
}

func TestHistoryReadsLegacy0006Rows(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "legacy-history.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := (project.Service{Store: store}).Create(ctx, "Legacy history")
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
