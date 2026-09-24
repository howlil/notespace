package workspace

import "context"

type CategoryStore interface {
	CreateCategory(context.Context, CategorySummary) error
	UpdateCategory(context.Context, string, string) (CategorySummary, error)
	ListCategories(context.Context) ([]CategorySummary, error)
	CategoryExists(context.Context, string) (bool, error)
}

type WorkspaceStore interface {
	Create(context.Context, Workspace) error
	List(context.Context) ([]Summary, error)
	ListRecent(context.Context, int) ([]Summary, error)
	ListWorkspaces(context.Context, WorkspaceQuery) (WorkspacePage, error)
	Move(context.Context, string, string) (Workspace, error)
	Update(context.Context, string, Update) (Workspace, error)
}

type SearchStore interface {
	Search(context.Context, string) ([]SearchResult, error)
}

// Store is the composition used by the application service. Tests and future
// adapters may depend on the narrower capability interfaces above.
type Store interface {
	CategoryStore
	WorkspaceStore
	GranularStore
	WorkspaceQueryStore
	SearchStore
}
