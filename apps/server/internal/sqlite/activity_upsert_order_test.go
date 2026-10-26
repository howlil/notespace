package sqlite

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

// The SQL upsert owns the atomic duration/metadata invariant, not HTTP arrival order.
func TestActivityUpsertMetadataTracksMonotonicDuration(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-order.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	base := activity.Session{
		ID: "ordered:2026-10-26", ActivityDate: "2026-10-26",
		ActivityType: "build", StartedAt: "2026-10-26T09:00:00Z",
		Title: "Initial", WorkspaceTitleSnapshot: "Initial workspace",
		TaskTitleSnapshot: "Initial task", ActiveSeconds: 60,
		LastHeartbeatAt: "2026-10-26T09:00:00Z",
	}
	write := func(session activity.Session) activity.Session {
		t.Helper()
		got, err := store.UpsertSession(ctx, session)
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	write(base)
	newer := base
	newer.Title = "Authoritative"
	newer.WorkspaceTitleSnapshot = "New workspace"
	newer.TaskTitleSnapshot = "New task"
	newer.ActiveSeconds = 120
	newer.LastHeartbeatAt = "2026-10-26T09:01:00Z"
	write(newer)

	stale := base
	stale.Title = "Outdated"
	stale.WorkspaceTitleSnapshot = "Old workspace"
	stale.TaskTitleSnapshot = "Old task"
	stale.LastHeartbeatAt = "2026-10-26T09:02:00Z"
	got := write(stale)
	if got.ActiveSeconds != 120 || got.Title != newer.Title ||
		got.WorkspaceTitleSnapshot != newer.WorkspaceTitleSnapshot ||
		got.TaskTitleSnapshot != newer.TaskTitleSnapshot {
		t.Fatalf("delayed lower-duration heartbeat regressed metadata: %+v", got)
	}
	if got.LastHeartbeatAt != "2026-10-26T09:02:00.000000000Z" {
		t.Fatalf("last request time = %q, want latest arrival", got.LastHeartbeatAt)
	}

	tied := stale
	tied.ActiveSeconds = 120
	tied.LastHeartbeatAt = "2026-10-26T09:03:00Z"
	got = write(tied)
	if got.Title != newer.Title || got.WorkspaceTitleSnapshot != newer.WorkspaceTitleSnapshot ||
		got.TaskTitleSnapshot != newer.TaskTitleSnapshot {
		t.Fatalf("equal-duration retry overwrote committed metadata: %+v", got)
	}

	later := newer
	later.Title = "Progressed"
	later.WorkspaceTitleSnapshot = "Progressed workspace"
	later.TaskTitleSnapshot = "Progressed task"
	later.ActiveSeconds = 180
	later.LastHeartbeatAt = "2026-10-26T09:04:00Z"
	got = write(later)
	if got.ActiveSeconds != 180 || got.Title != later.Title ||
		got.WorkspaceTitleSnapshot != later.WorkspaceTitleSnapshot ||
		got.TaskTitleSnapshot != later.TaskTitleSnapshot {
		t.Fatalf("larger-duration heartbeat did not progress metadata: %+v", got)
	}
}

func TestActivityConcurrentUpsertsKeepHighestDurationMetadata(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-parallel.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	// Both operations use one real SQLite store and race for the same row.
	// The final result must be independent of which goroutine commits last.
	for i := 0; i < 12; i++ {
		id := fmt.Sprintf("parallel-%d:2026-10-26", i)
		base := activity.Session{
			ID: id, ActivityDate: "2026-10-26", ActivityType: "read",
			StartedAt: "2026-10-26T09:00:00Z",
		}
		lower := base
		lower.Title = "Stale"
		lower.ActiveSeconds = 30
		lower.LastHeartbeatAt = "2026-10-26T09:02:00Z"
		higher := base
		higher.Title = "Latest progress"
		higher.ActiveSeconds = 90
		higher.LastHeartbeatAt = "2026-10-26T09:01:00Z"

		start := make(chan struct{})
		var wg sync.WaitGroup
		errs := make(chan error, 2)
		for _, candidate := range []activity.Session{lower, higher} {
			wg.Add(1)
			go func(session activity.Session) {
				defer wg.Done()
				<-start
				_, err := store.UpsertSession(ctx, session)
				errs <- err
			}(candidate)
		}
		close(start)
		wg.Wait()
		close(errs)
		for err := range errs {
			if err != nil {
				t.Fatalf("parallel upsert %s failed: %v", id, err)
			}
		}
		var saved activity.Session
		saved, err = store.UpsertSession(ctx, higher)
		if err != nil {
			t.Fatal(err)
		}
		if saved.ActiveSeconds != 90 || saved.Title != "Latest progress" {
			t.Fatalf("out-of-order concurrent upserts regressed session %s: %+v", id, saved)
		}
	}
}
