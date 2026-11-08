package sqlite

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/planning"
	backupquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/backup"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"io"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkspaceTrashRestoresIdentityHistoryAndAssets(t *testing.T) {
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
	history, err := store.ListHistory(ctx, workspace.ID)
	if err != nil || len(history) == 0 {
		t.Fatalf("restored history = %+v err=%v", history, err)
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
	if _, err := store.UpsertSession(ctx, activity.Session{ID: "study-1", WorkspaceID: workspace.ID, WorkspaceTitleSnapshot: workspace.Title, ActivityDate: "2026-09-06", StartedAt: "2026-09-06T01:00:00Z", ActiveSeconds: 600, LastHeartbeatAt: "2026-09-06T01:10:00Z"}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpsertSession(ctx, activity.Session{
		ID: "read-1", Title: "Read database paper", ActivityType: "read", Revision: 5,
		ActivityDate: "2026-09-06", StartedAt: "2026-09-06T02:00:00Z",
		ActiveSeconds: 300, LastHeartbeatAt: "2026-09-06T02:05:00Z",
	}); err != nil {
		t.Fatal(err)
	}
	planningService := planning.NewService(store, store, nil)
	milestone, err := planningService.CreateMilestone(ctx, workspace.ID, "Ship persistence")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := planningService.CreateTask(ctx, workspace.ID, &milestone.ID, "Verify backup round trip"); err != nil {
		t.Fatal(err)
	}
	standalone, err := planningService.CreateStandaloneTask(ctx, "Personal follow-up", "2026-09-21")
	if err != nil {
		t.Fatal(err)
	}
	inboxTask, err := planningService.CreateStandaloneTask(ctx, "Unscheduled follow-up", "")
	if err != nil {
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
	day, err := store.DayDetail(ctx, "2026-09-06")
	if err != nil {
		t.Fatal(err)
	}
	foundWorkspaceActivity := false
	for _, item := range day.Workspaces {
		if item.WorkspaceID == workspace.ID && item.ActiveSeconds == 600 {
			foundWorkspaceActivity = true
		}
	}
	if !foundWorkspaceActivity {
		t.Fatalf("restored workspace activity missing from day detail: %+v", day.Workspaces)
	}
	globalStats, err := store.GlobalStats(ctx, "2026-09-06")
	if err != nil || globalStats.TotalSeconds != 900 {
		t.Fatalf("restored global activity stats = %+v err=%v", globalStats, err)
	}
	// A versioned Activity remains ordered after a full-library backup restore.
	var restoredRevision int64
	if err := store.db.QueryRowContext(ctx, "SELECT revision FROM activity_sessions WHERE id=?", "read-1").Scan(&restoredRevision); err != nil {
		t.Fatal(err)
	}
	if restoredRevision != 5 {
		t.Fatalf("restored Activity revision = %d, want 5", restoredRevision)
	}
	activities, err := store.ListActivitySessions(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	foundRead := false
	for _, session := range activities {
		if session.Title == "Read database paper" && session.ActivityType == "read" && session.WorkspaceID == "" {
			foundRead = true
		}
	}
	if !foundRead {
		t.Fatalf("standalone activity missing after archive restore: %+v", activities)
	}
	restoredPlan, err := planningService.GetPlan(ctx, workspace.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(restoredPlan.Milestones) != 1 || restoredPlan.Milestones[0].Title != "Ship persistence" {
		t.Fatalf("restored plan milestones = %+v", restoredPlan.Milestones)
	}
	if len(restoredPlan.Tasks) != 1 || restoredPlan.Tasks[0].Title != "Verify backup round trip" || restoredPlan.Tasks[0].MilestoneID == nil {
		t.Fatalf("restored plan tasks = %+v", restoredPlan.Tasks)
	}
	restoredStandalone, err := planningService.Today(ctx, "2026-09-21")
	if err != nil {
		t.Fatal(err)
	}
	foundStandalone := false
	for _, task := range restoredStandalone.Tasks {
		if task.ID == standalone.ID && task.WorkspaceID == nil && task.Title == "Personal follow-up" {
			foundStandalone = true
		}
	}
	if !foundStandalone {
		t.Fatalf("standalone task missing after archive restore: %+v", restoredStandalone.Tasks)
	}
	restoredInbox, err := planningService.Inbox(ctx)
	if err != nil {
		t.Fatal(err)
	}
	foundInbox := false
	for _, task := range restoredInbox.Tasks {
		if task.ID == inboxTask.ID && task.WorkspaceID == nil && task.PlannedFor == nil && task.Title == "Unscheduled follow-up" {
			foundInbox = true
		}
	}
	if !foundInbox {
		t.Fatalf("inbox task missing after archive restore: %+v", restoredInbox.Tasks)
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

func TestRestoreRejectsNonImageJSONAssetWithoutReplacingLibrary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "invalid-asset-json.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Keep asset library")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("original")}); err != nil {
		t.Fatal(err)
	}
	data, err := store.exportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var backup backupquery.LibraryBackup
	if err := json.Unmarshal(data, &backup); err != nil {
		t.Fatal(err)
	}
	backup.Workspaces[0].Assets[0].MimeType = "text/html"
	data, err = json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupJSON(ctx, data); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("invalid asset restore error = %v, want invalid", err)
	}
	if _, err := store.Get(ctx, workspace.ID); err != nil {
		t.Fatalf("existing library changed after rejected restore: %v", err)
	}
	if restored, err := store.GetAsset(ctx, workspace.ID, "image"); err != nil || restored.MimeType != "image/png" {
		t.Fatalf("existing asset after rejected restore = %+v err=%v", restored, err)
	}
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

func TestLegacyJSONBackupStillRestores(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "legacy-json.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Legacy JSON")
	if err != nil {
		t.Fatal(err)
	}
	backup, err := store.exportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupJSON(ctx, backup); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, workspace.ID); err != nil {
		t.Fatal(err)
	}
}

