package sqlite

import (
	"context"
	"crypto/rand"
	"time"
	"unicode/utf8"

	"github.com/howlil/notespace/apps/server/internal/capture"
	"github.com/howlil/notespace/apps/server/internal/planning"
	capturequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/capture"
)

func (s *Store) CreateCapture(ctx context.Context, content string) (capture.Item, error) {
	return capturequery.CreateCapture(s.db, ctx, content)
}

func (s *Store) ListCaptures(ctx context.Context) ([]capture.Item, error) {
	return capturequery.ListCaptures(s.db, ctx)
}

func (s *Store) GetCapture(ctx context.Context, id string) (capture.Item, error) {
	return capturequery.GetCapture(s.db, ctx, id)
}

func (s *Store) UpdateCapture(ctx context.Context, id string, version int, content string) (capture.Item, error) {
	if version < 1 || !capture.ValidContent(content) {
		return capture.Item{}, capture.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return capture.Item{}, err
	}
	defer tx.Rollback()
	item, err := capturequery.ReadCapture(ctx, tx, id)
	if err != nil {
		return capture.Item{}, err
	}
	if item.Status != "pending" || item.Version != version {
		return capture.Item{}, capture.ErrConflict
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := tx.ExecContext(ctx, `UPDATE capture_items SET content=?,version=version+1,updated_at=?
	WHERE id=? AND status='pending' AND version=?`, content, now, id, version)
	if err != nil {
		return capture.Item{}, err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return capture.Item{}, err
	}
	if count != 1 {
		return capture.Item{}, capture.ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return capture.Item{}, err
	}
	item.Content = content
	item.Version++
	item.UpdatedAt = now
	return item, nil
}

func (s *Store) DeleteCapture(ctx context.Context, id string, version int) error {
	if version < 1 {
		return capture.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	item, err := capturequery.ReadCapture(ctx, tx, id)
	if err != nil {
		return err
	}
	if item.Status != "pending" || item.Version != version {
		return capture.ErrConflict
	}
	res, err := tx.ExecContext(ctx, "DELETE FROM capture_items WHERE id=? AND status='pending' AND version=?", id, version)
	if err != nil {
		return err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return capture.ErrConflict
	}
	return tx.Commit()
}

func (s *Store) OrganizeCapture(ctx context.Context, id string, req capture.Organize) (capture.Item, error) {
	if req.Version < 1 || req.WorkspaceID == "" || req.Kind != "task" || req.Document != nil {
		return capture.Item{}, capture.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return capture.Item{}, err
	}
	defer tx.Rollback()
	item, err := capturequery.ReadCapture(ctx, tx, id)
	if err != nil {
		return capture.Item{}, err
	}
	if item.Status == "converted" {
		// A lost HTTP response may be retried with the original version. Only
		// an identical request can observe the committed receipt.
		if item.TargetWorkspaceID != req.WorkspaceID || item.TargetKind != req.Kind || item.Version != req.Version+1 {
			return capture.Item{}, capture.ErrConflict
		}
		return item, nil
	}
	if item.Version != req.Version {
		return capture.Item{}, capture.ErrConflict
	}
	var exists int
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)", req.WorkspaceID).Scan(&exists); err != nil {
		return capture.Item{}, err
	}
	if exists == 0 {
		return capture.Item{}, capture.ErrNotFound
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	targetID := rand.Text()
	if req.Kind == "task" {
		var count, position int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*),COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id=?", req.WorkspaceID).Scan(&count, &position); err != nil {
			return capture.Item{}, err
		}
		if count >= planning.MaxTasksPerWorkspace {
			return capture.Item{}, capture.ErrInvalid
		}
		// Preserve the complete Capture body as the Task description. Use its
		// first nonempty line as the human-readable Task title.
		description := item.Content
		if utf8.RuneCountInString(description) > 4000 {
			return capture.Item{}, capture.ErrInvalid
		}
		title := capturequery.CaptureTaskTitle(item.Content)
		if err := planning.ValidateTask(planning.Task{ID: targetID, WorkspaceID: &req.WorkspaceID, Title: title, Description: description, Position: position, Version: 1}); err != nil {
			return capture.Item{}, capture.ErrInvalid
		}
		if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id=? AND milestone_id IS NULL", req.WorkspaceID).Scan(&position); err != nil {
			return capture.Item{}, err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version)
		VALUES (?,?,NULL,?,?,?,NULL,NULL,?,?,1)`, targetID, req.WorkspaceID, title, description, position, now, now)
	}
	if err != nil {
		return capture.Item{}, err
	}
	res, err := tx.ExecContext(ctx, `UPDATE capture_items SET status='converted',version=version+1,updated_at=?,target_kind=?,target_workspace_id=?,target_id=?,converted_at=?
	WHERE id=? AND status='pending' AND version=?`, now, req.Kind, req.WorkspaceID, targetID, now, id, req.Version)
	if err != nil {
		return capture.Item{}, err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return capture.Item{}, err
	}
	if count != 1 {
		return capture.Item{}, capture.ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return capture.Item{}, err
	}
	item.Status = "converted"
	item.Version++
	item.UpdatedAt = now
	item.TargetKind = req.Kind
	item.TargetWorkspaceID = req.WorkspaceID
	item.TargetID = targetID
	item.ConvertedAt = now
	return item, nil
}
