package sqlite

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestWorkspaceAssetPersistsAcrossReopen(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notespace.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := (workspace.Service{Store: store}).Create(ctx, "Asset durability")
	if err != nil {
		t.Fatal(err)
	}
	want := []byte("image-bytes")
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image-1", WorkspaceID: workspace.ID, MimeType: "image/png", Data: want}); err != nil {
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
	got, err := store.GetAsset(ctx, workspace.ID, "image-1")
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Data) != string(want) || got.MimeType != "image/png" {
		t.Fatalf("asset mismatch: %#v", got)
	}
}

func TestIndexedSearchFindsExactBlockContext(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "notespace.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	indexed := NewIndexedProjectStore(store)
	service := workspace.Service{Store: indexed}
	workspace, err := service.Create(ctx, "Search workspace")
	if err != nil {
		t.Fatal(err)
	}
	document := workspace.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"block-needle"},"content":[{"type":"text","text":"Raft consensus needle"}]}]}`)}
	notes := append([]workspace.Note(nil), workspace.Notes...)
	notes[0].Document = document
	if _, err := service.Update(ctx, workspace.ID, workspace.Update{Title: workspace.Title, Document: document, Notes: notes, Canvas: workspace.Canvas, References: []workspace.Reference{}, SplitRatio: workspace.SplitRatio, Version: workspace.Version}); err != nil {
		t.Fatal(err)
	}

	results, err := service.Search(ctx, "consensus")
	if err != nil {
		t.Fatal(err)
	}
	for _, result := range results {
		if result.Type == "block" && result.WorkspaceID == workspace.ID && result.NoteID == notes[0].ID && result.BlockID == "block-needle" {
			return
		}
	}
	t.Fatalf("expected exact block search result, got %#v", results)
}

func TestIndexedSearchTreatsQuotesAsPunctuationAndSupportsUnicode(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "search-input.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspace.Service{Store: store}
	workspace, err := service.Create(ctx, "International search")
	if err != nil {
		t.Fatal(err)
	}
	document := workspace.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"unicode-block"},"content":[{"type":"text","text":"Raft consensus 日本語 knowledge"}]}]}`)}
	notes := append([]workspace.Note(nil), workspace.Notes...)
	notes[0].Document = document
	if _, err := service.Update(ctx, workspace.ID, workspace.Update{Title: workspace.Title, Document: document, Notes: notes, Canvas: workspace.Canvas, References: []workspace.Reference{}, SplitRatio: workspace.SplitRatio, Version: workspace.Version}); err != nil {
		t.Fatal(err)
	}

	for _, query := range []string{`"consensus"`, "日本語"} {
		results, err := store.SearchIndexed(ctx, query)
		if err != nil {
			t.Fatalf("search %q: %v", query, err)
		}
		found := false
		for _, result := range results {
			if result.Type == "block" && result.BlockID == "unicode-block" {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("search %q did not return unicode-block: %#v", query, results)
		}
	}
}

func TestExcerptPreservesUnicodeBoundaries(t *testing.T) {
	text := strings.Repeat("界", 80) + " needle " + strings.Repeat("🙂", 80)
	got := excerpt(text, "needle")
	if !utf8.ValidString(got) {
		t.Fatalf("excerpt is invalid UTF-8: %q", got)
	}
	if !strings.Contains(got, "needle") {
		t.Fatalf("excerpt does not contain query: %q", got)
	}
	if utf8.RuneCountInString(got) > 140 {
		t.Fatalf("excerpt has %d runes, want <= 140", utf8.RuneCountInString(got))
	}
}

func TestNoteAutosaveDefersSearchProjectionUntilSearch(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "lazy-search.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	indexed := NewIndexedProjectStore(store)
	service := workspace.Service{Store: indexed}
	workspace, err := service.Create(ctx, "Lazy search")
	if err != nil {
		t.Fatal(err)
	}
	note := workspace.Notes[0]
	document := workspace.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"lazy-block"},"content":[{"type":"text","text":"deferred projection needle"}]}]}`)}
	note, err = service.UpdateNote(ctx, workspace.ID, note.ID, workspace.NoteUpdate{
		Title: note.Title, Document: document, Version: note.Version,
	})
	if err != nil {
		t.Fatal(err)
	}

	var projectRevision, indexedRevision int
	if err := store.db.QueryRowContext(ctx, `SELECT notes_revision FROM projects WHERE id=?`, workspace.ID).Scan(&projectRevision); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRowContext(ctx, `SELECT notes_revision FROM workspace_search_meta WHERE workspace_id=?`, workspace.ID).Scan(&indexedRevision); err != nil {
		t.Fatal(err)
	}
	if indexedRevision == projectRevision {
		t.Fatalf("note autosave rebuilt search synchronously: project=%d index=%d", projectRevision, indexedRevision)
	}

	results, err := service.Search(ctx, "needle")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, result := range results {
		if result.Type == "block" && result.BlockID == "lazy-block" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("lazy search repair missed updated note: %#v", results)
	}
	if err := store.db.QueryRowContext(ctx, `SELECT notes_revision FROM workspace_search_meta WHERE workspace_id=?`, workspace.ID).Scan(&indexedRevision); err != nil {
		t.Fatal(err)
	}
	if indexedRevision != projectRevision {
		t.Fatalf("search did not repair projection: project=%d index=%d", projectRevision, indexedRevision)
	}
}

func TestWorkspaceExistsAndAssetPutAvoidHydratedReadback(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "asset-fast-path.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := (workspace.Service{Store: store}).Create(ctx, "Asset fast path")
	if err != nil {
		t.Fatal(err)
	}
	exists, err := store.WorkspaceExists(ctx, workspace.ID)
	if err != nil || !exists {
		t.Fatalf("workspace exists = %v err=%v", exists, err)
	}
	exists, err = store.WorkspaceExists(ctx, "missing")
	if err != nil || exists {
		t.Fatalf("missing workspace exists = %v err=%v", exists, err)
	}

	stored, err := store.PutAsset(ctx, asset.Stored{
		ID: "image-fast", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("payload"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if stored.ID != "image-fast" || stored.WorkspaceID != workspace.ID || stored.CreatedAt == "" || string(stored.Data) != "payload" {
		t.Fatalf("put result = %#v", stored)
	}
}
