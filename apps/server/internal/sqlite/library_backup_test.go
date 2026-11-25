package sqlite

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/note"
	backupquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/backup"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestWorkspaceTrashRestoresIdentityAndAssets(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "trash.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	category, err := service.CreateCategory(ctx, "Distributed Systems")
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := service.Create(ctx, "Consensus", category.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "diagram", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("png")}); err != nil {
		t.Fatal(err)
	}

	if err := store.TrashWorkspace(ctx, workspace.ID, workspace.Version); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, workspace.ID); !errors.Is(err, workspacepkg.ErrNotFound) {
		t.Fatalf("trashed workspace get error = %v, want not found", err)
	}
	var storedPayload []byte
	if err := store.db.QueryRowContext(ctx, `SELECT payload FROM workspace_trash WHERE id=?`, workspace.ID).Scan(&storedPayload); err != nil {
		t.Fatal(err)
	}
	if json.Valid(storedPayload) {
		t.Fatal("new trash payload is JSON/Base64; want binary compressed envelope")
	}
	trash, err := store.ListTrash(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(trash) != 1 || trash[0].ID != workspace.ID {
		t.Fatalf("trash = %+v", trash)
	}

	restored, err := store.RestoreTrashedWorkspace(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.ID != workspace.ID || restored.CategoryID != category.ID || restored.Title != workspace.Title {
		t.Fatalf("restored workspace = %+v", restored)
	}
	storedAsset, err := store.GetAsset(ctx, workspace.ID, "diagram")
	if err != nil || string(storedAsset.Data) != "png" {
		t.Fatalf("restored asset = %+v err=%v", storedAsset, err)
	}
}

func archiveManifest(t *testing.T, data []byte) []byte {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range reader.File {
		if file.Name != backupquery.ArchiveManifestPath {
			continue
		}
		stream, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(stream)
		_ = stream.Close()
		if err != nil {
			t.Fatal(err)
		}
		return body
	}
	t.Fatal("manifest missing")
	return nil
}

func rewriteArchiveManifest(t *testing.T, data []byte, mutate func(*backupquery.LibraryArchiveManifest)) []byte {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	for _, file := range reader.File {
		stream, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(stream)
		_ = stream.Close()
		if err != nil {
			t.Fatal(err)
		}
		if file.Name == backupquery.ArchiveManifestPath {
			var manifest backupquery.LibraryArchiveManifest
			if err := json.Unmarshal(body, &manifest); err != nil {
				t.Fatal(err)
			}
			mutate(&manifest)
			body, err = json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
		}
		header := file.FileHeader
		target, err := writer.CreateHeader(&header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := target.Write(body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func TestFullLibraryArchiveRestoreRoundTrip(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	category, err := service.CreateCategory(ctx, "Backend")
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := service.Create(ctx, "Postgres", category.ID)
	if err != nil {
		t.Fatal(err)
	}
	assetBytes := []byte("schema-bytes")
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "schema", WorkspaceID: workspace.ID, MimeType: "image/png", Data: assetBytes}); err != nil {
		t.Fatal(err)
	}

	backup, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	manifest := archiveManifest(t, backup)
	var decoded backupquery.LibraryArchiveManifest
	if err := json.Unmarshal(manifest, &decoded); err != nil {
		t.Fatalf("decode archive manifest: %v", err)
	}
	if decoded.Version != backupquery.LibraryArchiveVersion || decoded.SchemaVersion != backupquery.LibraryArchiveSchemaVersion || len(decoded.Blobs) != 1 {
		t.Fatalf("archive manifest missing v3/checksum metadata: %s", manifest)
	}
	if decoded.Blobs[0].SHA256 == "" || decoded.Blobs[0].Size != int64(len(assetBytes)) {
		t.Fatalf("archive manifest blob metadata = %+v", decoded.Blobs[0])
	}
	if bytes.Contains(manifest, []byte(base64.StdEncoding.EncodeToString(assetBytes))) {
		t.Fatal("archive manifest contains Base64 asset payload")
	}

	extra, err := service.Create(ctx, "Temporary")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupArchive(ctx, backup); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, extra.ID); !errors.Is(err, workspacepkg.ErrNotFound) {
		t.Fatalf("temporary workspace survived restore: %v", err)
	}
	restored, err := store.Get(ctx, workspace.ID)
	if err != nil || restored.Title != "Postgres" || restored.CategoryID != category.ID {
		t.Fatalf("restored workspace = %+v err=%v", restored, err)
	}
	storedAsset, err := store.GetAsset(ctx, workspace.ID, "schema")
	if err != nil || string(storedAsset.Data) != string(assetBytes) {
		t.Fatalf("restored asset = %+v err=%v", storedAsset, err)
	}
}

func tamperFirstBlob(t *testing.T, data []byte) []byte {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	tampered := false
	for _, file := range reader.File {
		stream, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(stream)
		_ = stream.Close()
		if err != nil {
			t.Fatal(err)
		}
		header := file.FileHeader
		target, err := writer.CreateHeader(&header)
		if err != nil {
			t.Fatal(err)
		}
		if !tampered && strings.HasPrefix(file.Name, "blobs/") {
			body = append([]byte("tampered-"), body...)
			tampered = true
		}
		if _, err := target.Write(body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if !tampered {
		t.Fatal("no blob to tamper")
	}
	return output.Bytes()
}

func tamperFirstAssetMime(t *testing.T, data []byte, mimeType string) []byte {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	tampered := false
	for _, file := range reader.File {
		stream, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(stream)
		_ = stream.Close()
		if err != nil {
			t.Fatal(err)
		}
		if !tampered && file.Name == backupquery.ArchiveManifestPath {
			var manifest backupquery.LibraryArchiveManifest
			if err := json.Unmarshal(body, &manifest); err != nil {
				t.Fatal(err)
			}
			if len(manifest.Workspaces) == 0 || len(manifest.Workspaces[0].Assets) == 0 {
				t.Fatal("archive has no workspace asset")
			}
			manifest.Workspaces[0].Assets[0].MimeType = mimeType
			body, err = json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
			tampered = true
		}
		header := file.FileHeader
		target, err := writer.CreateHeader(&header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := target.Write(body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if !tampered {
		t.Fatal("manifest not found")
	}
	return output.Bytes()
}

func TestArchiveRestoreRejectsNonImageAssetWithoutReplacingLibrary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "invalid-asset-archive.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Keep archive library")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("original")}); err != nil {
		t.Fatal(err)
	}
	backup, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupArchive(ctx, tamperFirstAssetMime(t, backup, "text/html")); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("invalid asset archive restore error = %v, want invalid", err)
	}
	if _, err := store.Get(ctx, workspace.ID); err != nil {
		t.Fatalf("existing library changed after rejected archive: %v", err)
	}
}

func TestArchiveRestoreRejectsTamperedAsset(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "tamper.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Checksum")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("original")}); err != nil {
		t.Fatal(err)
	}
	backup, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupArchive(ctx, tamperFirstBlob(t, backup)); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("tampered restore error = %v, want invalid", err)
	}
	if _, err := store.Get(ctx, workspace.ID); err != nil {
		t.Fatalf("existing library changed after rejected archive: %v", err)
	}
}

