package sqlite

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func TestCaptureBackupRejectsInvalidReceiptWithoutReplacingLibrary(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "capture-invalid-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	item, err := store.CreateCapture(ctx, "Keep this capture")
	if err != nil {
		t.Fatal(err)
	}
	backup, err := store.libraryBackupAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(backup.Captures) != 1 {
		t.Fatalf("captures = %d, want 1", len(backup.Captures))
	}
	backup.Captures[0].Status = "converted"
	payload, err := json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupJSON(ctx, payload); !errors.Is(err, workspacepkg.ErrInvalid) {
		t.Fatalf("restore invalid receipt error = %v, want invalid", err)
	}
	current, err := store.GetCapture(ctx, item.ID)
	if err != nil {
		t.Fatal(err)
	}
	if current.Content != item.Content || current.Status != "pending" {
		t.Fatalf("invalid restore replaced capture: %+v", current)
	}
}

func TestOldJSONBackupWithNoCapturesCanStillRestore(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "capture-v1-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	if _, err := store.CreateCapture(ctx, "New queue data"); err != nil {
		t.Fatal(err)
	}
	backup, err := store.libraryBackupAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}
	backup.Version = 1
	backup.Captures = nil
	payload, err := json.Marshal(backup)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.RestoreBackupJSON(ctx, payload); err != nil {
		t.Fatal(err)
	}
	items, err := store.ListCaptures(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("old backup unexpectedly included captures: %+v", items)
	}
}
