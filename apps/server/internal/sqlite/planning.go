package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/planning"
	planningquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/planning"
)

// AssignStandaloneTask moves a legacy Task into a Workspace transactionally.
// Repeating an identical request after the response is lost returns the same
// Task identity; subsequent updates or a different destination conflict.
func (s *Store) AssignStandaloneTask(ctx context.Context, taskID, workspaceID string, version int, updatedAt string) (planning.Task, error) {
	if taskID == "" || workspaceID == "" || version < 1 {
		return planning.Task{}, planning.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return planning.Task{}, err
	}
	defer tx.Rollback()

	item, err := planningquery.ScanTask(tx.QueryRowContext(ctx, `SELECT id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version
		FROM planning_tasks WHERE id=?`, taskID))
	if errors.Is(err, sql.ErrNoRows) {
		return planning.Task{}, planning.ErrNotFound
	}
	if err != nil {
		return planning.Task{}, err
	}
	if item.WorkspaceID != nil {
		if *item.WorkspaceID == workspaceID && item.Version == version+1 {
			return item, nil
		}
		return planning.Task{}, planning.ErrConflict
	}
	if item.Version != version {
		return planning.Task{}, planning.ErrConflict
	}
	var exists, count int
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id=?),
		(SELECT COUNT(*) FROM planning_tasks WHERE workspace_id=?)`, workspaceID, workspaceID).Scan(&exists, &count); err != nil {
		return planning.Task{}, err
	}
	if exists == 0 {
		return planning.Task{}, planning.ErrNotFound
	}
	if count >= planning.MaxTasksPerWorkspace {
		return planning.Task{}, planning.ErrInvalid
	}
	var position int
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1
		FROM planning_tasks WHERE workspace_id=? AND milestone_id IS NULL`, workspaceID).Scan(&position); err != nil {
		return planning.Task{}, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE planning_tasks
		SET workspace_id=?, milestone_id=NULL, position=?, updated_at=?, version=version+1
		WHERE id=? AND workspace_id IS NULL AND version=?`,
		workspaceID, position, updatedAt, taskID, version)
	if err != nil {
		return planning.Task{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return planning.Task{}, err
	}
	if affected != 1 {
		return planning.Task{}, planning.ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return planning.Task{}, err
	}
	item.WorkspaceID = &workspaceID
	item.MilestoneID = nil
	item.Position = position
	item.UpdatedAt = updatedAt
	item.Version++
	return item, nil
}
func (s *Store) CreateMilestone(ctx context.Context, item planning.Milestone) (planning.Milestone, error) {
	return s.createMilestone(ctx, item, "")
}

func (s *Store) CreateMilestoneIdempotent(ctx context.Context, item planning.Milestone, key string) (planning.Milestone, error) {
	return s.createMilestone(ctx, item, key)
}

func (s *Store) createMilestone(ctx context.Context, item planning.Milestone, key string) (planning.Milestone, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return planning.Milestone{}, err
	}
	defer tx.Rollback()

	claimedID, isNew, err := planningquery.ClaimPlanningCreate(ctx, tx, "milestone", key, item.ID,
		struct {
			WorkspaceID string
			Title       string
		}{item.WorkspaceID, item.Title})
	if err != nil {
		return planning.Milestone{}, err
	}
	if !isNew {
		return planningquery.ReplayMilestone(ctx, tx, claimedID)
	}

	var workspaceExists, count int
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id=?),COUNT(*) FROM workspace_milestones WHERE workspace_id=?`, item.WorkspaceID, item.WorkspaceID).Scan(&workspaceExists, &count); err != nil {
		return planning.Milestone{}, err
	}
	if workspaceExists == 0 {
		return planning.Milestone{}, planning.ErrNotFound
	}
	if count >= planning.MaxMilestonesPerWorkspace {
		return planning.Milestone{}, planning.ErrInvalid
	}
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM workspace_milestones WHERE workspace_id=?`, item.WorkspaceID).Scan(&item.Position); err != nil {
		return planning.Milestone{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_milestones(id,workspace_id,title,position,completed_at,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?)`,
		item.ID, item.WorkspaceID, item.Title, item.Position, item.CompletedAt, item.CreatedAt, item.UpdatedAt, item.Version); err != nil {
		return planning.Milestone{}, err
	}
	if err := tx.Commit(); err != nil {
		return planning.Milestone{}, err
	}
	return item, nil
}

func (s *Store) UpdateMilestone(ctx context.Context, item planning.Milestone) (planning.Milestone, error) {
	return planningquery.UpdateMilestone(s.db, ctx, item)
}

func (s *Store) DeleteMilestone(ctx context.Context, workspaceID, milestoneID string, version int) error {
	return planningquery.DeleteMilestone(s.db, ctx, workspaceID, milestoneID,

		version)
}