func TestArchiveRestoreRejectsDomainInvalidWorkspaceWithoutReplacingLibrary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "invalid-domain-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Keep me")
	if err != nil {
		t.Fatal(err)
	}

	archive, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	invalidArchive := rewriteArchiveManifest(t, archive, func(manifest *backupquery.LibraryArchiveManifest) {
		manifest.Workspaces[0].Project.Title = "   "
	})

	if err := store.RestoreBackupArchive(ctx, invalidArchive); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("domain-invalid restore error = %v, want invalid", err)
	}
	if _, err := store.Get(ctx, workspace.ID); err != nil {
		t.Fatalf("existing library changed after domain-invalid restore: %v", err)
	}
}

func TestCanvasNotesRoundTripThroughArchive(t *testing.T) {
	for _, tc := range []struct {
		name     string
		document json.RawMessage
	}{
		{"legacy", json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"round trip"}]}]}`)},
		{"markdown", json.RawMessage(`{"type":"markdown","text":"# Round trip\n\n- [x] done\n  **tetap utuh**  "}`)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assertCanvasNoteBackupRoundTrip(t, tc.document)
		})
	}
}

func assertCanvasNoteBackupRoundTrip(t *testing.T, document json.RawMessage) {
	t.Helper()
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "notes-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Canvas Note backup")
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID: "backup-request", ClientNoteID: "backup-note", ClientInstanceID: "backup-instance",
		ElementID: "backup-element", ExpectedCanvasVersion: workspace.CanvasVersion, Document: document,
		Canvas: backupNoteCanvas("backup-element", "backup-note", "backup-instance"), X: 10, Y: 20, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}
	archive, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}

	restored, err := Open(ctx, filepath.Join(t.TempDir(), "restored-notes-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	if err := restored.RestoreBackupArchive(ctx, archive); err != nil {
		t.Fatal(err)
	}
	got, err := restored.GetNote(ctx, created.Note.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != created.Note.ID || string(got.Document) != string(document) || got.Revision != created.Note.Revision {
		t.Fatalf("restored note = %+v", got)
	}
	var instanceCount int
	if err := restored.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_note_instances WHERE workspace_id=? AND id=?`, workspace.ID, created.Instance.ID).Scan(&instanceCount); err != nil {
		t.Fatal(err)
	}
	if instanceCount != 1 {
		t.Fatalf("restored note instance count = %d, want 1", instanceCount)
	}
}

