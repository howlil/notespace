package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"time"
	"testing"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
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

func TestActivityTimestampsCanonicalizeAndLegacyOffsetsOrderByInstant(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "activity-offsets.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })

	stored, err := store.UpsertSession(ctx, activity.Session{
		ID: "canonical:2026-09-11", Title: "Canonical", ActivityType: "learn",
		ActivityDate:    "2026-09-11",
		StartedAt:       "2026-09-11T00:30:00+02:00",
		LastHeartbeatAt: "2026-09-11T00:45:00+02:00",
	})
	if err != nil {
		t.Fatal(err)
	}
	if stored.StartedAt != "2026-09-10T22:30:00.000000000Z" ||
		stored.LastHeartbeatAt != "2026-09-10T22:45:00.000000000Z" {
		t.Fatalf("canonical timestamps = started %q heartbeat %q", stored.StartedAt, stored.LastHeartbeatAt)
	}

	for _, row := range []struct {
		id, title, heartbeat string
	}{
		{"legacy:early", "Lexically later", "2026-09-11T00:30:00+02:00"},
		{"legacy:late", "Actually later", "2026-09-10T23:00:00Z"},
	} {
		if _, err := store.db.ExecContext(ctx, `
			INSERT INTO activity_sessions(
				id,logical_session_id,workspace_id,workspace_title_snapshot,
				task_id,task_title_snapshot,activity_title,activity_type,
				activity_date,started_at,ended_at,active_seconds,last_heartbeat_at
			) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
		`, row.id, "legacy", "", "", "", "", row.title, "learn",
			"2026-09-10", row.heartbeat, nil, 60, row.heartbeat); err != nil {
			t.Fatal(err)
		}
	}

	sessions, err := store.ListActivitySessions(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	var legacy *activity.Session
	for i := range sessions {
		if sessions[i].ID == "legacy" {
			legacy = &sessions[i]
			break
		}
	}
	if legacy == nil || legacy.Title != "Actually later" || legacy.LastHeartbeatAt != "2026-09-10T23:00:00Z" {
		t.Fatalf("legacy offset ordering = %#v, want actual latest instant", legacy)
	}
}

func TestAssignLegacyTaskWhileActivityRunningPreservesFinalization(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "legacy-activity-assignment.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	now := func() time.Time { return time.Date(2026, 10, 25, 9, 0, 0, 0, time.UTC) }

	owner, err := workspacepkg.NewService(store).Create(ctx, "Assigned Workspace")
	if err != nil {
		t.Fatal(err)
	}
	planner := planning.NewService(store, store, now)
	task, err := planner.CreateStandaloneTask(ctx, "Legacy session task", "")
	if err != nil {
		t.Fatal(err)
	}
	recorder := activity.NewService(store, store, now)
	first, err := recorder.RecordActivity(ctx, "assigned-legacy-session", activity.ActivityHeartbeat{
		Heartbeat: activity.Heartbeat{ActivityDate: "2026-10-25", ActiveSeconds: 60},
		Title: "Running legacy activity", ActivityType: "read", TaskID: task.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.WorkspaceID != "" {
		t.Fatalf("legacy session incorrectly has Workspace %q", first.WorkspaceID)
	}
	if _, err := planner.AssignStandaloneTask(ctx, task.ID, owner.ID, task.Version); err != nil {
		t.Fatal(err)
	}
	second, err := recorder.RecordActivity(ctx, "assigned-legacy-session", activity.ActivityHeartbeat{
		Heartbeat: activity.Heartbeat{ActivityDate: "2026-10-25", ActiveSeconds: 120, Finish: true},
		Title: "Running legacy activity", ActivityType: "read", TaskID: task.ID,
	})
	if err != nil {
		t.Fatalf("legacy finalization lost after task assignment: %v", err)
	}
	if second.WorkspaceID != "" || second.ActiveSeconds != 120 || second.EndedAt == nil {
		t.Fatalf("session attribution/time/finalization changed: %+v", second)
	}
	// New sessions started after assignment follow the Task's new owner.
	fresh, err := recorder.RecordActivity(ctx, "new-assigned-session", activity.ActivityHeartbeat{
		Heartbeat: activity.Heartbeat{ActivityDate: "2026-10-25", ActiveSeconds: 20},
		Title: "New owned activity", ActivityType: "read", TaskID: task.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if fresh.WorkspaceID != owner.ID {
		t.Fatalf("new Activity Workspace = %q, want %q", fresh.WorkspaceID, owner.ID)
	}
	// Historical completed session cannot be repurposed under the new owner.
	_, err = recorder.RecordActivity(ctx, "assigned-legacy-session", activity.ActivityHeartbeat{
		Heartbeat: activity.Heartbeat{ActivityDate: "2026-10-25", ActiveSeconds: 150, Finish: true},
		Title: "Reused activity", ActivityType: "read", TaskID: task.ID,
	})
	if !errors.Is(err, activity.ErrConflict) {
		t.Fatalf("completed historical session reused: %v", err)
	}
}
