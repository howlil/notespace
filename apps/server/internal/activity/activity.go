// Package activity owns durable timed activity. The package name remains for
// compatibility while the product model is now a generic ActivitySession.
package activity

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrNotFound             = errors.New("activity session not found")
	ErrInvalid              = errors.New("invalid activity")
	ErrTaskNotFound         = errors.New("activity task not found")
	ErrWorkspaceNotFound    = errors.New("activity workspace not found")
	ErrTaskWorkspaceMismatch = errors.New("activity task workspace mismatch")
)

const (
	ActivityDayThreshold = int64(10 * 60)
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

type TaskRef struct {
	Title       string
	WorkspaceID *string
}

type WorkspaceRef struct {
	Title string
}

type ReferenceLookup interface {
	LookupTask(context.Context, string) (TaskRef, bool, error)
	LookupWorkspace(context.Context, string) (WorkspaceRef, bool, error)
}

type Store interface {
	UpsertSession(context.Context, Session) (Session, error)
	ListWorkspaceSessions(context.Context, string, int) ([]Session, error)
	ListActivitySessions(context.Context, int) ([]Session, error)
	DeleteWorkspaceSession(context.Context, string, string) error
	DeleteActivitySession(context.Context, string) error
	WorkspaceStats(context.Context, string, string) (WorkspaceStats, error)
	GlobalStats(context.Context, string) (WorkspaceStats, error)
	Activity(context.Context, string, string) (Activity, error)
	DayDetail(context.Context, string) (DayDetail, error)
}

type Service struct {
	Store      Store
	References ReferenceLookup
	Now        func() time.Time
}

func NewService(store Store, references ReferenceLookup, now func() time.Time) Service {
	if store == nil {
		panic("activity: store is required")
	}
	if references == nil {
		panic("activity: reference lookup is required")
	}
	return Service{Store: store, References: references, Now: now}
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

func (s Service) RecordWorkspaceSession(ctx context.Context, workspaceID, sessionID string, input Heartbeat) (Session, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" || s.References == nil {
		return Session{}, ErrInvalid
	}
	workspace, found, err := s.References.LookupWorkspace(ctx, workspaceID)
	if err != nil {
		return Session{}, err
	}
	if !found {
		return Session{}, ErrWorkspaceNotFound
	}
	return s.recordActivity(ctx, sessionID, ActivityHeartbeat{
		Heartbeat:              input,
		Title:                  workspace.Title,
		ActivityType:           "learn",
		WorkspaceID:            workspaceID,
		WorkspaceTitleSnapshot: workspace.Title,
	})
}

// Record remains as a compatibility helper for callers that already resolved a
// Workspace title. New request flows should use RecordWorkspaceSession.
func (s Service) Record(ctx context.Context, workspaceID, workspaceTitle, sessionID string, input Heartbeat) (Session, error) {
	return s.recordActivity(ctx, sessionID, ActivityHeartbeat{
		Heartbeat:              input,
		Title:                  workspaceTitle,
		ActivityType:           "learn",
		WorkspaceID:            workspaceID,
		WorkspaceTitleSnapshot: workspaceTitle,
	})
}

func (s Service) RecordActivity(ctx context.Context, sessionID string, input ActivityHeartbeat) (Session, error) {
	if s.References == nil {
		return Session{}, ErrInvalid
	}
	if err := s.resolveReferences(ctx, &input); err != nil {
		return Session{}, err
	}
	return s.recordActivity(ctx, sessionID, input)
}

func (s Service) resolveReferences(ctx context.Context, input *ActivityHeartbeat) error {
	input.Title = strings.TrimSpace(input.Title)
	input.ActivityType = strings.TrimSpace(input.ActivityType)
	input.WorkspaceID = strings.TrimSpace(input.WorkspaceID)
	input.WorkspaceTitleSnapshot = strings.TrimSpace(input.WorkspaceTitleSnapshot)
	input.TaskID = strings.TrimSpace(input.TaskID)
	input.TaskTitleSnapshot = strings.TrimSpace(input.TaskTitleSnapshot)

	if input.TaskID != "" {
		task, found, err := s.References.LookupTask(ctx, input.TaskID)
		if err != nil {
			return err
		}
		if found {
			input.TaskTitleSnapshot = task.Title
			if task.WorkspaceID != nil {
				if input.WorkspaceID != "" && input.WorkspaceID != *task.WorkspaceID {
					return ErrTaskWorkspaceMismatch
				}
				input.WorkspaceID = *task.WorkspaceID
			}
			if input.Title == "" {
				input.Title = task.Title
			}
		} else {
			if input.TaskTitleSnapshot == "" {
				return ErrTaskNotFound
			}
			if input.Title == "" {
				input.Title = input.TaskTitleSnapshot
			}
		}
	}

	if input.WorkspaceID != "" {
		workspace, found, err := s.References.LookupWorkspace(ctx, input.WorkspaceID)
		if err != nil {
			return err
		}
		if found {
			input.WorkspaceTitleSnapshot = workspace.Title
			if input.Title == "" {
				input.Title = workspace.Title
			}
		} else {
			if input.WorkspaceTitleSnapshot == "" {
				return ErrWorkspaceNotFound
			}
			if input.Title == "" {
				input.Title = input.WorkspaceTitleSnapshot
			}
		}
	}
	return nil
}

func (s Service) recordActivity(ctx context.Context, sessionID string, input ActivityHeartbeat) (Session, error) {
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
	return s.Store.ListWorkspaceSessions(ctx, workspaceID, limit)
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
	return s.Store.DeleteWorkspaceSession(ctx, workspaceID, sessionID)
}

func (s Service) DeleteActivity(ctx context.Context, sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return ErrInvalid
	}
	return s.Store.DeleteActivitySession(ctx, sessionID)
}

func (s Service) GetWorkspaceStats(ctx context.Context, workspaceID, activityDate string) (WorkspaceStats, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" || !ValidDate(activityDate) || s.References == nil {
		return WorkspaceStats{}, ErrInvalid
	}
	_, found, err := s.References.LookupWorkspace(ctx, workspaceID)
	if err != nil {
		return WorkspaceStats{}, err
	}
	if !found {
		return WorkspaceStats{}, ErrWorkspaceNotFound
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
	if byDate[endDate] < ActivityDayThreshold {
		date = date.AddDate(0, 0, -1)
	}
	streak := 0
	for byDate[date.Format(DateLayout)] >= ActivityDayThreshold {
		streak++
		date = date.AddDate(0, 0, -1)
	}
	return streak
}
