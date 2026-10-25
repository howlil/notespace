package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

func TestDeletedActivitySessionRejectsLateAndNewDayHeartbeatsAcrossRestart(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "activity-deleted.db")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	first := activity.Session{
		ID:              "deleted-logical:2026-10-25",
		Title:           "Build Activity",
		ActivityType:    "build",
		ActivityDate:    "2026-10-25",
		StartedAt:       "2026-10-25T23:50:00Z",
		LastHeartbeatAt: "2026-10-25T23:51:00Z",
		ActiveSeconds:   60,
	}
	if _, err := store.UpsertSession(ctx, first); err != nil {
		t.Fatal(err)
	}
	second := first
	second.ID = "deleted-logical:2026-10-26"
	second.ActivityDate = "2026-10-26"
	second.StartedAt = "2026-10-26T00:00:00Z"
	second.LastHeartbeatAt = "2026-10-26T00:05:00Z"
	second.ActiveSeconds = 300
	if _, err := store.UpsertSession(ctx, second); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteActivitySession(ctx, "deleted-logical"); err != nil {
		t.Fatal(err)
	}

	// An in-flight heartbeat from an old browser tab must not revive either
	// the original segment or another date under the deleted logical ID.
	first.ActiveSeconds = 120
	second.ActiveSeconds = 420
	for _, late := range []activity.Session{first, second} {
		if _, err := store.UpsertSession(ctx, late); !errors.Is(err, activity.ErrDeleted) {
			t.Fatalf("late heartbeat %q error = %v, want ErrDeleted", late.ID, err)
		}
	}
	if err := store.DeleteActivitySession(ctx, "deleted-logical"); !errors.Is(err, activity.ErrNotFound) {
		t.Fatalf("second delete error = %v, want ErrNotFound", err)
	}
	sessions, err := store.ListActivitySessions(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Fatalf("deleted history revived: %+v", sessions)
	}
	stats, err := store.GlobalStats(ctx, "2026-10-26")
	if err != nil {
		t.Fatal(err)
	}
	if stats.TodaySeconds != 0 || stats.TotalSeconds != 0 {
		t.Fatalf("deleted Activity leaked into totals: %+v", stats)
	}

	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store, err = Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	// Deletion intent survives server restart and rejects future segments.
	afterRestart := second
	afterRestart.ID = "deleted-logical:2026-10-27"
	afterRestart.ActivityDate = "2026-10-27"
	if _, err := store.UpsertSession(ctx, afterRestart); !errors.Is(err, activity.ErrDeleted) {
		t.Fatalf("replay after restart error = %v, want ErrDeleted", err)
	}
	fresh := first
	fresh.ID = "new-logical:2026-10-25"
	if _, err := store.UpsertSession(ctx, fresh); err != nil {
		t.Fatalf("new unrelated Activity blocked by tombstone: %v", err)
	}
}
