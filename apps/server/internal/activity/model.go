// Package activity owns durable timed activity. ActivitySession is the canonical product model.
package activity

import "errors"

var (
	ErrNotFound              = errors.New("activity session not found")
	ErrInvalid               = errors.New("invalid activity")
	ErrTaskNotFound          = errors.New("activity task not found")
	ErrWorkspaceNotFound     = errors.New("activity workspace not found")
	ErrTaskWorkspaceMismatch = errors.New("activity task workspace mismatch")
)

const (
	ActivityDayThreshold = int64(10 * 60)
	DateLayout           = "2006-01-02"
)

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
