package persistence

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/project"
)

func TestWorkspaceAssetPersistsAcrossReopen(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "notespace.db")
	store, err := Open(ctx, path)
	if err != nil { t.Fatal(err) }
	workspace, err := (project.Service{Store: store}).Create(ctx, "Asset durability")
	if err != nil { t.Fatal(err) }
	want := []byte("image-bytes")
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image-1", WorkspaceID: workspace.ID, MimeType: "image/png", Data: want}); err != nil { t.Fatal(err) }
	if err := store.Close(); err != nil { t.Fatal(err) }

	store, err = Open(ctx, path)
	if err != nil { t.Fatal(err) }
	defer store.Close()
	got, err := store.GetAsset(ctx, workspace.ID, "image-1")
	if err != nil { t.Fatal(err) }
	if string(got.Data) != string(want) || got.MimeType != "image/png" { t.Fatalf("asset mismatch: %#v", got) }
}

func TestIndexedSearchFindsExactBlockContext(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "notespace.db"))
	if err != nil { t.Fatal(err) }
	defer store.Close()
	service := project.Service{Store: store}
	workspace, err := service.Create(ctx, "Search workspace")
	if err != nil { t.Fatal(err) }
	document := project.Snapshot{Format: "tiptap", Version: 1, Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"block-needle"},"content":[{"type":"text","text":"Raft consensus needle"}]}]}`)}
	notes := append([]project.Note(nil), workspace.Notes...)
	notes[0].Document = document
	if _, err := service.Update(ctx, workspace.ID, project.Update{Title: workspace.Title, Document: document, Notes: notes, Canvas: workspace.Canvas, References: []project.Reference{}, SplitRatio: workspace.SplitRatio, Version: workspace.Version}); err != nil { t.Fatal(err) }

	results, err := store.SearchIndexed(ctx, "consensus")
	if err != nil { t.Fatal(err) }
	for _, result := range results {
		if result.Type == "block" && result.WorkspaceID == workspace.ID && result.NoteID == notes[0].ID && result.BlockID == "block-needle" { return }
	}
	t.Fatalf("expected exact block search result, got %#v", results)
}
