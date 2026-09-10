package persistence

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/project"
)

func (s *Store) ListWorkspaces(ctx context.Context, query project.WorkspaceQuery) (project.WorkspacePage, error) {
	hasCanvas := ""
	if query.HasCanvas {
		hasCanvas = "true"
	}
	hasNotes := ""
	if query.HasNotes {
		hasNotes = "true"
	}
	return s.ListCategoryWorkspaces(
		ctx,
		query.CategoryID,
		query.Query,
		query.Sort,
		hasCanvas,
		hasNotes,
		query.Offset,
		query.Limit,
	)
}
