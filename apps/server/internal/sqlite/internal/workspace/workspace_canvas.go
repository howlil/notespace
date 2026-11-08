package workspacequery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func CanvasStateFromRow(row dbtx.Scanner) (workspacepkg.CanvasState, error) {
	var value workspacepkg.CanvasState
	var encoded string
	err := row.Scan(&encoded, &value.Version, &value.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, workspacepkg.ErrNotFound
	}
	if err != nil {
		return value, err
	}
	if err := json.Unmarshal([]byte(encoded), &value.Canvas); err != nil {
		return value, err
	}
	return value, nil
}
func GetCanvasState(db dbtx.DBTX, ctx context.Context, workspaceID string) (workspacepkg.CanvasState, error) {
	return CanvasStateFromRow(db.QueryRowContext(ctx,
		`SELECT canvas_state,version,updated_at FROM workspace_canvas WHERE workspace_id=?`,
		workspaceID,
	))
}

func CanvasElementCount(canvas workspacepkg.Snapshot) (int, error) {
	var scene struct {
		Elements []struct {
			IsDeleted bool `json:"isDeleted"`
		} `json:"elements"`
	}
	if err := json.Unmarshal(canvas.Data, &scene); err != nil {
		return 0, err
	}
	count := 0
	for _, element := range scene.Elements {
		if !element.IsDeleted {
			count++
		}
	}
	return count, nil
}