// GetPlan returns a single committed view of Milestones and Tasks. Without
// one read transaction, a newly created Task can appear after its Milestone
// query and refer to a Milestone missing from the returned Plan.
func (s *Store) GetPlan(ctx context.Context, workspaceID string) (planning.Plan, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return planning.Plan{}, err
	}
	defer tx.Rollback()
	plan, err := planningquery.PlanTx(ctx, tx, workspaceID)
	if err != nil {
		return planning.Plan{}, err
	}
	if err := tx.Commit(); err != nil {
		return planning.Plan{}, err
	}
	return plan, nil
}

func (s *Store) GetTask(ctx context.Context, taskID string) (planning.Task, error) {
	return planningquery.GetTask(s.db, ctx, taskID)
}

func (s *Store) ListToday(ctx context.Context, date string) ([]planning.TodayTask, error) {
	return planningquery.ListToday(s.db, ctx, date)
}

func (s *Store) ListInbox(ctx context.Context) ([]planning.Task, error) {
	return planningquery.ListInbox(s.db, ctx)
}

func (s *Store) ListUnassignedTasks(ctx context.Context) ([]planning.Task, error) {
	return planningquery.ListUnassignedTasks(s.db, ctx)
}
func (s *Store) CreateTask(ctx context.Context, item planning.Task) (planning.Task, error) {
	return s.createTask(ctx, item, "")
}

func (s *Store) CreateTaskIdempotent(ctx context.Context, item planning.Task, key string) (planning.Task, error) {
	return s.createTask(ctx, item, key)
}

func (s *Store) createTask(ctx context.Context, item planning.Task, key string) (planning.Task, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return planning.Task{}, err
	}
	defer tx.Rollback()

	claimedID, isNew, err := planningquery.ClaimPlanningCreate(ctx, tx, "task", key, item.ID,
		struct {
			WorkspaceID *string
			MilestoneID *string
			Title       string
			PlannedFor  *string
		}{item.WorkspaceID, item.MilestoneID, item.Title, item.PlannedFor})
	if err != nil {
		return planning.Task{}, err
	}
	if !isNew {
		return planningquery.ReplayTask(ctx, tx, claimedID)
	}

	if item.WorkspaceID != nil {
		var workspaceExists, taskCount int
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id=?),COUNT(*) FROM planning_tasks WHERE workspace_id=?`, *item.WorkspaceID, *item.WorkspaceID).Scan(&workspaceExists, &taskCount); err != nil {
			return planning.Task{}, err
		}
		if workspaceExists == 0 {
			return planning.Task{}, planning.ErrNotFound
		}
		if taskCount >= planning.MaxTasksPerWorkspace {
			return planning.Task{}, planning.ErrInvalid
		}
		if item.MilestoneID != nil {
			var milestoneExists int
			if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM workspace_milestones WHERE workspace_id=? AND id=?)`, *item.WorkspaceID, *item.MilestoneID).Scan(&milestoneExists); err != nil {
				return planning.Task{}, err
			}
			if milestoneExists == 0 {
				return planning.Task{}, planning.ErrInvalid
			}
			if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id=? AND milestone_id=?`, *item.WorkspaceID, *item.MilestoneID).Scan(&item.Position); err != nil {
				return planning.Task{}, err
			}
		} else if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id=? AND milestone_id IS NULL`, *item.WorkspaceID).Scan(&item.Position); err != nil {
			return planning.Task{}, err
		}
	} else {
		if item.MilestoneID != nil {
			return planning.Task{}, planning.ErrInvalid
		}
		if item.PlannedFor != nil {
			if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id IS NULL AND (planned_for=? OR (planned_for<? AND completed_at IS NULL))`, *item.PlannedFor, *item.PlannedFor).Scan(&item.Position); err != nil {
				return planning.Task{}, err
			}
		} else if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id IS NULL AND planned_for IS NULL AND completed_at IS NULL`).Scan(&item.Position); err != nil {
			return planning.Task{}, err
		}
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)
	`, item.ID, item.WorkspaceID, item.MilestoneID, item.Title, item.Description, item.Position, item.PlannedFor, item.CompletedAt, item.CreatedAt, item.UpdatedAt, item.Version); err != nil {
		return planning.Task{}, err
	}
	if err := tx.Commit(); err != nil {
		return planning.Task{}, err
	}
	return item, nil
}

func (s *Store) UpdateTask(ctx context.Context, item planning.Task) (planning.Task, error) {
	return planningquery.UpdateTask(s.db, ctx, item)
}

func (s *Store) DeleteTask(ctx context.Context, taskID string, version int) error {
	return planningquery.DeleteTask(s.db, ctx, taskID, version)
}
