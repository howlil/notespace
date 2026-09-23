package planning

import "errors"

var (
	ErrNotFound = errors.New("planning item not found")
	ErrInvalid  = errors.New("invalid planning input")
	ErrConflict = errors.New("planning item changed in another session")
)

type Milestone struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	Title       string  `json:"title"`
	Position    int     `json:"position"`
	CompletedAt *string `json:"completedAt"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	Version     int     `json:"version"`
}

type Task struct {
	ID          string  `json:"id"`
	WorkspaceID *string `json:"workspaceId,omitempty"`
	MilestoneID *string `json:"milestoneId,omitempty"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Position    int     `json:"position"`
	PlannedFor  *string `json:"plannedFor,omitempty"`
	CompletedAt *string `json:"completedAt"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	Version     int     `json:"version"`
}

type TodayTask struct {
	Task
	WorkspaceTitle *string `json:"workspaceTitle,omitempty"`
	MilestoneTitle *string `json:"milestoneTitle,omitempty"`
}

type Today struct {
	Date  string      `json:"date"`
	Tasks []TodayTask `json:"tasks"`
}

type Inbox struct {
	Tasks []Task `json:"tasks"`
}

type Plan struct {
	WorkspaceID string      `json:"workspaceId"`
	Milestones  []Milestone `json:"milestones"`
	Tasks       []Task      `json:"tasks"`
}

type MilestonePatch struct {
	Title     *string `json:"title"`
	Completed *bool   `json:"completed"`
	Version   int     `json:"version"`
}

type TaskPatch struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Completed   *bool   `json:"completed"`
	PlannedFor  *string `json:"plannedFor"`
	Version     int     `json:"version"`
}
