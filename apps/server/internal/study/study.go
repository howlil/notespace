// Package study owns time spent learning in a workspace. It is deliberately
// separate from the authored Project snapshot because it has a different write
// pattern and must survive workspace deletion.
package study

import (
	"context"
	"errors"
	"strings"
	"time"
)

var (
	ErrNotFound = errors.New("study session not found")
	ErrInvalid  = errors.New("invalid study activity")
)

const (
	StudyDayThreshold = int64(10 * 60)
	DateLayout        = "2006-01-02"
)

type Session struct {
	ID                     string  `json:"id"`
	WorkspaceID            string  `json:"workspaceId"`
	WorkspaceTitleSnapshot string  `json:"workspaceTitleSnapshot"`
	ActivityDate           string  `json:"activityDate"`
	StartedAt              string  `json:"startedAt"`
	EndedAt                *string `json:"endedAt"`
	ActiveSeconds          int64   `json:"activeSeconds"`
	LastHeartbeatAt        string  `json:"lastHeartbeatAt"`
}

type Heartbeat struct {
	ActivityDate  string `json:"activityDate"`
	ActiveSeconds int64  `json:"activeSeconds"`
	Finish        bool   `json:"finish"`
}

type WorkspaceStats struct {
	TodaySeconds int64 `json:"todaySeconds"`
	TotalSeconds int64 `json:"totalSeconds"`
}

type DayActivity struct {
	Date          string `json:"date"`
	ActiveSeconds int64  `json:"activeSeconds"`
}

type Activity struct {
	TodaySeconds  int64         `json:"todaySeconds"`
	WeekSeconds   int64         `json:"weekSeconds"`
	CurrentStreak int           `json:"currentStreak"`
	Days          []DayActivity `json:"days"`
}

type WorkspaceBreakdown struct {
	WorkspaceID   string `json:"workspaceId"`
	Title         string `json:"title"`
	Deleted       bool   `json:"deleted"`
	ActiveSeconds int64  `json:"activeSeconds"`
}

type DayDetail struct {
	Date          string               `json:"date"`
	ActiveSeconds int64                `json:"activeSeconds"`
	Workspaces    []WorkspaceBreakdown `json:"workspaces"`
}

type Store interface {
	UpsertSession(context.Context, Session) (Session, error)
	WorkspaceStats(context.Context, string, string) (WorkspaceStats, error)
	Activity(context.Context, string, string) (Activity, error)
	DayDetail(context.Context, string) (DayDetail, error)
}

type Service struct {
	Store Store
	Now   func() time.Time
}

func (s Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}

func ValidDate(value string) bool {
	parsed, err := time.Parse(DateLayout, value)
	return err == nil && parsed.Format(DateLayout) == value
}

func (s Service) Record(ctx context.Context, workspaceID, workspaceTitle, sessionID string, input Heartbeat) (Session, error) {
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(sessionID) == "" || strings.TrimSpace(workspaceTitle) == "" || !ValidDate(input.ActivityDate) || input.ActiveSeconds < 0 {
		return Session{}, ErrInvalid
	}
	now := s.now().Format(time.RFC3339Nano)
	var endedAt *string
	if input.Finish {
		endedAt = &now
	}
	return s.Store.UpsertSession(ctx, Session{
		ID: sessionID, WorkspaceID: workspaceID, WorkspaceTitleSnapshot: workspaceTitle,
		ActivityDate: input.ActivityDate, StartedAt: now, EndedAt: endedAt,
		ActiveSeconds: input.ActiveSeconds, LastHeartbeatAt: now,
	})
}

func (s Service) GetWorkspaceStats(ctx context.Context, workspaceID, activityDate string) (WorkspaceStats, error) {
	if strings.TrimSpace(workspaceID) == "" || !ValidDate(activityDate) {
		return WorkspaceStats{}, ErrInvalid
	}
	return s.Store.WorkspaceStats(ctx, workspaceID, activityDate)
}

func (s Service) GetActivity(ctx context.Context, from, to string) (Activity, error) {
	if !ValidDate(from) || !ValidDate(to) || from > to {
		return Activity{}, ErrInvalid
	}
	return s.Store.Activity(ctx, from, to)
}

func (s Service) GetDayDetail(ctx context.Context, date string) (DayDetail, error) {
	if !ValidDate(date) {
		return DayDetail{}, ErrInvalid
	}
	return s.Store.DayDetail(ctx, date)
}

func CalculateStreak(days []DayActivity, endDate string) int {
	if !ValidDate(endDate) {
		return 0
	}
	byDate := make(map[string]int64, len(days))
	for _, day := range days {
		if ValidDate(day.Date) {
			byDate[day.Date] = int64(day.ActiveSeconds)
		}
	}
	date, _ := time.Parse(DateLayout, endDate)
	if byDate[endDate] < StudyDayThreshold {
		date = date.AddDate(0, 0, -1)
	}
	streak := 0
	for byDate[date.Format(DateLayout)] >= StudyDayThreshold {
		streak++
		date = date.AddDate(0, 0, -1)
	}
	return streak
}
