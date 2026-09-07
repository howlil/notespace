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
	if err := store.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil || count != 11 {
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