func TestArchiveRestoreRejectsOrphanTrashNoteInstanceEvenWithoutNotes(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "orphan-trash-note.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Trash with note")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, workspace.ID, workspace.Version); err != nil {
		t.Fatal(err)
	}
	archive, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}

	tampered := rewriteArchiveManifest(t, archive, func(manifest *backupquery.LibraryArchiveManifest) {
		manifest.Notes = nil
		manifest.Trash[0].Payload.NoteInstances = []note.Instance{{
			ID: "orphan-inst", NoteID: "missing-note", WorkspaceID: workspace.ID, ElementID: "orphan-el",
			Width: 200, Height: 120, CreatedAt: "2026-01-01T00:00:00Z", UpdatedAt: "2026-01-01T00:00:00Z",
		}}
	})
	if err := store.RestoreBackupArchive(ctx, tampered); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("orphan trash note instance restore error = %v, want invalid", err)
	}
}

func TestArchiveRestoreAcceptsLegacyV2AndScrubsRetiredArtifacts(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "v2-archive-source.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	service := workspacepkg.NewService(store)
	active, err := service.Create(ctx, "Active V2")
	if err != nil {
		t.Fatal(err)
	}
	trashed, err := service.Create(ctx, "Trashed V2")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, trashed.ID, trashed.Version); err != nil {
		t.Fatal(err)
	}
	archive, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}

	retiredCanvas := json.RawMessage(`{"elements":[{"id":"retired-art","isDeleted":false,"customData":{"notespaceNoteArtifact":{"noteId":"old"}}},{"id":"keep-rect","isDeleted":false}],"appState":{},"files":{}}`)
	// Inject v2 header, schemaVersion 15, retired top-level JSON fields, and retired Canvas artifacts.
	reader, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	for _, file := range reader.File {
		stream, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(stream)
		_ = stream.Close()
		if err != nil {
			t.Fatal(err)
		}
		if file.Name == backupquery.ArchiveManifestPath {
			var raw map[string]any
			if err := json.Unmarshal(body, &raw); err != nil {
				t.Fatal(err)
			}
			raw["version"] = 2
			raw["schemaVersion"] = 15
			raw["studySessions"] = []any{}
			raw["captures"] = []any{}
			workspaces := raw["workspaces"].([]any)
			wsProject := workspaces[0].(map[string]any)["project"].(map[string]any)
			wsProject["canvas"].(map[string]any)["data"] = json.RawMessage(retiredCanvas)
			wsProject["splitRatio"] = 0.5
			trash := raw["trash"].([]any)
			trProject := trash[0].(map[string]any)["payload"].(map[string]any)["project"].(map[string]any)
			trProject["canvas"].(map[string]any)["data"] = json.RawMessage(retiredCanvas)
			body, err = json.Marshal(raw)
			if err != nil {
				t.Fatal(err)
			}
		}
		header := file.FileHeader
		target, err := writer.CreateHeader(&header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := target.Write(body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	restoredStore, err := Open(ctx, filepath.Join(t.TempDir(), "v2-archive-restored.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer restoredStore.Close()
	if err := restoredStore.RestoreBackupArchive(ctx, output.Bytes()); err != nil {
		t.Fatal(err)
	}

	gotActive, err := restoredStore.Get(ctx, active.ID)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(gotActive.Canvas.Data), "notespaceNoteArtifact") || !strings.Contains(string(gotActive.Canvas.Data), `"keep-rect"`) {
		t.Fatalf("unexpected active canvas after v2 restore: %s", gotActive.Canvas.Data)
	}
	gotTrashed, err := restoredStore.RestoreTrashedWorkspace(ctx, trashed.ID)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(gotTrashed.Canvas.Data), "notespaceNoteArtifact") || !strings.Contains(string(gotTrashed.Canvas.Data), `"keep-rect"`) {
		t.Fatalf("unexpected trashed canvas after v2 restore: %s", gotTrashed.Canvas.Data)
	}
}

func backupNoteCanvas(elementID, noteID, instanceID string) note.CanvasSnapshot {
	data, _ := json.Marshal(map[string]any{
		"elements": []any{map[string]any{
			"id": elementID,
			"customData": map[string]any{
				"notespaceNote": map[string]string{"noteId": noteID, "instanceId": instanceID},
			},
		}},
		"appState": map[string]any{},
		"files":    map[string]any{},
	})
	return note.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: data}
}

func TestTrashedWorkspaceRestoresAndExportsAfterPlacedNoteDeleted(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "trash-deleted-note.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	service := workspacepkg.NewService(store)
	workspace, err := service.Create(ctx, "Workspace with note")
	if err != nil {
		t.Fatal(err)
	}
	document := json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"temporary note"}]}]}`)
	created, err := store.CreateNoteInstance(ctx, workspace.ID, note.CreateInstanceRequest{
		ClientRequestID:       "req-trash-note",
		ClientNoteID:          "note-deleted-while-trashed",
		ClientInstanceID:      "inst-deleted-while-trashed",
		ElementID:             "el-deleted-while-trashed",
		ExpectedCanvasVersion: workspace.CanvasVersion,
		Document:              document,
		Canvas:                backupNoteCanvas("el-deleted-while-trashed", "note-deleted-while-trashed", "inst-deleted-while-trashed"),
		X:                     10, Y: 20, Width: 320, Height: 180,
	})
	if err != nil {
		t.Fatal(err)
	}

	current, err := store.Get(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, workspace.ID, current.Version); err != nil {
		t.Fatal(err)
	}

	// While the workspace is in Trash, the canonical Note is moved to Note Trash and permanently deleted.
	if err := store.TrashNote(ctx, created.Note.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteTrashedNote(ctx, created.Note.ID); err != nil {
		t.Fatal(err)
	}

	// Exporting and restoring a full backup while the trashed workspace references a deleted Note must succeed.
	archive, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatalf("export backup after deleting note in trashed workspace: %v", err)
	}
	if err := store.RestoreBackupArchive(ctx, archive); err != nil {
		t.Fatalf("restore backup after deleting note in trashed workspace: %v", err)
	}

	// Restoring the trashed workspace must succeed and skip the orphaned instance row without a foreign-key failure.
	restored, err := store.RestoreTrashedWorkspace(ctx, workspace.ID)
	if err != nil {
		t.Fatalf("restore trashed workspace after placed note was deleted: %v", err)
	}
	if restored.ID != workspace.ID {
		t.Fatalf("restored workspace ID = %q, want %q", restored.ID, workspace.ID)
	}
	var instanceCount int
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM canvas_note_instances WHERE workspace_id=?`, workspace.ID).Scan(&instanceCount); err != nil {
		t.Fatal(err)
	}
	if instanceCount != 0 {
		t.Fatalf("orphan instance count = %d, want 0", instanceCount)
	}
}
