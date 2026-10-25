package planning

import "context"

type Store interface {
	GetPlan(context.Context, string) (Plan, error)
	GetTask(context.Context, string) (Task, error)
	ListToday(context.Context, string) ([]TodayTask, error)
	ListInbox(context.Context) ([]Task, error)
	ListUnassignedTasks(context.Context) ([]Task, error)
	CreateMilestone(context.Context, Milestone) (Milestone, error)
	CreateMilestoneIdempotent(context.Context, Milestone, string) (Milestone, error)
	UpdateMilestone(context.Context, Milestone) (Milestone, error)
	DeleteMilestone(context.Context, string, string, int) error
	CreateTask(context.Context, Task) (Task, error)
	CreateTaskIdempotent(context.Context, Task, string) (Task, error)
	AssignStandaloneTask(context.Context, string, string, int, string) (Task, error)
	UpdateTask(context.Context, Task) (Task, error)
	DeleteTask(context.Context, string, int) error
}

type WorkspaceLookup interface {
	WorkspaceExists(context.Context, string) (bool, error)
}
