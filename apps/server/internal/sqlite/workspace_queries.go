package sqlite

import (
	"context"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

func (s *Store) List(ctx context.Context) ([]workspace.Summary, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,
(SELECT COUNT(*) FROM workspace_notes n WHERE n.workspace_id=p.id),
(EXISTS(SELECT 1 FROM workspace_canvas c WHERE c.workspace_id=p.id AND c.element_count>0))
FROM projects p ORDER BY p.updated_at DESC,p.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []workspace.Summary{}
	for rows.Next() {
		var p workspace.Summary
		if err := rows.Scan(
			&p.ID, &p.CategoryID, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version, &p.NoteCount, &p.HasCanvas,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ListRecent(ctx context.Context, limit int) ([]workspace.Summary, error) {
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
	out := []workspace.Summary{}
	for rows.Next() {
		var p workspace.Summary
		if err := rows.Scan(&p.ID, &p.CategoryID, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version, &p.NoteCount, &p.HasCanvas); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ListWorkspaces(ctx context.Context, query workspace.WorkspaceQuery) (workspace.WorkspacePage, error) {
	limit := query.Limit
	offset := query.Offset
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
	switch query.Sort {
	case "created":
		orderBy = "p.created_at DESC, p.id"
	case "name":
		orderBy = "p.title COLLATE NOCASE ASC, p.id"
	case "notes":
		orderBy = noteCount + " DESC, p.updated_at DESC, p.id"
	}

	conditions := []string{"1=1"}
	args := []any{}
	if strings.TrimSpace(query.CategoryID) != "" {
		conditions = append(conditions, "p.category_id=?")
		args = append(args, query.CategoryID)
	}
	if strings.TrimSpace(query.Query) != "" {
		conditions = append(conditions, "LOWER(p.title) LIKE ? ESCAPE '\\'")
		args = append(args, containsLikeLiteral(query.Query))
	}
	if query.HasCanvas {
		conditions = append(conditions, hasCanvasExpr)
	}
	if query.HasNotes {
		conditions = append(conditions, noteCount+" > 0")
	}

	where := strings.Join(conditions, " AND ")
	var total int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects p WHERE `+where, args...).Scan(&total); err != nil {
		return workspace.WorkspacePage{}, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,`+noteCount+`,`+hasCanvasExpr+` FROM projects p WHERE `+where+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return workspace.WorkspacePage{}, err
	}
	defer rows.Close()

	items := make([]workspace.Summary, 0)
	for rows.Next() {
		var item workspace.Summary
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title, &item.CreatedAt, &item.UpdatedAt, &item.Version, &item.NoteCount, &item.HasCanvas); err != nil {
			return workspace.WorkspacePage{}, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return workspace.WorkspacePage{}, err
	}

	page := workspace.WorkspacePage{Items: items, Total: total, Offset: offset, Limit: limit}
	if offset+len(items) < total {
		next := offset + len(items)
		page.NextOffset = &next
	}
	return page, nil
}

func (s *Store) GetWorkspaceRecord(ctx context.Context, id string) (workspace.Workspace, error) {
	return readProject(s.db.QueryRowContext(ctx, `SELECT `+columns+` FROM projects WHERE id=?`, id))
}

func (s *Store) WorkspaceExists(ctx context.Context, id string) (bool, error) {
	var exists int
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)`, id).Scan(&exists); err != nil {
		return false, err
	}
	return exists != 0, nil
}

func (s *Store) Get(ctx context.Context, id string) (workspace.Workspace, error) {
	value, err := s.GetWorkspaceRecord(ctx, id)
	if err != nil {
		return workspace.Workspace{}, err
	}
	return hydrateGranularProject(ctx, s.db, value)
}
