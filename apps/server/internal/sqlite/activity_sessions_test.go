package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

func TestStudySessionHistoryGroupsAndDeletesLogicalSession(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "notespace.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	segments := []activity.Session{
		{
			ID:                     "session-1:2026-09-10",
			WorkspaceID:            "workspace-1",
			WorkspaceTitleSnapshot: "Distributed Systems",
			ActivityDate:           "2026-09-10",
			StartedAt:              "2026-09-10T23:50:00Z",
			EndedAt:                stringPointer("2026-09-11T00:00:00Z"),
			ActiveSeconds:          10 * 60,
			LastHeartbeatAt:        "2026-09-11T00:00:00Z",
		},
		{
			ID:                     "session-1:2026-09-11",
			WorkspaceID:            "workspace-1",
			WorkspaceTitleSnapshot: "Distributed Systems",
			ActivityDate:           "2026-09-11",
			StartedAt:              "2026-09-11T00:00:00Z",
			EndedAt:                stringPointer("2026-09-11T00:15:00Z"),
			ActiveSeconds:          15 * 60,
			LastHeartbeatAt:        "2026-09-11T00:15:00Z",
		},
	}
	for _, session := range segments {
		if _, err := store.UpsertSession(ctx, session); err != nil {
			t.Fatal(err)
		}
	}

	renamed := segments[0]
	renamed.WorkspaceTitleSnapshot = "Distributed Systems Renamed"
	renamed.ActiveSeconds = 12 * 60
	renamed.LastHeartbeatAt = "2026-09-11T00:20:00Z"
	if _, err := store.UpsertSession(ctx, renamed); err != nil {
		t.Fatal(err)
	}

	sessions, err := store.ListActivitySessions(ctx, 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || sessions[0].ID != "session-1" || sessions[0].ActiveSeconds != 27*60 {
		t.Fatalf("sessions = %#v, want one 27 minute logical session", sessions)
	}
	if sessions[0].WorkspaceTitleSnapshot != "Distributed Systems Renamed" {
		t.Fatalf("workspace snapshot = %q, want renamed value", sessions[0].WorkspaceTitleSnapshot)
	}

	if err := store.DeleteActivitySession(ctx, "session-1"); err != nil {
		t.Fatal(err)
	}
	sessions, err = store.ListActivitySessions(ctx, 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Fatalf("sessions after delete = %#v, want empty history", sessions)
	}
	if err := store.DeleteActivitySession(ctx, "session-1"); !errors.Is(err, activity.ErrNotFound) {
		t.Fatalf("second delete error = %v, want activity.ErrNotFound", err)
	}
}

func stringPointer(value string) *string { return &value }

func TestActivitySessionIDRejectsIdentityReuse(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-identity.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	base := activity.Session{
		ID: "session-1:2026-09-10", Title: "Read paper", ActivityType: "read",
		ActivityDate: "2026-09-10", StartedAt: "2026-09-10T10:00:00Z",
		ActiveSeconds: 60, LastHeartbeatAt: "2026-09-10T10:01:00Z",
	}
	if _, err := store.UpsertSession(ctx, base); err != nil {
		t.Fatal(err)
	}
	reused := base
	reused.ActivityDate = "2026-09-11"
	reused.LastHeartbeatAt = "2026-09-11T10:01:00Z"
	if _, err := store.UpsertSession(ctx, reused); !errors.Is(err, activity.ErrConflict) {
		t.Fatalf("reused session ID error = %v, want activity.ErrConflict", err)
	}
	stored, err := store.ListActivitySessions(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored) != 1 || stored[0].ActivityDate != base.ActivityDate || stored[0].ActiveSeconds != base.ActiveSeconds {
		t.Fatalf("stored activity changed after identity conflict: %#v", stored)
	}
}

func TestLogicalActivityUsesLatestHeartbeatMetadata(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-latest-metadata.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	segments := []activity.Session{
		{
			ID: "session-1:2026-09-10", WorkspaceID: "workspace-1", WorkspaceTitleSnapshot: "Zeta",
			Title: "Zeta", ActivityType: "learn", ActivityDate: "2026-09-10",
			StartedAt: "2026-09-10T23:50:00Z", ActiveSeconds: 600, LastHeartbeatAt: "2026-09-11T00:00:00Z",
		},
		{
			ID: "session-1:2026-09-11", WorkspaceID: "workspace-1", WorkspaceTitleSnapshot: "Alpha",
			Title: "Alpha", ActivityType: "learn", ActivityDate: "2026-09-11",
			StartedAt: "2026-09-11T00:00:00Z", ActiveSeconds: 900, LastHeartbeatAt: "2026-09-11T00:15:00Z",
		},
	}
	for _, session := range segments {
		if _, err := store.UpsertSession(ctx, session); err != nil {
			t.Fatal(err)
		}
	}
	stored, err := store.ListActivitySessions(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored) != 1 || stored[0].WorkspaceTitleSnapshot != "Alpha" || stored[0].Title != "Alpha" {
		t.Fatalf("logical session metadata = %#v, want latest heartbeat metadata", stored)
	}
}
