package activity

import "context"

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

