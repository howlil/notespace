package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

func TestActivityDeletionLedgerSurvivesArchiveAndJSONBackupRestore(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-deletion-backup.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	session := activity.Session{
		ID:              "deleted-in-backup:2026-10-26",
		Title:           "Old activity",
		ActivityType:    "read",
		ActivityDate:    "2026-10-26",
		StartedAt:       "2026-10-26T09:00:00Z",
		LastHeartbeatAt: "2026-10-26T09:01:00Z",
		ActiveSeconds:   60,
	}
	if _, err := store.UpsertSession(ctx, session); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteActivitySession(ctx, "deleted-in-backup"); err != nil {
		t.Fatal(err)
	}
	archive, err := store.ExportBackupArchive(ctx)
	if err != nil {
		t.Fatal(err)
	}
	jsonBackup, err := store.exportBackupJSONAtomic(ctx)
	if err != nil {
		t.Fatal(err)
	}

	// Activity state created after the backup must not leak into a restore.
	extra := session
	extra.ID = "deleted-after-backup:2026-10-26"
	if _, err := store.UpsertSession(ctx, extra); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteActivitySession(ctx, "deleted-after-backup"); err != nil {
		t.Fatal(err)
	}
	for _, restore := range []struct {
		name string
		run  func(context.Context) error
	}{
		{"archive", func(ctx context.Context) error { return store.RestoreBackupArchive(ctx, archive) }},
		{"json", func(ctx context.Context) error { return store.RestoreBackupJSON(ctx, jsonBackup) }},
	} {
		t.Run(restore.name, func(t *testing.T) {
			if err := restore.run(ctx); err != nil {
				t.Fatal(err)
			}
			if _, err := store.UpsertSession(ctx, session); !errors.Is(err, activity.ErrDeleted) {
				t.Fatalf("backup lost deletion identity: %v", err)
			}
			if _, err := store.UpsertSession(ctx, extra); err != nil {
				t.Fatalf("restore retained deletion made after backup: %v", err)
			}
			if err := store.DeleteActivitySession(ctx, "deleted-after-backup"); err != nil {
				t.Fatal(err)
			}
		})
	}
}
