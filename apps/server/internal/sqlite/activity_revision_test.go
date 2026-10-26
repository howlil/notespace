package sqlite

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

func TestActivityRevisionsOrderEqualDurationMetadata(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-revisions.db"))
	if err != nil { t.Fatal(err) }
	t.Cleanup(func() { _ = store.Close() })

	base := activity.Session{ID: "ordered:2026-10-26", ActivityDate: "2026-10-26", ActivityType: "build",
		Title: "Initial", WorkspaceTitleSnapshot: "Old workspace", TaskTitleSnapshot: "Old task",
		StartedAt: "2026-10-26T09:00:00Z", LastHeartbeatAt: "2026-10-26T09:01:00Z",
		ActiveSeconds: 120, Revision: 1}
	write := func(input activity.Session) activity.Session {
		t.Helper()
		saved, err := store.UpsertSession(ctx, input)
		if err != nil { t.Fatal(err) }
		return saved
	}
	write(base)
	newer := base
	newer.Revision = 3
	newer.Title = "Latest"
	newer.WorkspaceTitleSnapshot = "Latest workspace"
	newer.TaskTitleSnapshot = "Latest task"
	newer.LastHeartbeatAt = "2026-10-26T09:03:00Z"
	write(newer)

	stale := base
	stale.Revision = 2
	stale.Title = "Stale"
	stale.LastHeartbeatAt = "2026-10-26T09:04:00Z"
	got := write(stale)
	if got.Revision != 3 || got.Title != "Latest" ||
		got.WorkspaceTitleSnapshot != "Latest workspace" ||
		got.TaskTitleSnapshot != "Latest task" ||
		got.LastHeartbeatAt != "2026-10-26T09:03:00.000000000Z" {
		t.Fatalf("older revision replaced authoritative context: %+v", got)
	}

	replayed := newer
	replayed.Title = "Conflicting duplicate"
	replayed.LastHeartbeatAt = "2026-10-26T09:05:00Z"
	got = write(replayed)
	if got.Title != "Latest" || got.Revision != 3 { t.Fatalf("equal revision changed metadata: %+v", got) }

	legacy := base
	legacy.Revision = 0
	legacy.ActiveSeconds = 180
	legacy.Title = "Unversioned progress"
	got = write(legacy)
	if got.ActiveSeconds != 180 || got.Title != "Latest" || got.Revision != 3 {
		t.Fatalf("mixed-version heartbeat regressed context or duration: %+v", got)
	}

	finish := legacy
	finish.ActiveSeconds = 60
	finish.EndedAt = stringPointer("2026-10-26T09:06:00Z")
	got = write(finish)
	if got.EndedAt == nil || got.ActiveSeconds != 180 || got.Revision != 3 || got.Title != "Latest" {
		t.Fatalf("legacy terminal intent was not durably applied: %+v", got)
	}
}

func TestActivityConcurrentVersionedHeartbeatsKeepHighestRevisionAndDuration(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-revision-race.db"))
	if err != nil { t.Fatal(err) }
	t.Cleanup(func() { _ = store.Close() })

	for i := 0; i < 12; i++ {
		base := activity.Session{ID: fmt.Sprintf("revision-%d:2026-10-26", i),
			ActivityDate: "2026-10-26", ActivityType: "read", Title: "Base",
			StartedAt: "2026-10-26T09:00:00Z", LastHeartbeatAt: "2026-10-26T09:00:00Z"}
		old := base
		old.Revision = 1
		old.Title = "Stale"
		old.ActiveSeconds = 180
		newer := base
		newer.Revision = 2
		newer.Title = "Latest revision"
		newer.ActiveSeconds = 120

		start := make(chan struct{})
		errs := make(chan error, 2)
		var wg sync.WaitGroup
		for _, candidate := range []activity.Session{old, newer} {
			wg.Add(1)
			go func(input activity.Session) {
				defer wg.Done()
				<-start
				_, err := store.UpsertSession(ctx, input)
				errs <- err
			}(candidate)
		}
		close(start)
		wg.Wait()
		close(errs)
		for err := range errs {
			if err != nil { t.Fatal(err) }
		}
		stored, err := scanActivitySession(store.db.QueryRowContext(ctx,
			"SELECT "+activityColumns+" FROM activity_sessions WHERE id=?", base.ID))
		if err != nil { t.Fatal(err) }
		if stored.ActiveSeconds != 180 || stored.Revision != 2 || stored.Title != "Latest revision" {
			t.Fatalf("concurrent order regressed session: %+v", stored)
		}
	}
}

func TestActivityVersionedFinishAndDeletedTombstone(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-version-finish.db"))
	if err != nil { t.Fatal(err) }
	t.Cleanup(func() { _ = store.Close() })

	base := activity.Session{ID: "deleted:2026-10-26", ActivityDate: "2026-10-26",
		ActivityType: "build", Title: "Running", Revision: 4, ActiveSeconds: 120,
		StartedAt: "2026-10-26T09:00:00Z", LastHeartbeatAt: "2026-10-26T09:02:00Z"}
	if _, err := store.UpsertSession(ctx, base); err != nil { t.Fatal(err) }
	lateFinish := base
	lateFinish.Revision = 3
	lateFinish.ActiveSeconds = 80
	lateFinish.EndedAt = stringPointer("2026-10-26T09:03:00Z")
	saved, err := store.UpsertSession(ctx, lateFinish)
	if err != nil { t.Fatal(err) }
	if saved.EndedAt == nil || saved.Revision != 4 || saved.ActiveSeconds != 120 {
		t.Fatalf("stale finish must apply terminal intent without regression: %+v", saved)
	}
	if err := store.DeleteActivitySession(ctx, "deleted"); err != nil { t.Fatal(err) }
	_, err = store.UpsertSession(ctx, lateFinish)
	if err != activity.ErrDeleted { t.Fatalf("deleted logical session resurrected: %v", err) }
}
