package sqlite

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (s *Store) ListWorkspaces(ctx context.Context, query workspace.WorkspaceQuery) (workspace.WorkspacePage, error) {
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
