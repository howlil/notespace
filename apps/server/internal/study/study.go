// Package study owns durable timed activity. The package name remains for
// compatibility while the product model is now a generic ActivitySession.
package study

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrNotFound = errors.New("activity session not found")
	ErrInvalid  = errors.New("invalid activity")
)

const (
	StudyDayThreshold = int64(10 * 60)
	DateLayout        = "2006-01-02"
)

var validActivityTypes = map[string]bool{
	"build": true, "learn": true, "read": true,
	"write": true, "exercise": true, "other": true,
}

type Session struct {
	ID                     string  `json:"id"`
	WorkspaceID            string  `json:"workspaceId,omitempty"`
	WorkspaceTitleSnapshot string  `json:"workspaceTitleSnapshot,omitempty"`
	TaskID                 string  `json:"taskId,omitempty"`
	TaskTitleSnapshot      string  `json:"taskTitleSnapshot,omitempty"`
	Title                  string  `json:"title"`
	ActivityType           string  `json:"activityType"`
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

type ActivityHeartbeat struct {
	Heartbeat
	Title                  string `json:"title"`
	ActivityType           string `json:"activityType"`
	WorkspaceID            string `json:"workspaceId,omitempty"`
	WorkspaceTitleSnapshot string `json:"workspaceTitleSnapshot,omitempty"`
	TaskID                 string `json:"taskId,omitempty"`
	TaskTitleSnapshot      string `json:"taskTitleSnapshot,omitempty"`
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
	WorkspaceID   string `json:"workspaceId,omitempty"`
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
	ListStudySessions(context.Context, string, int) ([]Session, error)
	ListActivitySessions(context.Context, int) ([]Session, error)
	DeleteStudySession(context.Context, string, string) error
	DeleteActivitySession(context.Context, string) error
	WorkspaceStats(context.Context, string, string) (WorkspaceStats, error)
	GlobalStats(context.Context, string) (WorkspaceStats, error)
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

func validTitle(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && utf8.RuneCountInString(value) <= 160
}

func ValidActivityType(value string) bool {
	return validActivityTypes[strings.TrimSpace(value)]
}

func (s Service) Record(ctx context.Context, workspaceID, workspaceTitle, sessionID string, input Heartbeat) (Session, error) {
	return s.RecordActivity(ctx, sessionID, ActivityHeartbeat{
		Heartbeat:              input,
		Title:                  workspaceTitle,
		ActivityType:           "learn",
		WorkspaceID:            workspaceID,
		WorkspaceTitleSnapshot: workspaceTitle,
	})
}

func (s Service) RecordActivity(ctx context.Context, sessionID string, input ActivityHeartbeat) (Session, error) {
	input.Title = strings.TrimSpace(input.Title)
	input.ActivityType = strings.TrimSpace(input.ActivityType)
	input.WorkspaceID = strings.TrimSpace(input.WorkspaceID)
	input.WorkspaceTitleSnapshot = strings.TrimSpace(input.WorkspaceTitleSnapshot)
	input.TaskID = strings.TrimSpace(input.TaskID)
	input.TaskTitleSnapshot = strings.TrimSpace(input.TaskTitleSnapshot)
	if strings.TrimSpace(sessionID) == "" || !validTitle(input.Title) || !ValidActivityType(input.ActivityType) || !ValidDate(input.ActivityDate) || input.ActiveSeconds < 0 {
		return Session{}, ErrInvalid
	}
	if input.WorkspaceID != "" && input.WorkspaceTitleSnapshot == "" {
		return Session{}, ErrInvalid
	}
	if input.TaskID != "" && input.TaskTitleSnapshot == "" {
		return Session{}, ErrInvalid
	}
	now := s.now().Format(time.RFC3339Nano)
	var endedAt *string
	if input.Finish {
		endedAt = &now
	}
	return s.Store.UpsertSession(ctx, Session{
		ID:                     sessionID,
		WorkspaceID:            input.WorkspaceID,
		WorkspaceTitleSnapshot: input.WorkspaceTitleSnapshot,
		TaskID:                 input.TaskID,
		TaskTitleSnapshot:      input.TaskTitleSnapshot,
		Title:                  input.Title,
		ActivityType:           input.ActivityType,
		ActivityDate:           input.ActivityDate,
		StartedAt:              now,
		EndedAt:                endedAt,
		ActiveSeconds:          input.ActiveSeconds,
		LastHeartbeatAt:        now,
	})
}

func (s Service) ListSessions(ctx context.Context, workspaceID string, limit int) ([]Session, error) {
	if strings.TrimSpace(workspaceID) == "" || limit < 1 || limit > 50 {
		return nil, ErrInvalid
	}
	return s.Store.ListStudySessions(ctx, workspaceID, limit)
}

func (s Service) ListActivities(ctx context.Context, limit int) ([]Session, error) {
	if limit < 1 || limit > 100 {
		return nil, ErrInvalid
	}
	return s.Store.ListActivitySessions(ctx, limit)
}

func (s Service) DeleteSession(ctx context.Context, workspaceID, sessionID string) error {
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(sessionID) == "" {
		return ErrInvalid
	}
	return s.Store.DeleteStudySession(ctx, workspaceID, sessionID)
}

func (s Service) DeleteActivity(ctx context.Context, sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return ErrInvalid
	}
	return s.Store.DeleteActivitySession(ctx, sessionID)
}

func (s Service) GetWorkspaceStats(ctx context.Context, workspaceID, activityDate string) (WorkspaceStats, error) {
	if strings.TrimSpace(workspaceID) == "" || !ValidDate(activityDate) {
		return WorkspaceStats{}, ErrInvalid
	}
	return s.Store.WorkspaceStats(ctx, workspaceID, activityDate)
}

func (s Service) GetGlobalStats(ctx context.Context, activityDate string) (WorkspaceStats, error) {
	if !ValidDate(activityDate) {
		return WorkspaceStats{}, ErrInvalid
	}
	return s.Store.GlobalStats(ctx, activityDate)
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
