package activity

import (
	"context"
	"strings"
)

func (s Service) ListActivities(ctx context.Context, limit int) ([]Session, error) {
	if limit < 1 || limit > 100 {
		return nil, ErrInvalid
	}
	return s.store.ListActivitySessions(ctx, limit)
}

func (s Service) DeleteActivity(ctx context.Context, sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return ErrInvalid
	}
	return s.store.DeleteActivitySession(ctx, sessionID)
}

func (s Service) GetGlobalStats(ctx context.Context, activityDate string) (WorkspaceStats, error) {
	activityDate = strings.TrimSpace(activityDate)
	if activityDate == "" {
		activityDate = s.currentDate()
	}
	if !ValidDate(activityDate) {
		return WorkspaceStats{}, ErrInvalid
	}
	return s.store.GlobalStats(ctx, activityDate)
}

func (s Service) GetActivity(ctx context.Context, from, to string) (Activity, error) {
	if !ValidDate(from) || !ValidDate(to) || from > to {
		return Activity{}, ErrInvalid
	}
	return s.store.Activity(ctx, from, to)
}

func (s Service) GetDayDetail(ctx context.Context, date string) (DayDetail, error) {
	if !ValidDate(date) {
		return DayDetail{}, ErrInvalid
	}
	return s.store.DayDetail(ctx, date)
}
