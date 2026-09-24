package sqlite

import (
	"context"
	"database/sql"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

func restoreStandaloneTasksTx(ctx context.Context, tx *sql.Tx, tasks []planning.Task) error {
	for _, task := range tasks {
		if err := planning.ValidateStandaloneTask(task); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version)
			VALUES (?,?,?,?,?,?,?,?,?,?,?)
		`, task.ID, nil, nil, task.Title, task.Description, task.Position, task.PlannedFor, task.CompletedAt, task.CreatedAt, task.UpdatedAt, task.Version); err != nil {
			return err
		}
	}
	return nil
}

func restorePlanTx(ctx context.Context, tx *sql.Tx, plan planning.Plan, workspaceID string) error {
	if plan.WorkspaceID == "" {
		plan.WorkspaceID = workspaceID
	}
	if err := planning.ValidatePlan(plan, workspaceID); err != nil {
		return err
	}
	for _, milestone := range plan.Milestones {
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_milestones(id,workspace_id,title,position,completed_at,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?)`,
			milestone.ID, workspaceID, milestone.Title, milestone.Position, milestone.CompletedAt, milestone.CreatedAt, milestone.UpdatedAt, milestone.Version); err != nil {
			return err
		}
	}
	for _, task := range plan.Tasks {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version)
			VALUES (?,?,?,?,?,?,?,?,?,?,?)
		`, task.ID, workspaceID, task.MilestoneID, task.Title, task.Description, task.Position, task.PlannedFor, task.CompletedAt, task.CreatedAt, task.UpdatedAt, task.Version); err != nil {
			return err
		}
	}
	return nil
}
