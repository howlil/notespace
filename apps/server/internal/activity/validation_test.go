package activity

import (
	"errors"
	"strings"
	"testing"
)

func validSessionFixture() Session {
	return Session{
		ID:              "session-1",
		Title:           "Implement search",
		ActivityType:    "build",
		ActivityDate:    "2026-09-24",
		StartedAt:       "2026-09-24T10:00:00Z",
		ActiveSeconds:   300,
		LastHeartbeatAt: "2026-09-24T10:05:00Z",
	}
}

func TestValidateSessionOwnsSessionInvariants(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Session)
	}{
		{"blank id", func(session *Session) { session.ID = " " }},
		{"blank title", func(session *Session) { session.Title = " " }},
		{"title over limit", func(session *Session) { session.Title = strings.Repeat("🙂", 161) }},
		{"invalid activity type", func(session *Session) { session.ActivityType = "focus" }},
		{"invalid date", func(session *Session) { session.ActivityDate = "2026-02-30" }},
		{"negative active seconds", func(session *Session) { session.ActiveSeconds = -1 }},
		{"blank started at", func(session *Session) { session.StartedAt = "" }},
		{"invalid started at", func(session *Session) { session.StartedAt = "not-a-time" }},
		{"blank heartbeat", func(session *Session) { session.LastHeartbeatAt = "" }},
		{"invalid heartbeat", func(session *Session) { session.LastHeartbeatAt = "not-a-time" }},
		{"invalid ended at", func(session *Session) {
			value := "not-a-time"
			session.EndedAt = &value
		}},
		{"workspace without snapshot", func(session *Session) { session.WorkspaceID = "workspace-1" }},
		{"task without snapshot", func(session *Session) { session.TaskID = "task-1" }},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			session := validSessionFixture()
			tc.mutate(&session)
			if err := ValidateSession(session); !errors.Is(err, ErrInvalid) {
				t.Fatalf("ValidateSession() error = %v, want ErrInvalid", err)
			}
		})
	}
}

func TestValidateSessionAcceptsCanonicalSnapshots(t *testing.T) {
	session := validSessionFixture()
	session.WorkspaceID = "workspace-1"
	session.WorkspaceTitleSnapshot = "Notespace"
	session.TaskID = "task-1"
	session.TaskTitleSnapshot = "Ship tests"
	endedAt := "2026-09-24T10:10:00Z"
	session.EndedAt = &endedAt

	if err := ValidateSession(session); err != nil {
		t.Fatalf("valid session rejected: %v", err)
	}
}

func TestActivityValidationUsesCanonicalDateAndTypeValues(t *testing.T) {
	for _, date := range []string{"2026-09-24", "2024-02-29"} {
		if !ValidDate(date) {
			t.Fatalf("valid date %q rejected", date)
		}
	}
	for _, date := range []string{"", "2026-9-24", "2026-02-30", "24-09-2026"} {
		if ValidDate(date) {
			t.Fatalf("invalid date %q accepted", date)
		}
	}
	if !ValidActivityType(" build ") {
		t.Fatal("trimmed canonical activity type rejected")
	}
	if ValidActivityType("focus") {
		t.Fatal("unknown activity type accepted")
	}
}
