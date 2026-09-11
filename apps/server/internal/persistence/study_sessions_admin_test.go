package persistence

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/study"
)

func TestStudySessionHistoryGroupsAndDeletesLogicalSession(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "notespace.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	segments := []study.Session{
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

	sessions, err := store.ListStudySessions(ctx, "workspace-1", 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || sessions[0].ID != "session-1" || sessions[0].ActiveSeconds != 25*60 {
		t.Fatalf("sessions = %#v, want one 25 minute logical session", sessions)
	}

	if err := store.DeleteStudySession(ctx, "workspace-1", "session-1"); err != nil {
		t.Fatal(err)
	}
	sessions, err = store.ListStudySessions(ctx, "workspace-1", 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Fatalf("sessions after delete = %#v, want empty history", sessions)
	}
	if err := store.DeleteStudySession(ctx, "workspace-1", "session-1"); !errors.Is(err, study.ErrNotFound) {
		t.Fatalf("second delete error = %v, want study.ErrNotFound", err)
	}
}

func stringPointer(value string) *string { return &value }
