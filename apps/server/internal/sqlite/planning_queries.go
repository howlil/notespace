package sqlite

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
		WHERE t.planned_for=? OR (t.planned_for<? AND t.completed_at IS NULL)
		ORDER BY CASE WHEN t.completed_at IS NULL THEN 0 ELSE 1 END,t.planned_for,t.position,t.created_at,t.id
	`, date, date)
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

func (s *Store) ListInbox(ctx context.Context) ([]planning.Task, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version
		FROM planning_tasks
		WHERE workspace_id IS NULL AND planned_for IS NULL AND completed_at IS NULL
		ORDER BY position,created_at,id
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

func readStandaloneTasks(ctx context.Context, q planningQueryer) ([]planning.Task, error) {
	rows, err := q.QueryContext(ctx, `
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

func standaloneTasksTx(ctx context.Context, tx *sql.Tx) ([]planning.Task, error) {
	return readStandaloneTasks(ctx, tx)
}

func (s *Store) standaloneTasks(ctx context.Context) ([]planning.Task, error) {
	return readStandaloneTasks(ctx, s.db)
}
