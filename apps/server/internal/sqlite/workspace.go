package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	workspacequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/workspace"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

func (s *Store) CreateCategory(ctx context.Context, category workspacepkg.CategorySummary) error {
	return workspacequery.CreateCategory(s.db, ctx, category)
}

func (s *Store) UpdateCategory(ctx context.Context, id, title string) (workspacepkg.CategorySummary, error) {
	return workspacequery.UpdateCategory(s.db, ctx, id, title)
}

func (s *Store) ListCategories(ctx context.Context) ([]workspacepkg.CategorySummary, error) {
	return workspacequery.ListCategories(s.db, ctx)
}

func (s *Store) CategoryExists(ctx context.Context, id string) (bool, error) {
	return workspacequery.CategoryExists(s.db, ctx, id)
}

func (s *Store) ListHistory(ctx context.Context, workspaceID string) ([]workspacepkg.HistoryEntry, error) {
	return workspacequery.ListHistory(s.db, ctx, workspaceID)
}

func (s *Store) GetHistory(ctx context.Context, workspaceID, historyID string) (workspacepkg.HistorySnapshot, error) {
	return workspacequery.GetHistory(s.db, ctx, workspaceID, historyID)
}
func (s *Store) GetCanvasState(ctx context.Context, workspaceID string) (workspacepkg.CanvasState, error) {
	return workspacequery.GetCanvasState(s.db, ctx, workspaceID)
}

