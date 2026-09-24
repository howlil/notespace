package activity

import (
	"context"
	"errors"
	"testing"
	"time"
)

type queryTestStore struct {
	listLimit    int
	deleteID     string
	deleteCalls  int
	statsDate    string
	activityFrom string
	activityTo   string
	detailDate   string
}

func (s *queryTestStore) UpsertSession(_ context.Context, session Session) (Session, error) {
	return session, nil
}

func (s *queryTestStore) ListActivitySessions(_ context.Context, limit int) ([]Session, error) {
	s.listLimit = limit
	return nil, nil
}

func (s *queryTestStore) DeleteActivitySession(_ context.Context, id string) error {
	s.deleteCalls++
	s.deleteID = id
	return nil
}

func (s *queryTestStore) GlobalStats(_ context.Context, date string) (WorkspaceStats, error) {
	s.statsDate = date
	return WorkspaceStats{}, nil
}

func (s *queryTestStore) Activity(_ context.Context, from, to string) (Activity, error) {
	s.activityFrom = from
	s.activityTo = to
	return Activity{}, nil
}

func (s *queryTestStore) DayDetail(_ context.Context, date string) (DayDetail, error) {
	s.detailDate = date
	return DayDetail{}, nil
}

func queryTestService(store Store) Service {
	return NewService(
		store,
		referenceFixture{tasks: map[string]TaskRef{}, workspaces: map[string]WorkspaceRef{}},
		func() time.Time { return time.Date(2026, 9, 25, 1, 0, 0, 0, time.UTC) },
	)
}

func TestDeleteActivityNormalizesSessionID(t *testing.T) {
	store := &queryTestStore{}
	if err := queryTestService(store).DeleteActivity(context.Background(), " session-1 "); err != nil {
		t.Fatal(err)
	}
	if store.deleteCalls != 1 || store.deleteID != "session-1" {
		t.Fatalf("delete calls=%d id=%q", store.deleteCalls, store.deleteID)
	}
}

func TestDeleteActivityRejectsBlankID(t *testing.T) {
	store := &queryTestStore{}
	if err := queryTestService(store).DeleteActivity(context.Background(), "   "); !errors.Is(err, ErrInvalid) {
		t.Fatalf("error = %v, want ErrInvalid", err)
	}
	if store.deleteCalls != 0 {
		t.Fatalf("delete calls = %d, want 0", store.deleteCalls)
	}
}

func TestListActivitiesValidatesLimit(t *testing.T) {
	for _, tc := range []struct {
		limit int
		valid bool
	}{
		{0, false},
		{1, true},
		{100, true},
		{101, false},
	} {
		store := &queryTestStore{}
		_, err := queryTestService(store).ListActivities(context.Background(), tc.limit)
		if tc.valid {
			if err != nil {
				t.Fatalf("limit %d: %v", tc.limit, err)
			}
			if store.listLimit != tc.limit {
				t.Fatalf("limit %d delegated as %d", tc.limit, store.listLimit)
			}
			continue
		}
		if !errors.Is(err, ErrInvalid) {
			t.Fatalf("limit %d error = %v, want ErrInvalid", tc.limit, err)
		}
		if store.listLimit != 0 {
			t.Fatalf("invalid limit %d reached store", tc.limit)
		}
	}
}

func TestGetGlobalStatsDefaultsToCurrentDate(t *testing.T) {
	store := &queryTestStore{}
	if _, err := queryTestService(store).GetGlobalStats(context.Background(), ""); err != nil {
		t.Fatal(err)
	}
	if store.statsDate != "2026-09-25" {
		t.Fatalf("stats date = %q, want 2026-09-25", store.statsDate)
	}
	if _, err := queryTestService(store).GetGlobalStats(context.Background(), "2026-02-30"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid date error = %v, want ErrInvalid", err)
	}
}

func TestGetActivityValidatesRangeBeforeStore(t *testing.T) {
	for _, tc := range []struct {
		from string
		to   string
	}{
		{"2026-02-30", "2026-09-25"},
		{"2026-09-01", "2026-02-30"},
		{"2026-09-26", "2026-09-25"},
	} {
		store := &queryTestStore{}
		_, err := queryTestService(store).GetActivity(context.Background(), tc.from, tc.to)
		if !errors.Is(err, ErrInvalid) {
			t.Fatalf("GetActivity(%q,%q) error = %v, want ErrInvalid", tc.from, tc.to, err)
		}
		if store.activityFrom != "" || store.activityTo != "" {
			t.Fatal("invalid activity range reached store")
		}
	}

	store := &queryTestStore{}
	if _, err := queryTestService(store).GetActivity(context.Background(), "2026-09-01", "2026-09-25"); err != nil {
		t.Fatal(err)
	}
	if store.activityFrom != "2026-09-01" || store.activityTo != "2026-09-25" {
		t.Fatalf("delegated range = %q..%q", store.activityFrom, store.activityTo)
	}
}

func TestGetDayDetailValidatesDateBeforeStore(t *testing.T) {
	store := &queryTestStore{}
	if _, err := queryTestService(store).GetDayDetail(context.Background(), "2026-02-30"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("error = %v, want ErrInvalid", err)
	}
	if store.detailDate != "" {
		t.Fatal("invalid day detail reached store")
	}
	if _, err := queryTestService(store).GetDayDetail(context.Background(), "2026-09-25"); err != nil {
		t.Fatal(err)
	}
	if store.detailDate != "2026-09-25" {
		t.Fatalf("detail date = %q", store.detailDate)
	}
}
