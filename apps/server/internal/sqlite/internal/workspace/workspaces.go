package workspacequery

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

const workspaceColumns = `id,category_id,title,created_at,updated_at,version`

func readProject(row dbtx.Scanner) (workspacepkg.Workspace, error) {
	var p workspacepkg.Workspace
	err := row.Scan(
		&p.ID, &p.CategoryID, &p.Title,
		&p.CreatedAt, &p.UpdatedAt, &p.Version,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return p, workspacepkg.ErrNotFound
	}
	if err != nil {
		return p, err
	}
	return p, nil
}

// Metadata changes never rewrite granular authored Note or Canvas rows.
func workspaceReadError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return workspacepkg.ErrNotFound
	}
	return err
}

func GetWorkspaceRecord(ctx context.Context, db dbtx.DBTX, id string) (workspacepkg.Workspace, error) {
	return readProject(db.QueryRowContext(ctx, `SELECT `+workspaceColumns+` FROM projects WHERE id=?`, id))
}

func WorkspaceExists(ctx context.Context, db dbtx.DBTX, id string) (bool, error) {
	var exists int
	if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)`, id).Scan(&exists); err != nil {
		return false, err
	}
	return exists != 0, nil
}

func Snapshot(ctx context.Context, tx dbtx.DBTX, id string) (workspacepkg.Workspace, error) {
	workspace, err := GetWorkspaceRecord(ctx, tx, id)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	return hydrateGranularProject(ctx, tx, workspace)
}

func Restore(ctx context.Context, tx dbtx.DBTX, workspace workspacepkg.Workspace) error {
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO projects(id,category_id,title,created_at,updated_at,version) VALUES (?,?,?,?,?,?)`,
		workspace.ID, workspace.CategoryID, workspace.Title,
		workspace.CreatedAt, workspace.UpdatedAt, workspace.Version,
	); err != nil {
		return err
	}
	return insertGranularStateTx(ctx, tx, workspace)
}

func RenameMetadataTx(ctx context.Context, tx dbtx.DBTX, id, title, now string, expectedTitle ...string) (workspacepkg.Workspace, error) {
	var currentTitle string
	if err := tx.QueryRowContext(ctx, `SELECT title FROM projects WHERE id=?`, id).Scan(&currentTitle); err != nil {
		return workspacepkg.Workspace{}, workspaceReadError(err)
	}
	if len(expectedTitle) > 0 && currentTitle != expectedTitle[0] {
		return workspacepkg.Workspace{}, workspacepkg.ErrConflict
	}
	if currentTitle != title {
		if _, err := tx.ExecContext(ctx, `UPDATE projects SET title=?,updated_at=?,version=version+1 WHERE id=?`, title, now, id); err != nil {
			return workspacepkg.Workspace{}, err
		}
	}
	return Snapshot(ctx, tx, id)
}

func MoveCategoryTx(ctx context.Context, tx dbtx.DBTX, id, categoryID, now string, expectedCategory ...string) (workspacepkg.Workspace, error) {
	exists, err := CategoryExists(ctx, tx, categoryID)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if !exists {
		return workspacepkg.Workspace{}, workspacepkg.ErrNotFound
	}
	var currentCategory string
	if err := tx.QueryRowContext(ctx, `SELECT category_id FROM projects WHERE id=?`, id).Scan(&currentCategory); err != nil {
		return workspacepkg.Workspace{}, workspaceReadError(err)
	}
	if len(expectedCategory) > 0 && currentCategory != expectedCategory[0] {
		return workspacepkg.Workspace{}, workspacepkg.ErrConflict
	}
	if currentCategory != categoryID {
		if _, err := tx.ExecContext(ctx, `UPDATE projects SET category_id=?,updated_at=?,version=version+1 WHERE id=?`, categoryID, now, id); err != nil {
			return workspacepkg.Workspace{}, err
		}
	}
	return Snapshot(ctx, tx, id)
}