func TestLegacyV2BackupsDropRetiredPayloads(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "legacy-v2-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := workspacepkg.NewService(store)
	p, err := service.Create(ctx, "Legacy v2")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateCapture(ctx, "Legacy converted capture"); err != nil {
		t.Fatal(err)
	}
	jsonBackup, err := store.exportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	archiveBackup, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}

	var legacy backupquery.LibraryBackup
	if err := json.Unmarshal(jsonBackup, &legacy); err != nil {
		t.Fatal(err)
	}
	legacy.Version = 2
	injectRetiredPayload(&legacy, p.ID)
	if len(legacy.Captures) != 1 {
		t.Fatalf("legacy captures = %d, want 1", len(legacy.Captures))
	}
	legacy.Captures[0].Status = "converted"
	legacy.Captures[0].TargetKind = "note"
	legacy.Captures[0].TargetWorkspaceID = p.ID
	legacy.Captures[0].TargetID = "legacy-note"
	legacy.Captures[0].ConvertedAt = "2026-01-01T00:00:00Z"
	jsonBackup, err = json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupJSON(ctx, jsonBackup); err != nil {
		t.Fatalf("v2 JSON restore failed: %v", err)
	}
	assertRetiredPayloadRemoved(t, ctx, store, p.ID)
	assertLegacyNoteCapturePending(t, ctx, store)

	archiveBackup = rewriteArchiveManifest(t, archiveBackup, func(manifest *backupquery.LibraryArchiveManifest) {
		manifest.Version = 2
		manifest.SchemaVersion = 15
		if len(manifest.Workspaces) == 0 {
			t.Fatal("archive has no workspace")
		}
		manifest.Workspaces[0].Project.Canvas = canvasWithRetiredNoteArtifact(true)
		manifest.Workspaces[0].Project.Notes = []workspacepkg.Note{{ID: "legacy-note", Title: "Legacy", Document: backupquery.EmptyDocumentSnapshot()}}
		manifest.Workspaces[0].Project.References = []workspacepkg.Reference{{ID: "legacy-reference", BlockID: "block", ElementID: "element"}}
		if len(manifest.Workspaces[0].History) > 0 {
			manifest.Workspaces[0].History[0].Canvas = canvasWithRetiredNoteArtifact(true)
			manifest.Workspaces[0].History[0].Notes = []workspacepkg.Note{{ID: "legacy-history-note", Title: "Legacy history", Document: backupquery.EmptyDocumentSnapshot()}}
		}
		if len(manifest.Captures) != 1 {
			t.Fatal("archive has no capture")
		}
		manifest.Captures[0].Status = "converted"
		manifest.Captures[0].TargetKind = "note"
		manifest.Captures[0].TargetWorkspaceID = p.ID
		manifest.Captures[0].TargetID = "legacy-note"
		manifest.Captures[0].ConvertedAt = "2026-01-01T00:00:00Z"
	})
	if err := store.RestoreBackupArchive(ctx, archiveBackup); err != nil {
		t.Fatalf("v2 archive restore failed: %v", err)
	}
	assertRetiredPayloadRemoved(t, ctx, store, p.ID)
	assertLegacyNoteCapturePending(t, ctx, store)
}

