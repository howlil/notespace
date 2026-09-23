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
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/project"
	"github.com/howlil/notespace/apps/server/internal/activity"
)

func TestWorkspaceTrashRestoresIdentityHistoryAndAssets(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "trash.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := project.Service{Store: store}
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

	if err := store.TrashWorkspaceAtomic(ctx, workspace.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, workspace.ID); !errors.Is(err, project.ErrNotFound) {
		t.Fatalf("trashed workspace get error = %v, want not found", err)
	}
	var storedPayload []byte
	if err := store.db.QueryRowContext(ctx, `SELECT payload FROM workspace_trash WHERE id=?`, workspace.ID).Scan(&storedPayload); err != nil {
		t.Fatal(err)
	}
	if json.Valid(storedPayload) {
		t.Fatal("new trash payload is JSON/Base64; want binary compressed envelope")
	}
	trashJSON, err := store.ListTrashJSON(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var trash []trashSummary
	if err := json.Unmarshal(trashJSON, &trash); err != nil {
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
		if file.Name != archiveManifestPath {
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

func TestFullLibraryArchiveRestoreRoundTrip(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	service := project.Service{Store: store}
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
		ID: "read-1", Title: "Read database paper", ActivityType: "read",
		ActivityDate: "2026-09-06", StartedAt: "2026-09-06T02:00:00Z",
		ActiveSeconds: 300, LastHeartbeatAt: "2026-09-06T02:05:00Z",
	}); err != nil {
		t.Fatal(err)
	}
	planningService := planning.Service{Store: store}
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

	backup, err := store.ExportBackupArchiveAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	manifest := archiveManifest(t, backup)
	if !bytes.Contains(manifest, []byte(`"version":2`)) || !bytes.Contains(manifest, []byte(`"blobs"`)) {
		t.Fatalf("archive manifest missing v2/checksum metadata: %s", manifest)
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
	if _, err := store.Get(ctx, extra.ID); !errors.Is(err, project.ErrNotFound) {
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
	stats, err := store.WorkspaceStats(ctx, workspace.ID, "2026-09-06")
	if err != nil || stats.TotalSeconds != 600 {
		t.Fatalf("restored workspace activity stats = %+v err=%v", stats, err)
	}
	globalStats, err := store.GlobalStats(ctx, "2026-09-06")
	if err != nil || globalStats.TotalSeconds != 900 {
		t.Fatalf("restored global activity stats = %+v err=%v", globalStats, err)
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

func TestArchiveRestoreRejectsTamperedAsset(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "tamper.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := (project.Service{Store: store}).Create(ctx, "Checksum")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "image", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("original")}); err != nil {
		t.Fatal(err)
	}
	backup, err := store.ExportBackupArchiveAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupArchive(ctx, tamperFirstBlob(t, backup)); !errors.Is(err, project.ErrInvalid) {
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
	workspace, err := (project.Service{Store: store}).Create(ctx, "Legacy JSON")
	if err != nil {
		t.Fatal(err)
	}
	backup, err := store.ExportBackupJSONAtomic(ctx)
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

func TestRestoreRejectsUnknownBackupWithoutReplacingLibrary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "invalid-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	workspace, err := (project.Service{Store: store}).Create(ctx, "Keep me")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupJSON(ctx, []byte(`{"format":"other","version":1,"categories":[]}`)); !errors.Is(err, project.ErrInvalid) {
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

	workspace, err := (project.Service{Store: store}).Create(ctx, "Keep activity library")
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

	data, err := store.ExportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var backup libraryBackup
	if err := json.Unmarshal(data, &backup); err != nil {
		t.Fatal(err)
	}
	if len(backup.Study) != 1 {
		t.Fatalf("backup activities = %d, want 1", len(backup.Study))
	}
	backup.Study[0].ActivityType = "focus"
	data, err = json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.RestoreBackupJSON(ctx, data); !errors.Is(err, project.ErrInvalid) {
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
	workspace, err := (project.Service{Store: store}).Create(ctx, "Keep me")
	if err != nil {
		t.Fatal(err)
	}

	data, err := store.ExportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var backup libraryBackup
	if err := json.Unmarshal(data, &backup); err != nil {
		t.Fatal(err)
	}
	backup.Workspaces[0].Project.Document.Data = json.RawMessage(`{"type":"not-a-doc","content":[]}`)
	data, err = json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.RestoreBackupJSON(ctx, data); !errors.Is(err, project.ErrInvalid) {
		t.Fatalf("domain-invalid restore error = %v, want invalid", err)
	}
	if _, err := store.Get(ctx, workspace.ID); err != nil {
		t.Fatalf("existing library changed after domain-invalid restore: %v", err)
	}
}