func (s *Store) UpdateCanvas(ctx context.Context, workspaceID string, update workspacepkg.CanvasUpdate) (workspacepkg.CanvasState, error) {
	encoded, err := json.Marshal(update.Canvas)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	elementCount, err := workspacequery.CanvasElementCount(update.Canvas)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	defer tx.Rollback()

	var state workspacepkg.CanvasState
	var stored string
	err = tx.QueryRowContext(ctx, `UPDATE workspace_canvas
SET canvas_state=?,updated_at=?,version=version+1,element_count=?
WHERE workspace_id=? AND version=?
RETURNING canvas_state,version,updated_at`,
		encoded, now, elementCount, workspaceID, update.Version,
	).Scan(&stored, &state.Version, &state.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		var count int
		if countErr := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_canvas WHERE workspace_id=?`, workspaceID).Scan(&count); countErr != nil {
			return workspacepkg.CanvasState{}, countErr
		}
		if count == 0 {
			return workspacepkg.CanvasState{}, workspacepkg.ErrNotFound
		}
		return workspacepkg.CanvasState{}, workspacepkg.ErrConflict
	}
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if err := json.Unmarshal([]byte(stored), &state.Canvas); err != nil {
		return workspacepkg.CanvasState{}, err
	}

	result, err := tx.ExecContext(ctx, `UPDATE projects SET updated_at=?,version=version+1 WHERE id=?`, now, workspaceID)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return workspacepkg.CanvasState{}, workspacepkg.ErrNotFound
	}

	// Canvas content is not searchable, so advance only the aggregate revision
	// recorded by an existing FTS projection. Title/category mismatches still
	// force the normal lazy rebuild.
	if _, err := tx.ExecContext(ctx, `UPDATE workspace_search_meta
SET version=(SELECT version FROM projects WHERE id=?)
WHERE workspace_id=?`, workspaceID, workspaceID); err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspacepkg.CanvasState{}, err
	}
	return state, nil
}
func (s *Store) Create(ctx context.Context, p workspacepkg.Workspace) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	references, _ := json.Marshal(p.References)
	_, err = tx.ExecContext(
		ctx,
		`INSERT INTO projects(id,category_id,title,references_state,split_ratio,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?)`,
		p.ID, p.CategoryID, p.Title, string(references),
		p.SplitRatio, p.CreatedAt, p.UpdatedAt, p.Version,
	)
	if err != nil {
		return err
	}
	if err := workspacequery.InsertGranularStateTx(ctx, tx, p); err != nil {
		return err
	}

	// Retain one creation baseline only for legacy backup/restore compatibility.
	// Normal autosave no longer produces periodic history checkpoints.
	if err := workspacequery.CreateHistory(ctx, tx, workspacepkg.HistorySnapshot{
		HistoryEntry: workspacepkg.HistoryEntry{ID: rand.Text(), WorkspaceID: p.ID, Version: p.Version, Title: p.Title, CreatedAt: p.CreatedAt},
		Document:     p.Document, Notes: p.Notes, Canvas: p.Canvas, References: p.References, SplitRatio: p.SplitRatio,
	}); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) RenameMetadata(ctx context.Context, id, title string, expectedTitle ...string) (workspacepkg.Workspace, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	defer tx.Rollback()
	var currentTitle string
	if err := tx.QueryRowContext(ctx, `SELECT title FROM projects WHERE id=?`, id).Scan(&currentTitle); err != nil {
		return workspacepkg.Workspace{}, workspacequery.WorkspaceReadError(err)
	}
	if len(expectedTitle) > 0 && currentTitle != expectedTitle[0] {
		return workspacepkg.Workspace{}, workspacepkg.ErrConflict
	}
	if currentTitle != title {
		if _, err := tx.ExecContext(ctx, `UPDATE projects SET title=?,updated_at=?,version=version+1 WHERE id=?`, title, time.Now().UTC().Format(time.RFC3339Nano), id); err != nil {
			return workspacepkg.Workspace{}, err
		}
	}
	value, err := workspacequery.ReadProject(tx.QueryRowContext(ctx, `SELECT `+workspacequery.Columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	value, err = workspacequery.HydrateGranularProject(ctx, tx, value)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspacepkg.Workspace{}, err
	}
	return value, nil
}

func (s *Store) Move(ctx context.Context, id, categoryID string, expectedCategory ...string) (workspacepkg.Workspace, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	defer tx.Rollback()
	var categoryExists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, categoryID).Scan(&categoryExists); err != nil {
		return workspacepkg.Workspace{}, err
	}
	if categoryExists == 0 {
		return workspacepkg.Workspace{}, workspacepkg.ErrNotFound
	}
	var currentCategory string
	if err := tx.QueryRowContext(ctx, `SELECT category_id FROM projects WHERE id=?`, id).Scan(&currentCategory); err != nil {
		return workspacepkg.Workspace{}, workspacequery.WorkspaceReadError(err)
	}
	if len(expectedCategory) > 0 && currentCategory != expectedCategory[0] {
		return workspacepkg.Workspace{}, workspacepkg.ErrConflict
	}
	if currentCategory != categoryID {
		if _, err := tx.ExecContext(ctx, `UPDATE projects SET category_id=?,updated_at=?,version=version+1 WHERE id=?`, categoryID, time.Now().UTC().Format(time.RFC3339Nano), id); err != nil {
			return workspacepkg.Workspace{}, err
		}
	}
	value, err := workspacequery.ReadProject(tx.QueryRowContext(ctx, `SELECT `+workspacequery.Columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	value, err = workspacequery.HydrateGranularProject(ctx, tx, value)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspacepkg.Workspace{}, err
	}
	return value, nil
}

func (s *Store) Update(ctx context.Context, id string, u workspacepkg.Update) (workspacepkg.Workspace, error) {
	// Autosave is the hottest write path. Search compares projection meta with
	// the authored workspace version and repairs stale entries on demand, so
	// rebuilding the search projection here only adds latency to the compatibility save response.
	references, _ := json.Marshal(u.References)
	now := time.Now().UTC().Format(time.RFC3339Nano)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `UPDATE projects SET title=?,references_state=?,split_ratio=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,
		u.Title, string(references), u.SplitRatio, now, id, u.Version)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if affected == 0 {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE id=?`, id).Scan(&exists); err != nil {
			return workspacepkg.Workspace{}, err
		}
		if exists == 0 {
			return workspacepkg.Workspace{}, workspacepkg.ErrNotFound
		}
		return workspacepkg.Workspace{}, workspacepkg.ErrConflict
	}
	if err := workspacequery.ReconcileGranularStateTx(ctx, tx, id, u.Canvas, now); err != nil {
		return workspacepkg.Workspace{}, err
	}
	p, err := workspacequery.ReadProject(tx.QueryRowContext(ctx, `SELECT `+workspacequery.Columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	p, err = workspacequery.HydrateGranularProject(ctx, tx, p)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspacepkg.Workspace{}, err
	}
	return p, nil
}
func (s *Store) List(ctx context.Context) ([]workspacepkg.Summary, error) {
	return workspacequery.List(s.db, ctx)
}

func (s *Store) ListRecent(ctx context.Context, limit int) ([]workspacepkg.Summary, error) {
	return workspacequery.ListRecent(s.db, ctx, limit)
}

func (s *Store) ListWorkspaces(ctx context.Context, query workspacepkg.WorkspaceQuery) (workspacepkg.WorkspacePage, error) {
	if query.Snapshot != "" {
		return s.listWorkspaceSnapshot(ctx, query)
	}
	limit := query.Limit
	offset := query.Offset
	if limit < 1 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	// Query semantics are shared with snapshot traversal; only consistency differs.
	where, args, orderBy, hasCanvasExpr := workspaceListingParts(query)
	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects p WHERE `+where, args...).Scan(&total); err != nil {
		return workspacepkg.WorkspacePage{}, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,`+hasCanvasExpr+` FROM projects p WHERE `+where+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return workspacepkg.WorkspacePage{}, err
	}
	defer rows.Close()

	items := make([]workspacepkg.Summary, 0)
	for rows.Next() {
		var item workspacepkg.Summary
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title, &item.CreatedAt, &item.UpdatedAt, &item.Version, &item.HasCanvas); err != nil {
			return workspacepkg.WorkspacePage{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return workspacepkg.WorkspacePage{}, err
	}

	page := workspacepkg.WorkspacePage{Items: items, Total: total, Offset: offset, Limit: limit}
	if offset+len(items) < total {
		next := offset + len(items)
		page.NextOffset = &next
	}
	return page, nil
}

// GetWorkspaceSnapshot reads metadata and granular authored state in one
// transaction to avoid mixing different committed revisions.
func (s *Store) GetWorkspaceSnapshot(ctx context.Context, id string) (workspacepkg.Workspace, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	defer tx.Rollback()
	value, err := workspacequery.ReadProject(tx.QueryRowContext(ctx, `SELECT `+workspacequery.Columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	value, err = workspacequery.HydrateGranularProject(ctx, tx, value)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspacepkg.Workspace{}, err
	}
	return value, nil
}

func (s *Store) GetWorkspaceRecord(ctx context.Context, id string) (workspacepkg.Workspace, error) {
	return workspacequery.GetWorkspaceRecord(s.db, ctx, id)
}

func (s *Store) WorkspaceExists(ctx context.Context, id string) (bool, error) {
	return workspacequery.WorkspaceExists(s.db, ctx, id)
}

func (s *Store) Get(ctx context.Context, id string) (workspacepkg.Workspace, error) {
	return s.GetWorkspaceSnapshot(ctx, id)
}
