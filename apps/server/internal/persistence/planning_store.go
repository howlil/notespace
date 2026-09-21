package persistence

import (
	"context"
	"database/sql"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

type planningQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func readPlan(ctx context.Context, q planningQueryer, workspaceID string) (planning.Plan, error) {
	milestoneRows, err := q.QueryContext(ctx, `SELECT id,workspace_id,title,position,completed_at,created_at,updated_at,version FROM workspace_milestones WHERE workspace_id=? ORDER BY position,id`, workspaceID)
	if err != nil {
		return planning.Plan{}, err
	}
	milestones := []planning.Milestone{}
	for milestoneRows.Next() {
		var item planning.Milestone
		var completed sql.NullString
		if err := milestoneRows.Scan(&item.ID, &item.WorkspaceID, &item.Title, &item.Position, &completed, &item.CreatedAt, &item.UpdatedAt, &item.Version); err != nil {
			milestoneRows.Close()
			return planning.Plan{}, err
		}
		if completed.Valid {
			value := completed.String
			item.CompletedAt = &value
		}
		milestones = append(milestones, item)
	}
	if err := milestoneRows.Err(); err != nil {
		milestoneRows.Close()
		return planning.Plan{}, err
	}
	milestoneRows.Close()

	taskRows, err := q.QueryContext(ctx, `SELECT id,workspace_id,milestone_id,title,description,position,completed_at,created_at,updated_at,version FROM workspace_tasks WHERE workspace_id=? ORDER BY CASE WHEN milestone_id IS NULL THEN 1 ELSE 0 END,milestone_id,position,id`, workspaceID)
	if err != nil {
		return planning.Plan{}, err
	}
	defer taskRows.Close()
	tasks := []planning.Task{}
	for taskRows.Next() {
		var item planning.Task
		var milestoneID, completed sql.NullString
		if err := taskRows.Scan(&item.ID, &item.WorkspaceID, &milestoneID, &item.Title, &item.Description, &item.Position, &completed, &item.CreatedAt, &item.UpdatedAt, &item.Version); err != nil {
			return planning.Plan{}, err
		}
		if milestoneID.Valid {
			value := milestoneID.String
			item.MilestoneID = &value
		}
		if completed.Valid {
			value := completed.String
			item.CompletedAt = &value
		}
		tasks = append(tasks, item)
	}
	if err := taskRows.Err(); err != nil {
		return planning.Plan{}, err
	}
	return planning.Plan{WorkspaceID: workspaceID, Milestones: milestones, Tasks: tasks}, nil
}

func planTx(ctx context.Context, tx *sql.Tx, workspaceID string) (planning.Plan, error) {
	return readPlan(ctx, tx, workspaceID)
}

func (s *Store) GetPlan(ctx context.Context, workspaceID string) (planning.Plan, error) {
	return readPlan(ctx, s.db, workspaceID)
}

func (s *Store) CreateMilestone(ctx context.Context, item planning.Milestone) (planning.Milestone, error) {
	_, err := s.db.ExecContext(ctx, `INSERT INTO workspace_milestones(id,workspace_id,title,position,completed_at,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?)`,
		item.ID, item.WorkspaceID, item.Title, item.Position, item.CompletedAt, item.CreatedAt, item.UpdatedAt, item.Version)
	return item, err
}

func (s *Store) UpdateMilestone(ctx context.Context, item planning.Milestone) (planning.Milestone, error) {
	result, err := s.db.ExecContext(ctx, `UPDATE workspace_milestones SET title=?,completed_at=?,updated_at=?,version=version+1 WHERE workspace_id=? AND id=? AND version=?`,
		item.Title, item.CompletedAt, item.UpdatedAt, item.WorkspaceID, item.ID, item.Version)
	if err != nil {
		return planning.Milestone{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return planning.Milestone{}, err
	}
	if count == 0 {
		return planning.Milestone{}, planning.ErrConflict
	}
	item.Version++
	return item, nil
}

func (s *Store) DeleteMilestone(ctx context.Context, workspaceID, milestoneID string, version int) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM workspace_milestones WHERE workspace_id=? AND id=? AND version=?`, workspaceID, milestoneID, version)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		var exists int
		if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workspace_milestones WHERE workspace_id=? AND id=?)`, workspaceID, milestoneID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return planning.ErrNotFound
		}
		return planning.ErrConflict
	}
	return nil
}

func (s *Store) CreateTask(ctx context.Context, item planning.Task) (planning.Task, error) {
	_, err := s.db.ExecContext(ctx, `INSERT INTO workspace_tasks(id,workspace_id,milestone_id,title,description,position,completed_at,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?)`,
		item.ID, item.WorkspaceID, item.MilestoneID, item.Title, item.Description, item.Position, item.CompletedAt, item.CreatedAt, item.UpdatedAt, item.Version)
	return item, err
}

func (s *Store) UpdateTask(ctx context.Context, item planning.Task) (planning.Task, error) {
	result, err := s.db.ExecContext(ctx, `UPDATE workspace_tasks SET title=?,description=?,completed_at=?,updated_at=?,version=version+1 WHERE workspace_id=? AND id=? AND version=?`,
		item.Title, item.Description, item.CompletedAt, item.UpdatedAt, item.WorkspaceID, item.ID, item.Version)
	if err != nil {
		return planning.Task{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return planning.Task{}, err
	}
	if count == 0 {
		return planning.Task{}, planning.ErrConflict
	}
	item.Version++
	return item, nil
}

func (s *Store) DeleteTask(ctx context.Context, workspaceID, taskID string, version int) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM workspace_tasks WHERE workspace_id=? AND id=? AND version=?`, workspaceID, taskID, version)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		var exists int
		if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workspace_tasks WHERE workspace_id=? AND id=?)`, workspaceID, taskID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return planning.ErrNotFound
		}
		return planning.ErrConflict
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
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_tasks(id,workspace_id,milestone_id,title,description,position,completed_at,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?)`,
			task.ID, workspaceID, task.MilestoneID, task.Title, task.Description, task.Position, task.CompletedAt, task.CreatedAt, task.UpdatedAt, task.Version); err != nil {
			return err
		}
	}
	return nil
}
