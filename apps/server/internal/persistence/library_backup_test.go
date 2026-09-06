package persistence

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/project"
	"github.com/howlil/notespace/apps/server/internal/study"
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

	if err := store.TrashWorkspace(ctx, workspace.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, workspace.ID); !errors.Is(err, project.ErrNotFound) {
		t.Fatalf("trashed workspace get error = %v, want not found", err)
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

func TestFullLibraryBackupRestoreRoundTrip(t *testing.T) {
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
	if _, err := store.PutAsset(ctx, asset.Stored{ID: "schema", WorkspaceID: workspace.ID, MimeType: "image/png", Data: []byte("schema-bytes")}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpsertSession(ctx, study.Session{ID: "study-1", WorkspaceID: workspace.ID, WorkspaceTitleSnapshot: workspace.Title, ActivityDate: "2026-09-06", StartedAt: "2026-09-06T01:00:00Z", ActiveSeconds: 600, LastHeartbeatAt: "2026-09-06T01:10:00Z"}); err != nil {
		t.Fatal(err)
	}

	backup, err := store.ExportBackupJSON(ctx)
	if err != nil {
		t.Fatal(err)
	}
	extra, err := service.Create(ctx, "Temporary")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupJSON(ctx, backup); err != nil {
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
	if err != nil || string(storedAsset.Data) != "schema-bytes" {
		t.Fatalf("restored asset = %+v err=%v", storedAsset, err)
	}
	stats, err := store.WorkspaceStats(ctx, workspace.ID, "2026-09-06")
	if err != nil || stats.TotalSeconds != 600 {
		t.Fatalf("restored study stats = %+v err=%v", stats, err)
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
