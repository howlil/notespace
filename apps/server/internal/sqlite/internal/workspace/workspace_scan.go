package workspacequery

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	dbtx "github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func ReadProject(row dbtx.Scanner) (workspacepkg.Workspace, error) {
	var p workspacepkg.Workspace
	var references string
	err := row.Scan(
		&p.ID, &p.CategoryID, &p.Title, &references,
		&p.SplitRatio, &p.CreatedAt, &p.UpdatedAt, &p.Version,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return p, workspacepkg.ErrNotFound
	}
	if err != nil {
		return p, err
	}
	if err = json.Unmarshal([]byte(references), &p.References); err != nil {
		return p, fmt.Errorf("decode references: %w", err)
	}
	return p, nil
}

const Columns = `id,category_id,title,references_state,split_ratio,created_at,updated_at,version`
