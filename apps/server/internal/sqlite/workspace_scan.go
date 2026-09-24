package sqlite

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

type scanner interface{ Scan(...any) error }

func readProject(row scanner) (workspace.Workspace, error) {
	var p workspace.Workspace
	var references string
	err := row.Scan(
		&p.ID, &p.CategoryID, &p.Title, &references,
		&p.SplitRatio, &p.CreatedAt, &p.UpdatedAt, &p.Version,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return p, workspace.ErrNotFound
	}
	if err != nil {
		return p, err
	}
	if err = json.Unmarshal([]byte(references), &p.References); err != nil {
		return p, fmt.Errorf("decode references: %w", err)
	}
	return p, nil
}

const columns = `id,category_id,title,references_state,split_ratio,created_at,updated_at,version`
