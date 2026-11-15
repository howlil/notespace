package sqlite

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/gob"
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/note"
	backupquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/backup"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestTrashCodecReadsPreExtractionGobType(t *testing.T) {
	// Preserve an earlier concrete Go struct layout with retired fields, rather
	// than encoding the current type and only proving a same-version round trip.
	type legacyPlan struct {
		WorkspaceID string
	}
	type legacyHistorySnapshot struct {
		ID string
	}
	type workspaceEnvelope struct {
		Project       workspacepkg.Workspace
		Plan          legacyPlan
		History       []legacyHistorySnapshot
		Assets        []asset.Stored
		NoteInstances []note.Instance
	}
	legacy := workspaceEnvelope{
		Project: workspacepkg.Workspace{
			Summary: workspacepkg.Summary{ID: "legacy", CategoryID: "legacy", Title: "Existing trash", Version: 1},
			Canvas:  workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[]}`)},
		},
		Plan:    legacyPlan{WorkspaceID: "legacy"},
		History: []legacyHistorySnapshot{{ID: "hist-1"}},
		Assets:  []asset.Stored{{ID: "image", WorkspaceID: "legacy", MimeType: "image/png", Data: []byte("png")}},
	}
	var encoded bytes.Buffer
	_, _ = encoded.Write(backupquery.TrashEnvelopeMagic)
	compressed := zlib.NewWriter(&encoded)
	if err := gob.NewEncoder(compressed).Encode(legacy); err != nil {
		t.Fatal(err)
	}
	if err := compressed.Close(); err != nil {
		t.Fatal(err)
	}
	var got backupquery.WorkspaceEnvelope
	if err := backupquery.DecodeTrashEnvelope(encoded.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Project, legacy.Project) || !reflect.DeepEqual(got.Assets, legacy.Assets) {
		t.Fatalf("legacy gob trash payload changed: %+v", got)
	}
}

func TestTrashCodecReadsLegacyJSONEnvelope(t *testing.T) {
	legacy := backupquery.WorkspaceEnvelope{
		Project: workspacepkg.Workspace{
			Summary: workspacepkg.Summary{ID: "legacy-json", CategoryID: "legacy", Title: "Pre-binary trash", Version: 1},
			Canvas:  workspacepkg.Snapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[]}`)},
		},
		Assets: []asset.Stored{{ID: "img-1", WorkspaceID: "legacy-json", MimeType: "image/png", Data: []byte("png")}},
	}
	encoded, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	var got backupquery.WorkspaceEnvelope
	if err := backupquery.DecodeTrashEnvelope(encoded, &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Project, legacy.Project) || !reflect.DeepEqual(got.Assets, legacy.Assets) {
		t.Fatalf("legacy json trash payload changed: %+v", got)
	}
}

func TestRestoreRollsBackAfterBorrowedAssetQueryFails(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "rollback.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	saved, err := service.Create(ctx, "Backup workspace")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image", WorkspaceID: saved.ID, MimeType: "image/png", Data: []byte("png")}); err != nil {
		t.Fatal(err)
	}
	noteResult, err := store.CreateNoteInstance(ctx, saved.ID, note.CreateInstanceRequest{
		ClientRequestID:       "req-rollback-note",
		ClientNoteID:          "note-rollback",
		ClientInstanceID:      "instance-rollback",
		ElementID:             "el-rollback",
		ExpectedCanvasVersion: 1,
		Document:              json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Keep on rollback"}]}]}`),
		Canvas:                note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[{"id":"el-rollback","isDeleted":false,"customData":{"notespaceNote":{"noteId":"note-rollback","instanceId":"instance-rollback"}}}],"appState":{},"files":{}}`)},
		Width:                 240,
		Height:                120,
	})
	if err != nil {
		t.Fatal(err)
	}
	archive, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	current, err := service.Create(ctx, "Keep current workspace")
	if err != nil {
		t.Fatal(err)
	}

	// Fail after restore has deleted the library and inserted Categories/Notes/Workspaces.
	// All capability query packages must share the facade's transaction.
	if _, err := store.db.ExecContext(ctx, `CREATE TRIGGER reject_restore_asset BEFORE INSERT ON workspace_assets BEGIN SELECT RAISE(ABORT, 'injected asset restore failure'); END`); err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupArchive(ctx, archive); err == nil || !strings.Contains(err.Error(), "injected asset restore failure") {
		t.Fatalf("restore error = %v; want the injected mid-write failure", err)
	}
	savedLatest, err := store.Get(ctx, saved.ID)
	if err != nil || savedLatest.Title != saved.Title || savedLatest.CanvasVersion != noteResult.Canvas.Version {
		t.Fatalf("saved workspace after rollback = %+v, %v", savedLatest, err)
	}
	currentLatest, err := store.Get(ctx, current.ID)
	if err != nil || currentLatest.Title != current.Title || currentLatest.Version != current.Version {
		t.Fatalf("current workspace after rollback = %+v, %v; want %+v", currentLatest, err, current)
	}
	gotAsset, err := store.GetAsset(ctx, saved.ID, "image")
	if err != nil || string(gotAsset.Data) != "png" {
		t.Fatalf("asset after rollback = %+v, %v", gotAsset, err)
	}
	gotNote, err := store.GetNote(ctx, noteResult.Note.ID)
	if err != nil || gotNote.ID != noteResult.Note.ID {
		t.Fatalf("note after rollback = %+v, %v", gotNote, err)
	}
}
