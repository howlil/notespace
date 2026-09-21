package persistence

import (
	"context"
	"database/sql"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

type planningQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func scanTask(scanner interface{ Scan(...any) error }) (planning.Task, error) {
	var item planning.Task
	var workspaceID, milestoneID, plannedFor, completed sql.NullString
	err := scanner.Scan(
		&item.ID, &workspaceID, &milestoneID, &item.Title, &item.Description, &item.Position,
		&plannedFor, &completed, &item.CreatedAt, &item.UpdatedAt, &item.Version,
	)
	if err != nil {
		return planning.Task{}, err
	}
	if workspaceID.Valid {
		value := workspaceID.String
		item.WorkspaceID = &value
	}
	if milestoneID.Valid {
		value := milestoneID.String
		item.MilestoneID = &value
	}
	if plannedFor.Valid {
		value := plannedFor.String
		item.PlannedFor = &value
	}
	if completed.Valid {
		value := completed.String
		item.CompletedAt = &value
	}
	return item, nil
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

	taskRows, err := q.QueryContext(ctx, `
		SELECT id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version
		FROM planning_tasks
		WHERE workspace_id=?
		ORDER BY CASE WHEN milestone_id IS NULL THEN 1 ELSE 0 END,milestone_id,position,id
	`, workspaceID)
	if err != nil {
		return planning.Plan{}, err
	}
	defer taskRows.Close()
	tasks := []planning.Task{}
	for taskRows.Next() {
		item, err := scanTask(taskRows)
		if err != nil {
			return planning.Plan{}, err
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

func (s *Store) GetTask(ctx context.Context, taskID string) (planning.Task, error) {
	item, err := scanTask(s.db.QueryRowContext(ctx, `
		SELECT id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version
		FROM planning_tasks WHERE id=?
	`, taskID))
	if errors.Is(err, sql.ErrNoRows) {
		return planning.Task{}, planning.ErrNotFound
	}
	return item, err
}

func (s *Store) ListToday(ctx context.Context, date string) ([]planning.TodayTask, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT
			t.id,t.workspace_id,t.milestone_id,t.title,t.description,t.position,t.planned_for,t.completed_at,t.created_at,t.updated_at,t.version,
			p.title,m.title
		FROM planning_tasks t
		LEFT JOIN projects p ON p.id=t.workspace_id
		LEFT JOIN workspace_milestones m ON m.id=t.milestone_id
		WHERE t.planned_for=?
		ORDER BY CASE WHEN t.completed_at IS NULL THEN 0 ELSE 1 END,t.position,t.created_at,t.id
	`, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []planning.TodayTask{}
	for rows.Next() {
		var item planning.Task
		var workspaceID, milestoneID, plannedFor, completed, workspaceTitle, milestoneTitle sql.NullString
		if err := rows.Scan(
			&item.ID, &workspaceID, &milestoneID, &item.Title, &item.Description, &item.Position,
			&plannedFor, &completed, &item.CreatedAt, &item.UpdatedAt, &item.Version,
			&workspaceTitle, &milestoneTitle,
		); err != nil {
			return nil, err
		}
		if workspaceID.Valid {
			value := workspaceID.String
			item.WorkspaceID = &value
		}
		if milestoneID.Valid {
			value := milestoneID.String
			item.MilestoneID = &value
		}
		if plannedFor.Valid {
			value := plannedFor.String
			item.PlannedFor = &value
		}
		if completed.Valid {
			value := completed.String
			item.CompletedAt = &value
		}
		projected := planning.TodayTask{Task: item}
		if workspaceTitle.Valid {
			value := workspaceTitle.String
			projected.WorkspaceTitle = &value
		}
		if milestoneTitle.Valid {
			value := milestoneTitle.String
			projected.MilestoneTitle = &value
		}
		items = append(items, projected)
	}
	return items, rows.Err()
}

func standaloneTasksTx(ctx context.Context, tx *sql.Tx) ([]planning.Task, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version
		FROM planning_tasks WHERE workspace_id IS NULL ORDER BY created_at,id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []planning.Task{}
	for rows.Next() {
		item, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

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
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)
	`, item.ID, item.WorkspaceID, item.MilestoneID, item.Title, item.Description, item.Position, item.PlannedFor, item.CompletedAt, item.CreatedAt, item.UpdatedAt, item.Version)
	return item, err
}

func (s *Store) UpdateTask(ctx context.Context, item planning.Task) (planning.Task, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE planning_tasks
		SET title=?,description=?,planned_for=?,completed_at=?,updated_at=?,version=version+1
		WHERE id=? AND version=?
	`, item.Title, item.Description, item.PlannedFor, item.CompletedAt, item.UpdatedAt, item.ID, item.Version)
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

func (s *Store) DeleteTask(ctx context.Context, taskID string, version int) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM planning_tasks WHERE id=? AND version=?`, taskID, version)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		var exists int
		if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM planning_tasks WHERE id=?)`, taskID).Scan(&exists); err != nil {
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
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version)
			VALUES (?,?,?,?,?,?,?,?,?,?,?)
		`, task.ID, workspaceID, task.MilestoneID, task.Title, task.Description, task.Position, task.PlannedFor, task.CompletedAt, task.CreatedAt, task.UpdatedAt, task.Version); err != nil {
			return err
		}
	}
	return nil
}
