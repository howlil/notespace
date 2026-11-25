package paging

import (
	"errors"
	"testing"
	"time"

	"github.com/howlil/notespace/apps/server/internal/domain"
)

func TestWorkspacePaginationInjectableClockAndInvalidation(t *testing.T) {
	now := time.Date(2026, 11, 25, 10, 0, 0, 0, time.UTC)
	cache := New(func() time.Time { return now })
	items := []domain.WorkspaceSummary{{ID: "ws-1", Title: "Alpha"}, {ID: "ws-2", Title: "Beta"}}

	q := domain.WorkspaceQuery{Limit: 1, Snapshot: domain.WorkspaceSnapshotStart}
	first, err := cache.Start(q, items)
	if err != nil || first.Snapshot == "" || first.NextOffset == nil || *first.NextOffset != 1 {
		t.Fatalf("Start page = (%+v, %v)", first, err)
	}
	second, err := cache.Read(domain.WorkspaceQuery{Limit: 1, Offset: 1, Snapshot: first.Snapshot})
	if err != nil || len(second.Items) != 1 || second.Items[0].ID != "ws-2" {
		t.Fatalf("second page = (%+v, %v)", second, err)
	}
	now = now.Add(SnapshotLifetime)
	if _, err := cache.Read(domain.WorkspaceQuery{Limit: 1, Offset: 0, Snapshot: first.Snapshot}); !errors.Is(err, domain.ErrWorkspaceConflict) {
		t.Fatalf("expired read error = %v, want ErrWorkspaceConflict", err)
	}

	active, err := cache.Start(q, items)
	if err != nil {
		t.Fatal(err)
	}
	cache.Invalidate()
	if _, err := cache.Read(domain.WorkspaceQuery{Limit: 1, Offset: 0, Snapshot: active.Snapshot}); !errors.Is(err, domain.ErrWorkspaceConflict) {
		t.Fatalf("invalidated read error = %v, want ErrWorkspaceConflict", err)
	}
}
