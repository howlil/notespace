package workspacequery

import (
	"database/sql"
	"errors"

	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

// Metadata changes never rewrite granular authored Note or Canvas rows.
func WorkspaceReadError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return workspacepkg.ErrNotFound
	}
	return err
}
