package sqlite

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/gob"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/planning"
	backupquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/backup"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestTrashCodecReadsPreExtractionGobType(t *testing.T) {
	// Preserve the old concrete Go type name and fields, rather than encoding
	// the new type with the new codec and only proving a same-version round trip.
	type workspaceEnvelope struct {
		Project workspace.Workspace
		Plan    planning.Plan
		History []workspace.HistorySnapshot
		Assets  []asset.Stored
	}
	legacy := workspaceEnvelope{
		Project: workspace.Workspace{Summary: workspace.Summary{ID: "legacy", Title: "Existing trash", Version: 1}},
		Assets:  []asset.Stored{{ID: "image", WorkspaceID: "legacy", MimeType: "image/png", Data: []byte("png")}},
	}
	var encoded bytes.Buffer
	encoded.Write(backupquery.TrashEnvelopeMagic)
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
		t.Fatalf("legacy trash payload changed: %+v", got)
	}
}

func TestRestoreRollsBackAfterBorrowedAssetQueryFails(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "rollback.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspace.NewService(store)
	saved, err := service.Create(ctx, "Backup workspace")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image", WorkspaceID: saved.ID, MimeType: "image/png", Data: []byte("png")}); err != nil {
		t.Fatal(err)
	}
	backup, err := store.exportBackupJSONAtomic(ctx)
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
	// Fail after restore has deleted the library and inserted Workspace/history
	// rows. All capability query packages must share the facade's transaction.
	if _, err := store.db.ExecContext(ctx, `CREATE TRIGGER reject_restore_asset BEFORE INSERT ON workspace_assets BEGIN SELECT RAISE(ABORT, 'injected asset restore failure'); END`); err != nil {
		t.Fatal(err)
	}
	for _, attempt := range []struct {
		name    string
		restore func() error
	}{
		{"JSON", func() error { return store.RestoreBackupJSON(ctx, backup) }},
		{"ZIP", func() error { return store.RestoreBackupArchive(ctx, archive) }},
	} {
		t.Run(attempt.name, func(t *testing.T) {
			if err := attempt.restore(); err == nil || !strings.Contains(err.Error(), "injected asset restore failure") {
				t.Fatalf("restore error = %v; want the injected mid-write failure", err)
			}
			for _, expected := range []workspace.Workspace{saved, current} {
				got, err := store.Get(ctx, expected.ID)
				if err != nil || got.Title != expected.Title || got.Version != expected.Version {
					t.Fatalf("workspace after rollback = %+v, %v; want %+v", got, err, expected)
				}
			}
			got, err := store.GetAsset(ctx, saved.ID, "image")
			if err != nil || string(got.Data) != "png" {
				t.Fatalf("asset after rollback = %+v, %v", got, err)
			}
		})
	}
}
