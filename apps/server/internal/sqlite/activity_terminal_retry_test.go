package sqlite

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

func TestActivityCompletedSessionDoesNotMoveToTopAfterDelayedRetries(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-finish-recency.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	finishAt := "2026-10-26T09:02:00Z"
	base := activity.Session{
		ID: "old:2026-10-26", ActivityDate: "2026-10-26",
		ActivityType: "build", Title: "Current", ActiveSeconds: 60,
		StartedAt: "2026-10-26T09:00:00Z",
		LastHeartbeatAt: "2026-10-26T09:01:00Z",
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
	final := base
	final.ActiveSeconds = 120
	final.EndedAt = &finishAt
	final.LastHeartbeatAt = finishAt
	write(final)

	newer := base
	newer.ID = "new:2026-10-26"
	newer.Title = "Genuinely new session"
	newer.StartedAt = "2026-10-26T09:04:00Z"
	newer.LastHeartbeatAt = "2026-10-26T09:05:00Z"
	write(newer)

	stale := base
	stale.Title = "Old context"
	stale.LastHeartbeatAt = "2026-10-26T09:06:00Z"
	got := write(stale)
	if got.EndedAt == nil || *got.EndedAt != "2026-10-26T09:02:00.000000000Z" ||
		got.LastHeartbeatAt != "2026-10-26T09:02:00.000000000Z" ||
		got.ActiveSeconds != 120 || got.Title != "Current" {
		t.Fatalf("stale heartbeat changed completed session: %+v", got)
	}

	retry := final
	retry.EndedAt = stringPointer("2026-10-26T09:07:00Z")
	retry.LastHeartbeatAt = "2026-10-26T09:07:00Z"
	got = write(retry)
	if got.LastHeartbeatAt != "2026-10-26T09:02:00.000000000Z" ||
		got.EndedAt == nil || *got.EndedAt != "2026-10-26T09:02:00.000000000Z" {
		t.Fatalf("replayed finish rewrote terminal timestamps: %+v", got)
	}

	// Corrected finalizations may reconcile missing duration and metadata
	// without reordering the already completed session.
	corrected := retry
	corrected.ActiveSeconds = 150
	corrected.Title = "Corrected progress"
	corrected.LastHeartbeatAt = "2026-10-26T09:08:00Z"
	got = write(corrected)
	if got.ActiveSeconds != 150 || got.Title != corrected.Title ||
		got.LastHeartbeatAt != "2026-10-26T09:02:00.000000000Z" {
		t.Fatalf("corrected finish lost duration or changed recency: %+v", got)
	}

	sessions, err := store.ListActivitySessions(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 2 || sessions[0].ID != "new" || sessions[1].ID != "old" {
		t.Fatalf("delayed old session moved above newer history: %+v", sessions)
	}
}

func TestActivityConcurrentLateRetriesCannotRefreshCompletedSession(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-terminal-race.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	for i := 0; i < 12; i++ {
		finishAt := "2026-10-26T09:02:00Z"
		base := activity.Session{
			ID: fmt.Sprintf("done-%d:2026-10-26", i),
			ActivityDate: "2026-10-26", ActivityType: "read",
			Title: "Done", ActiveSeconds: 120,
			StartedAt: "2026-10-26T09:00:00Z",
			LastHeartbeatAt: finishAt, EndedAt: &finishAt,
		}
		if _, err := store.UpsertSession(ctx, base); err != nil {
			t.Fatal(err)
		}

		late := base
		late.EndedAt = nil
		late.Title = "Stale"
		late.ActiveSeconds = 60
		late.LastHeartbeatAt = "2026-10-26T09:03:00Z"
		retry := base
		retry.EndedAt = stringPointer("2026-10-26T09:04:00Z")
		retry.LastHeartbeatAt = "2026-10-26T09:04:00Z"

		start := make(chan struct{})
		var wg sync.WaitGroup
		errs := make(chan error, 2)
		for _, candidate := range []activity.Session{late, retry} {
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
				t.Fatalf("terminal retry failed for %s: %v", base.ID, err)
			}
		}

		// Read the committed row directly; an additional upsert could hide a race.
		got, err := scanActivitySession(store.db.QueryRowContext(ctx,
			"SELECT "+activityColumns+" FROM activity_sessions WHERE id=?", base.ID))
		if err != nil {
			t.Fatal(err)
		}
		if got.EndedAt == nil || *got.EndedAt != "2026-10-26T09:02:00.000000000Z" ||
			got.LastHeartbeatAt != "2026-10-26T09:02:00.000000000Z" ||
			got.ActiveSeconds != 120 || got.Title != "Done" {
			t.Fatalf("terminal retry raced into history for %s: %+v", base.ID, got)
		}
	}
}

func TestActivityFinishIntentStillClosesWithStaleDuration(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-finish-intent.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	base := activity.Session{
		ID: "finish:2026-10-26", ActivityDate: "2026-10-26",
		ActivityType: "learn", Title: "Advanced", ActiveSeconds: 120,
		StartedAt: "2026-10-26T09:00:00Z",
		LastHeartbeatAt: "2026-10-26T09:02:00Z",
	}
	if _, err := store.UpsertSession(ctx, base); err != nil {
		t.Fatal(err)
	}

	// Finish is a terminal command, not another progress heartbeat. The
	// outbox treats a successful HTTP response as durable acknowledgement.
	finishAt := "2026-10-26T09:03:00Z"
	staleFinish := base
	staleFinish.ActiveSeconds = 60
	staleFinish.EndedAt = &finishAt
	staleFinish.Title = "Stale"
	staleFinish.LastHeartbeatAt = finishAt
	got, err := store.UpsertSession(ctx, staleFinish)
	if err != nil {
		t.Fatal(err)
	}
	if got.EndedAt == nil || got.ActiveSeconds != 120 || got.Title != "Advanced" {
		t.Fatalf("finalization intent lost or progress regressed: %+v", got)
	}
}
