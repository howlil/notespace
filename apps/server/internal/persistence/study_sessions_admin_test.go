package persistence

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/study"
)

func TestStudySessionHistoryCanBeListedAndDeleted(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "notespace.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	session := study.Session{
		ID:                     "session-1",
		WorkspaceID:            "workspace-1",
		WorkspaceTitleSnapshot: "Distributed Systems",
		ActivityDate:           "2026-09-11",
		StartedAt:              "2026-09-11T01:00:00Z",
		ActiveSeconds:          25 * 60,
		LastHeartbeatAt:        "2026-09-11T01:25:00Z",
	}
	if _, err := store.UpsertSession(ctx, session); err != nil {
		t.Fatal(err)
	}

	sessions, err := store.ListStudySessions(ctx, session.WorkspaceID, 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 || sessions[0].ID != session.ID || sessions[0].ActiveSeconds != session.ActiveSeconds {
		t.Fatalf("sessions = %#v, want the recorded session", sessions)
	}

	if err := store.DeleteStudySession(ctx, session.WorkspaceID, session.ID); err != nil {
		t.Fatal(err)
	}
	sessions, err = store.ListStudySessions(ctx, session.WorkspaceID, 8)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Fatalf("sessions after delete = %#v, want empty history", sessions)
	}
	if err := store.DeleteStudySession(ctx, session.WorkspaceID, session.ID); !errors.Is(err, study.ErrNotFound) {
		t.Fatalf("second delete error = %v, want study.ErrNotFound", err)
	}
}