func ListProjectIDsTx(ctx context.Context, tx dbtx.DBTX) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id FROM projects ORDER BY updated_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func DeleteProjectTx(ctx context.Context, tx dbtx.DBTX, id string) error {
	result, err := tx.ExecContext(ctx, `DELETE FROM projects WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return workspacepkg.ErrNotFound
	}
	return nil
}

func DeleteAllTx(ctx context.Context, tx dbtx.DBTX) error {
	for _, statement := range []string{
		`DELETE FROM workspace_canvas`,
		`DELETE FROM projects`,
		`DELETE FROM categories`,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}

// Keep the live and captured query paths on exactly the same filter/sort
// contract; snapshotting changes consistency, not which items qualify.
func listingParts(query workspacepkg.WorkspaceQuery) (string, []any, string, string) {
	hasCanvasExpr := "(EXISTS(SELECT 1 FROM workspace_canvas c WHERE c.workspace_id=p.id AND c.element_count>0))"
	orderBy := "p.updated_at DESC, p.id"
	if query.CategoryID != "" {
		orderBy = "p.title COLLATE NOCASE ASC, p.id"
	}
	switch query.Sort {
	case "created":
		orderBy = "p.created_at DESC, p.id"
	case "name":
		orderBy = "p.title COLLATE NOCASE ASC, p.id"
	}

	conditions := []string{"1=1"}
	args := []any{}
	if strings.TrimSpace(query.CategoryID) != "" {
		conditions = append(conditions, "p.category_id=?")
		args = append(args, query.CategoryID)
	}
	if strings.TrimSpace(query.Query) != "" {
		conditions = append(conditions, "LOWER(p.title) LIKE ? ESCAPE '\\'")
		args = append(args, dbtx.ContainsLikeLiteral(query.Query))
	}
	if query.HasCanvas {
		conditions = append(conditions, hasCanvasExpr)
	}
	return strings.Join(conditions, " AND "), args, orderBy, hasCanvasExpr
}

func scanWorkspaceSummaries(rows *sql.Rows) ([]workspacepkg.Summary, error) {
	items := make([]workspacepkg.Summary, 0)
	for rows.Next() {
		var item workspacepkg.Summary
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title, &item.CreatedAt, &item.UpdatedAt, &item.Version, &item.HasCanvas); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func ListWorkspaces(ctx context.Context, db dbtx.DBTX, query workspacepkg.WorkspaceQuery) (workspacepkg.WorkspacePage, error) {
	limit := query.Limit
	offset := query.Offset
	if limit < 1 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	where, args, orderBy, hasCanvasExpr := listingParts(query)
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects p WHERE `+where, args...).Scan(&total); err != nil {
		return workspacepkg.WorkspacePage{}, err
	}
	rows, err := db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,`+hasCanvasExpr+` FROM projects p WHERE `+where+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return workspacepkg.WorkspacePage{}, err
	}
	defer rows.Close()

	items, err := scanWorkspaceSummaries(rows)
	if err != nil {
		return workspacepkg.WorkspacePage{}, err
	}
	page := workspacepkg.WorkspacePage{Items: items, Total: total, Offset: offset, Limit: limit}
	if offset+len(items) < total {
		next := offset + len(items)
		page.NextOffset = &next
	}
	return page, nil
}

func QuerySnapshotItems(ctx context.Context, db dbtx.DBTX, query workspacepkg.WorkspaceQuery, maxRows int) ([]workspacepkg.Summary, error) {
	where, args, orderBy, hasCanvas := listingParts(query)
	rows, err := db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,`+
		hasCanvas+` FROM projects p WHERE `+where+
		` ORDER BY `+orderBy+` LIMIT ?`, append(args, maxRows+1)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items, err := scanWorkspaceSummaries(rows)
	if err != nil {
		return nil, err
	}
	if len(items) > maxRows {
		return nil, workspacepkg.ErrInvalid
	}
	return items, nil
}
