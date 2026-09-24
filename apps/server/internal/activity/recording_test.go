package activity

import (
	"context"
	"errors"
	"testing"
	"time"
)

type recordingStore struct {
	upsertInput Session
	upsertCalls int
	upsertErr   error
}

func (s *recordingStore) UpsertSession(_ context.Context, session Session) (Session, error) {
	s.upsertCalls++
	s.upsertInput = session
	if s.upsertErr != nil {
		return Session{}, s.upsertErr
	}
	return session, nil
}

func (s *recordingStore) ListActivitySessions(context.Context, int) ([]Session, error) {
	return nil, nil
}

func (s *recordingStore) DeleteActivitySession(context.Context, string) error {
	return nil
}

func (s *recordingStore) GlobalStats(context.Context, string) (WorkspaceStats, error) {
	return WorkspaceStats{}, nil
}

func (s *recordingStore) Activity(context.Context, string, string) (Activity, error) {
	return Activity{}, nil
}

func (s *recordingStore) DayDetail(context.Context, string) (DayDetail, error) {
	return DayDetail{}, nil
}

func TestRecordActivityBuildsDeterministicNormalizedSession(t *testing.T) {
	fixed := time.Date(2026, 9, 24, 10, 0, 0, 0, time.UTC)
	store := &recordingStore{}
	service := NewService(
		store,
		referenceFixture{tasks: map[string]TaskRef{}, workspaces: map[string]WorkspaceRef{}},
		func() time.Time { return fixed },
	)

	got, err := service.RecordActivity(context.Background(), " session-1 ", ActivityHeartbeat{
		Heartbeat: Heartbeat{
			ActivityDate:  "2026-09-24",
			ActiveSeconds: 300,
		},
		Title:        " Build Notespace ",
		ActivityType: " build ",
	})
	if err != nil {
		t.Fatal(err)
	}

	wantTime := fixed.Format(time.RFC3339Nano)
	if got.ID != "session-1" || got.Title != "Build Notespace" || got.ActivityType != "build" {
		t.Fatalf("normalized session = %#v", got)
	}
	if got.StartedAt != wantTime || got.LastHeartbeatAt != wantTime || got.EndedAt != nil {
		t.Fatalf("timestamps = %#v", got)
	}
	if store.upsertCalls != 1 || store.upsertInput.ID != got.ID {
		t.Fatalf("store calls=%d input=%#v", store.upsertCalls, store.upsertInput)
	}
}

func TestRecordActivityFinishSetsEndedAt(t *testing.T) {
	fixed := time.Date(2026, 9, 24, 10, 30, 0, 0, time.UTC)
	store := &recordingStore{}
	service := NewService(
		store,
		referenceFixture{tasks: map[string]TaskRef{}, workspaces: map[string]WorkspaceRef{}},
		func() time.Time { return fixed },
	)

	got, err := service.RecordActivity(context.Background(), "session-1", ActivityHeartbeat{
		Heartbeat: Heartbeat{
			ActivityDate:  "2026-09-24",
			ActiveSeconds: 600,
			Finish:        true,
		},
		Title:        "Read paper",
		ActivityType: "read",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := fixed.Format(time.RFC3339Nano)
	if got.EndedAt == nil || *got.EndedAt != want {
		t.Fatalf("EndedAt = %#v, want %q", got.EndedAt, want)
	}
}

func TestRecordActivityRejectsInvalidSessionBeforeStore(t *testing.T) {
	store := &recordingStore{}
	service := NewService(
		store,
		referenceFixture{tasks: map[string]TaskRef{}, workspaces: map[string]WorkspaceRef{}},
		func() time.Time { return time.Date(2026, 9, 24, 10, 0, 0, 0, time.UTC) },
	)

	_, err := service.RecordActivity(context.Background(), "session-1", ActivityHeartbeat{
		Heartbeat: Heartbeat{
			ActivityDate:  "2026-09-24",
			ActiveSeconds: -1,
		},
		Title:        "Invalid",
		ActivityType: "build",
	})
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("error = %v, want ErrInvalid", err)
	}
	if store.upsertCalls != 0 {
		t.Fatalf("store calls = %d, want 0", store.upsertCalls)
	}
}

func TestRecordActivityPropagatesStoreFailure(t *testing.T) {
	want := errors.New("store unavailable")
	store := &recordingStore{upsertErr: want}
	service := NewService(
		store,
		referenceFixture{tasks: map[string]TaskRef{}, workspaces: map[string]WorkspaceRef{}},
		func() time.Time { return time.Date(2026, 9, 24, 10, 0, 0, 0, time.UTC) },
	)

	_, err := service.RecordActivity(context.Background(), "session-1", ActivityHeartbeat{
		Heartbeat: Heartbeat{
			ActivityDate:  "2026-09-24",
			ActiveSeconds: 60,
		},
		Title:        "Build",
		ActivityType: "build",
	})
	if !errors.Is(err, want) {
		t.Fatalf("error = %v, want %v", err, want)
	}
}
