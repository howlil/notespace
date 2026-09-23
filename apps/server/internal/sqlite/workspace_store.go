package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/howlil/notespace/apps/server/internal/project"
)

func (s *Store) Create(ctx context.Context, p project.Project) error {
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
	if err := insertGranularStateTx(ctx, tx, p); err != nil {
		return err
	}
	// Retain one creation baseline only for legacy backup/restore compatibility.
	// Normal autosave no longer produces periodic history checkpoints.
	if err := createHistory(ctx, tx, project.HistorySnapshot{
		HistoryEntry: project.HistoryEntry{ID: rand.Text(), WorkspaceID: p.ID, Version: p.Version, Title: p.Title, CreatedAt: p.CreatedAt},
		Document:     p.Document, Notes: p.Notes, Canvas: p.Canvas, References: p.References, SplitRatio: p.SplitRatio,
	}); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) List(ctx context.Context) ([]project.Summary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,
(SELECT COUNT(*) FROM workspace_notes n WHERE n.workspace_id=p.id),
(EXISTS(SELECT 1 FROM workspace_canvas c WHERE c.workspace_id=p.id AND c.element_count>0))
FROM projects p ORDER BY p.updated_at DESC,p.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []project.Summary{}
	for rows.Next() {
		var p project.Summary
		if err := rows.Scan(
			&p.ID, &p.CategoryID, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version, &p.NoteCount, &p.HasCanvas,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ListRecent(ctx context.Context, limit int) ([]project.Summary, error) {
	if limit < 1 || limit > 100 {
		limit = 12
	}
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,
(SELECT COUNT(*) FROM workspace_notes n WHERE n.workspace_id=p.id),
(EXISTS(SELECT 1 FROM workspace_canvas c WHERE c.workspace_id=p.id AND c.element_count>0))
FROM projects p ORDER BY p.updated_at DESC,p.id LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []project.Summary{}
	for rows.Next() {
		var p project.Summary
		if err := rows.Scan(&p.ID, &p.CategoryID, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version, &p.NoteCount, &p.HasCanvas); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ListCategoryWorkspaces(ctx context.Context, categoryID, query, sortBy, hasCanvas, hasNotes string, offset, limit int) (project.WorkspacePage, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	// Library summaries are derived from the granular authored tables. The
	// legacy JSON columns in projects are compatibility projections and are no
	// longer updated by high-frequency Note/Canvas autosaves.
	noteCount := "(SELECT COUNT(*) FROM workspace_notes n WHERE n.workspace_id=p.id)"
	hasCanvasExpr := "(EXISTS(SELECT 1 FROM workspace_canvas c WHERE c.workspace_id=p.id AND c.element_count>0))"
	orderBy := "p.updated_at DESC, p.id"
	switch sortBy {
	case "created":
		orderBy = "p.created_at DESC, p.id"
	case "name":
		orderBy = "p.title COLLATE NOCASE ASC, p.id"
	case "notes":
		orderBy = noteCount + " DESC, p.updated_at DESC, p.id"
	}
	conditions := []string{"1=1"}
	args := []any{}
	if strings.TrimSpace(categoryID) != "" {
		conditions = append(conditions, "p.category_id=?")
		args = append(args, categoryID)
	}
	if strings.TrimSpace(query) != "" {
		conditions = append(conditions, "LOWER(p.title) LIKE ?")
		args = append(args, "%"+strings.ToLower(strings.TrimSpace(query))+"%")
	}
	if hasCanvas == "true" || hasCanvas == "1" {
		conditions = append(conditions, hasCanvasExpr)
	}
	if hasNotes == "true" || hasNotes == "1" {
		conditions = append(conditions, noteCount+" > 0")
	}
	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects p WHERE `+where, args...).Scan(&total); err != nil {
		return project.WorkspacePage{}, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,`+noteCount+`,`+hasCanvasExpr+` FROM projects p WHERE `+where+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return project.WorkspacePage{}, err
	}
	defer rows.Close()
	items := make([]project.Summary, 0)
	for rows.Next() {
		var item project.Summary
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title, &item.CreatedAt, &item.UpdatedAt, &item.Version, &item.NoteCount, &item.HasCanvas); err != nil {
			return project.WorkspacePage{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return project.WorkspacePage{}, err
	}
	page := project.WorkspacePage{Items: items, Total: total, Offset: offset, Limit: limit}
	if offset+len(items) < total {
		next := offset + len(items)
		page.NextOffset = &next
	}
	return page, nil
}

func (s *Store) Move(ctx context.Context, id, categoryID string) (project.Project, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return project.Project{}, err
	}
	defer tx.Rollback()
	var categoryExists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, categoryID).Scan(&categoryExists); err != nil {
		return project.Project{}, err
	}
	if categoryExists == 0 {
		return project.Project{}, project.ErrNotFound
	}
	moved, err := readProject(tx.QueryRowContext(ctx, `UPDATE projects SET category_id=?,updated_at=? WHERE id=? RETURNING `+columns,
		categoryID, time.Now().UTC().Format(time.RFC3339Nano), id))
	if err != nil {
		return project.Project{}, err
	}
	moved, err = hydrateGranularProject(ctx, tx, moved)
	if err != nil {
		return project.Project{}, err
	}
	if err := tx.Commit(); err != nil {
		return project.Project{}, err
	}
	return moved, nil
}

type scanner interface{ Scan(...any) error }

func readProject(row scanner) (project.Project, error) {
	var p project.Project
	var references string
	err := row.Scan(
		&p.ID, &p.CategoryID, &p.Title, &references,
		&p.SplitRatio, &p.CreatedAt, &p.UpdatedAt, &p.Version,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return p, project.ErrNotFound
	}
	if err != nil {
		return p, err
	}
	if err = json.Unmarshal([]byte(references), &p.References); err != nil {
		return p, fmt.Errorf("decode references: %w", err)
	}
	return p, nil
}

const columns = `id,category_id,title,references_state,split_ratio,created_at,updated_at,version`

func (s *Store) GetWorkspaceRecord(ctx context.Context, id string) (project.Project, error) {
	return readProject(s.db.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
}

func (s *Store) WorkspaceExists(ctx context.Context, id string) (bool, error) {
	var exists int
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)`, id).Scan(&exists); err != nil {
		return false, err
	}
	return exists != 0, nil
}

func (s *Store) Get(ctx context.Context, id string) (project.Project, error) {
	value, err := s.GetWorkspaceRecord(ctx, id)
	if err != nil {
		return project.Project{}, err
	}
	return hydrateGranularProject(ctx, s.db, value)
}

func (s *Store) Update(ctx context.Context, id string, u project.Update) (project.Project, error) {
	references, _ := json.Marshal(u.References)
	now := time.Now().UTC().Format(time.RFC3339Nano)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return project.Project{}, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `UPDATE projects SET title=?,references_state=?,split_ratio=?,updated_at=?,version=version+1 WHERE id=? AND version=?`,
		u.Title, string(references), u.SplitRatio, now, id, u.Version)
	if err != nil {
		return project.Project{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return project.Project{}, err
	}
	if affected == 0 {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE id=?`, id).Scan(&exists); err != nil {
			return project.Project{}, err
		}
		if exists == 0 {
			return project.Project{}, project.ErrNotFound
		}
		return project.Project{}, project.ErrConflict
	}
	if err := reconcileGranularStateTx(ctx, tx, id, u.Notes, u.Canvas, now); err != nil {
		return project.Project{}, err
	}
	p, err := readProject(tx.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
	if err != nil {
		return project.Project{}, err
	}
	p, err = hydrateGranularProject(ctx, tx, p)
	if err != nil {
		return project.Project{}, err
	}
	if err := tx.Commit(); err != nil {
		return project.Project{}, err
	}
	return p, nil
}

func (s *Store) Delete(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_history WHERE workspace_id=?`, id); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM projects WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return project.ErrNotFound
	}
	return tx.Commit()
}
