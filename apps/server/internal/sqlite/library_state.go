package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

const libraryBackupFormat = "notespace-backup"
const libraryBackupVersion = 1

type workspaceEnvelope struct {
	Project workspacepkg.Workspace         `json:"project"`
	Plan    planning.Plan                  `json:"plan,omitempty"`
	History []workspacepkg.HistorySnapshot `json:"history"`
	Assets  []asset.Stored                 `json:"assets"`
}

type trashRecord struct {
	ID         string            `json:"id"`
	CategoryID string            `json:"categoryId"`
	Title      string            `json:"title"`
	DeletedAt  string            `json:"deletedAt"`
	Payload    workspaceEnvelope `json:"payload"`
}

type trashSummary struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Title      string `json:"title"`
	DeletedAt  string `json:"deletedAt"`
}

type libraryBackup struct {
	Format      string                         `json:"format"`
	Version     int                            `json:"version"`
	GeneratedAt string                         `json:"generatedAt"`
	Categories  []workspacepkg.CategorySummary `json:"categories"`
	Workspaces  []workspaceEnvelope            `json:"workspaces"`
	Tasks       []planning.Task                `json:"standaloneTasks,omitempty"`
	Trash       []trashRecord                  `json:"trash"`
	Activity    []activity.Session             `json:"studySessions"`
}

func validateWorkspaceEnvelope(envelope workspaceEnvelope, categoryID string) error {
	authored := envelope.Project
	authored.CategoryID = categoryID
	if err := workspacepkg.ValidateWorkspace(authored); err != nil {
		return err
	}
	for _, checkpoint := range envelope.History {
		if checkpoint.WorkspaceID != authored.ID {
			return workspacepkg.ErrInvalid
		}
		if err := workspacepkg.ValidateHistorySnapshot(checkpoint); err != nil {
			return err
		}
	}
	for _, stored := range envelope.Assets {
		if stored.ID == "" || stored.WorkspaceID != authored.ID || stored.MimeType == "" || len(stored.Data) == 0 {
			return workspacepkg.ErrInvalid
		}
		if err := asset.ValidateStored(stored); err != nil {
			return workspacepkg.ErrInvalid
		}
	}
	plan := envelope.Plan
	if plan.WorkspaceID == "" {
		plan.WorkspaceID = authored.ID
	}
	if err := planning.ValidatePlan(plan, authored.ID); err != nil {
		return workspacepkg.ErrInvalid
	}
	return nil
}

func restoreWorkspaceTx(ctx context.Context, tx *sql.Tx, envelope workspaceEnvelope, categoryID string) error {
	if err := validateWorkspaceEnvelope(envelope, categoryID); err != nil {
		return err
	}
	workspace := envelope.Project
	workspace.CategoryID = categoryID
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
	if err := insertGranularStateTx(ctx, tx, workspace); err != nil {
		return err
	}
	if err := restorePlanTx(ctx, tx, envelope.Plan, workspace.ID); err != nil {
		return err
	}
	for _, checkpoint := range envelope.History {
		if err := createHistory(ctx, tx, checkpoint); err != nil {
			return err
		}
	}
	for _, stored := range envelope.Assets {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at) VALUES (?,?,?,?,?)`,
			workspace.ID, stored.ID, stored.MimeType, stored.Data, stored.CreatedAt,
		); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE workspace_assets SET staged=0 WHERE workspace_id=? AND EXISTS (SELECT 1 FROM workspace_asset_references r WHERE r.workspace_id=? AND r.asset_id=workspace_assets.id)`, workspace.ID, workspace.ID); err != nil {
		return err
	}
	return nil
}
