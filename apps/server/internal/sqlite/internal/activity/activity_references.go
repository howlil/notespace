package activityquery

import (
	"context"
	"database/sql"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

func LookupWorkspace(db dbtx.DBTX, ctx context.Context, id string) (activity.WorkspaceRef, bool, error) {
	var ref activity.WorkspaceRef
	err := db.QueryRowContext(ctx, `SELECT title FROM projects WHERE id=?`, id).Scan(&ref.Title)
	if errors.Is(err, sql.ErrNoRows) {
		return activity.WorkspaceRef{}, false, nil
	}
	if err != nil {
		return activity.WorkspaceRef{}, false, err
	}
	return ref, true, nil
}
