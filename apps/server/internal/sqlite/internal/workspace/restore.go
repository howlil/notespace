package workspacequery

import (
	"context"
	"encoding/json"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func Restore(ctx context.Context, tx dbtx.DBTX, workspace workspacepkg.Workspace, history []workspacepkg.HistorySnapshot) error {
	references, err := json.Marshal(workspace.References)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO projects(id,category_id,title,references_state,split_ratio,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?)`,
		workspace.ID, workspace.CategoryID, workspace.Title, references,
		workspace.SplitRatio, workspace.CreatedAt, workspace.UpdatedAt, workspace.Version,
	); err != nil {
		return err
	}
	if err := InsertGranularStateTx(ctx, tx, workspace); err != nil {
		return err
	}
	for _, checkpoint := range history {
		if err := CreateHistory(ctx, tx, checkpoint); err != nil {
			return err
		}
	}
	return nil
}