func TestCurrentV3BackupDropsLegacyDocuments(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "v3-document.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := workspacepkg.NewService(store).Create(ctx, "Current backup")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := store.exportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var backup backupquery.LibraryBackup
	if err := json.Unmarshal(raw, &backup); err != nil {
		t.Fatal(err)
	}
	legacyDocument := workspacepkg.Snapshot{
		Format: "tiptap", Version: 1,
		Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hidden legacy document"}]}]}`),
	}
	backup.Version = backupquery.LibraryBackupVersion
	backup.Workspaces[0].Project.Document = legacyDocument
	if len(backup.Workspaces[0].History) == 0 {
		t.Fatal("backup has no history")
	}
	backup.Workspaces[0].History[0].Document = legacyDocument
	encoded, err := json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupJSON(ctx, encoded); err != nil {
		t.Fatal(err)
	}
	restored, err := store.Get(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if string(restored.Document.Data) != string(backupquery.EmptyDocumentSnapshot().Data) {
		t.Fatalf("v3 project Document survived normalization: %s", restored.Document.Data)
	}
	history, err := store.ListHistory(ctx, p.ID)
	if err != nil || len(history) == 0 {
		t.Fatalf("restored history = %+v err=%v", history, err)
	}
	restoredHistory, err := store.GetHistory(ctx, p.ID, history[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if string(restoredHistory.Document.Data) != string(backupquery.EmptyDocumentSnapshot().Data) {
		t.Fatalf("v3 history Document survived normalization: %s", restoredHistory.Document.Data)
	}
}

func TestRestoreTrashedWorkspaceNormalizesLegacyDocument(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "trash-document.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	p, err := workspacepkg.NewService(store).Create(ctx, "Trash document")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.TrashWorkspace(ctx, p.ID, p.Version); err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err := store.db.QueryRowContext(ctx, `SELECT payload FROM workspace_trash WHERE id=?`, p.ID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var envelope backupquery.WorkspaceEnvelope
	if err := backupquery.DecodeTrashEnvelope(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	envelope.Project.Document = workspacepkg.Snapshot{
		Format: "tiptap", Version: 1,
		Data: json.RawMessage(`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hidden trash document"}]}]}`),
	}
	for i := range envelope.History {
		envelope.History[i].Document = envelope.Project.Document
	}
	encoded, err := backupquery.EncodeTrashEnvelope(envelope)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.db.ExecContext(ctx, `UPDATE workspace_trash SET payload=? WHERE id=?`, encoded, p.ID); err != nil {
		t.Fatal(err)
	}
	restored, err := store.RestoreTrashedWorkspace(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if string(restored.Document.Data) != string(backupquery.EmptyDocumentSnapshot().Data) {
		t.Fatalf("trash Document survived normalization: %s", restored.Document.Data)
	}
}

func injectRetiredPayload(backup *backupquery.LibraryBackup, workspaceID string) {
	for i := range backup.Workspaces {
		if backup.Workspaces[i].Project.ID != workspaceID {
			continue
		}
		backup.Workspaces[i].Project.Canvas = canvasWithRetiredNoteArtifact(true)
		backup.Workspaces[i].Project.Notes = []workspacepkg.Note{{ID: "legacy-note", Title: "Legacy", Document: backupquery.EmptyDocumentSnapshot()}}
		backup.Workspaces[i].Project.References = []workspacepkg.Reference{{ID: "legacy-reference", BlockID: "block", ElementID: "element"}}
		if len(backup.Workspaces[i].History) > 0 {
			backup.Workspaces[i].History[0].Canvas = canvasWithRetiredNoteArtifact(true)
			backup.Workspaces[i].History[0].Notes = []workspacepkg.Note{{ID: "legacy-history-note", Title: "Legacy history", Document: backupquery.EmptyDocumentSnapshot()}}
		}
	}
}

func assertRetiredPayloadRemoved(t *testing.T, ctx context.Context, store *Store, workspaceID string) {
	t.Helper()
	value, err := store.Get(ctx, workspaceID)
	if err != nil {
		t.Fatal(err)
	}
	if len(value.Notes) != 0 || len(value.References) != 0 || bytes.Contains(value.Canvas.Data, []byte("notespaceNoteArtifact")) {
		t.Fatalf("restored retired payload = %+v", value)
	}
	history, err := store.ListHistory(ctx, workspaceID)
	if err != nil || len(history) == 0 {
		t.Fatalf("restored history = %+v err=%v", history, err)
	}
	snapshot, err := store.GetHistory(ctx, workspaceID, history[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Notes) != 0 || len(snapshot.References) != 0 || bytes.Contains(snapshot.Canvas.Data, []byte("notespaceNoteArtifact")) {
		t.Fatalf("restored retired history payload = %+v", snapshot)
	}
	if !bytes.Contains(value.Canvas.Data, []byte("keep-me")) {
		t.Fatalf("unrelated Canvas element was not preserved: %s", value.Canvas.Data)
	}
}

func assertLegacyNoteCapturePending(t *testing.T, ctx context.Context, store *Store) {
	t.Helper()
	captures, err := store.ListCaptures(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(captures) != 1 {
		t.Fatalf("captures = %+v, want one", captures)
	}
	item := captures[0]
	if item.Status != "pending" || item.TargetKind != "" || item.TargetWorkspaceID != "" || item.TargetID != "" || item.ConvertedAt != "" || item.Version != 2 {
		t.Fatalf("legacy Note capture was not normalized: %+v", item)
	}
}

func TestRestoreRejectsUnknownBackupWithoutReplacingLibrary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "invalid-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := workspacepkg.NewService(store).Create(ctx, "Keep me")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupJSON(ctx, []byte(`{"format":"other","version":1,"categories":[]}`)); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("restore error = %v, want invalid", err)
	}
	if _, err := store.Get(ctx, workspace.ID); err != nil {
		t.Fatalf("existing library changed after invalid restore: %v", err)
	}
}

func TestRestoreRejectsInvalidActivityTypeWithoutReplacingLibrary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "invalid-activity-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Keep activity library")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpsertSession(ctx, activity.Session{
		ID: "activity-1", Title: "Read paper", ActivityType: "read",
		ActivityDate: "2026-09-21", StartedAt: "2026-09-21T01:00:00Z",
		ActiveSeconds: 300, LastHeartbeatAt: "2026-09-21T01:05:00Z",
	}); err != nil {
		t.Fatal(err)
	}

	data, err := store.exportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var backup backupquery.LibraryBackup
	if err := json.Unmarshal(data, &backup); err != nil {
		t.Fatal(err)
	}
	if len(backup.Activity) != 1 {
		t.Fatalf("backup activities = %d, want 1", len(backup.Activity))
	}
	backup.Activity[0].ActivityType = "focus"
	data, err = json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.RestoreBackupJSON(ctx, data); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("invalid activity restore error = %v, want invalid", err)
	}
	if _, err := store.Get(ctx, workspace.ID); err != nil {
		t.Fatalf("existing library changed after invalid activity restore: %v", err)
	}
}

func TestRestoreRejectsDomainInvalidWorkspaceWithoutReplacingLibrary(t *testing.T) {
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

	data, err := store.exportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var backup backupquery.LibraryBackup
	if err := json.Unmarshal(data, &backup); err != nil {
		t.Fatal(err)
	}
	backup.Workspaces[0].Project.Document.Data = json.RawMessage(`{"type":"not-a-doc","content":[]}`)
	data, err = json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.RestoreBackupJSON(ctx, data); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("domain-invalid restore error = %v, want invalid", err)
	}
	if _, err := store.Get(ctx, workspace.ID); err != nil {
		t.Fatalf("existing library changed after domain-invalid restore: %v", err)
	}
}

func TestRestoreRejectsInvalidActivitySessionFields(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "invalid-activity-fields-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	workspace, err := workspacepkg.NewService(store).Create(ctx, "Keep valid activity library")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpsertSession(ctx, activity.Session{
		ID: "activity-1", Title: "Read paper", ActivityType: "read",
		ActivityDate: "2026-09-21", StartedAt: "2026-09-21T01:00:00Z",
		ActiveSeconds: 300, LastHeartbeatAt: "2026-09-21T01:05:00Z",
	}); err != nil {
		t.Fatal(err)
	}
	data, err := store.exportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var valid backupquery.LibraryBackup
	if err := json.Unmarshal(data, &valid); err != nil {
		t.Fatal(err)
	}

	cases := map[string]func(*activity.Session){
		"date":      func(session *activity.Session) { session.ActivityDate = "not-a-date" },
		"started":   func(session *activity.Session) { session.StartedAt = "not-a-time" },
		"heartbeat": func(session *activity.Session) { session.LastHeartbeatAt = "" },
		"seconds":   func(session *activity.Session) { session.ActiveSeconds = -1 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			backup := valid
			backup.Activity = append([]activity.Session(nil), valid.Activity...)
			mutate(&backup.Activity[0])
			encoded, err := json.Marshal(backup)
			if err != nil {
				t.Fatal(err)
			}
			if err := store.RestoreBackupJSON(ctx, encoded); !errors.Is(err, workspacepkg.ErrInvalid) {
				t.Fatalf("restore error = %v, want workspace.ErrInvalid", err)
			}
			if _, err := store.Get(ctx, workspace.ID); err != nil {
				t.Fatalf("existing library changed after rejected restore: %v", err)
			}
		})
	}
}
