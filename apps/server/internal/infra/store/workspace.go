package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/infra/sqlite"
	"github.com/howlil/notespace/apps/server/internal/infra/store/paging"
)

const workspaceColumns = `id,category_id,title,created_at,updated_at,version`

func (s *Store) CreateCategory(ctx context.Context, title string) (domain.CategorySummary, error) {
	title = strings.TrimSpace(title)
	if !domain.ValidTitle(title) {
		return domain.CategorySummary{}, domain.ErrWorkspaceInvalid
	}
	now := sqlite.NowUTC()
	category := domain.CategorySummary{
		ID:        rand.Text(),
		Title:     title,
		CreatedAt: now,
		UpdatedAt: now,
	}
	err := s.db.WithTx(ctx, func(tx *sql.Tx) error {
		return insertCategoryTx(ctx, tx, category)
	})
	return category, err
}

func (s *Store) UpdateCategory(ctx context.Context, id, title string) (domain.CategorySummary, error) {
	id = strings.TrimSpace(id)
	title = strings.TrimSpace(title)
	if id == "" || !domain.ValidTitle(title) {
		return domain.CategorySummary{}, domain.ErrWorkspaceInvalid
	}
	var out domain.CategorySummary
	err := s.db.WithTx(ctx, func(tx *sql.Tx) error {
		now := sqlite.NowUTC()
		err := tx.QueryRowContext(ctx,
			`UPDATE categories SET title=?,updated_at=? WHERE id=? RETURNING id,title,created_at,updated_at`,
			title, now, id,
		).Scan(&out.ID, &out.Title, &out.CreatedAt, &out.UpdatedAt)
		if errors.Is(err, sql.ErrNoRows) {
			return domain.ErrWorkspaceNotFound
		}
		return err
	})
	return out, err
}

func (s *Store) DeleteCategory(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" || id == domain.UncategorizedCategoryID {
		return domain.ErrWorkspaceInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		exists, err := categoryExistsTx(ctx, tx, id)
		if err != nil {
			return err
		}
		if !exists {
			return domain.ErrWorkspaceNotFound
		}
		var active int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE category_id=?`, id).Scan(&active); err != nil {
			return err
		}
		if active > 0 {
			return domain.ErrCategoryNotEmpty
		}
		var trashed int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_trash WHERE category_id=?`, id).Scan(&trashed); err != nil {
			return err
		}
		if trashed > 0 {
			return domain.ErrCategoryNotEmpty
		}
		result, err := tx.ExecContext(ctx, `DELETE FROM categories WHERE id=?`, id)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count != 1 {
			return domain.ErrWorkspaceNotFound
		}
		return nil
	})
}

func (s *Store) ListCategories(ctx context.Context) ([]domain.CategorySummary, error) {
	return listCategoriesTx(ctx, s.db.ReadPool())
}

// CreateWorkspace creates a workspace in the optional category (defaulting to
// domain.UncategorizedCategoryID) with a server-generated ID.
func (s *Store) CreateWorkspace(ctx context.Context, title string, categoryID ...string) (domain.Workspace, error) {
	cat := ""
	if len(categoryID) > 0 {
		cat = categoryID[0]
	}
	return s.CreateWorkspaceWithID(ctx, "", title, cat)
}

// CreateWorkspaceWithID atomically validates category existence, checks
// idempotent client-ID replay, and inserts the workspace in one write tx.
func (s *Store) CreateWorkspaceWithID(ctx context.Context, id, title, categoryID string) (domain.Workspace, error) {
	title = strings.TrimSpace(title)
	if id != "" && !domain.ValidID(id, domain.MaxIDLength) {
		return domain.Workspace{}, domain.ErrWorkspaceInvalid
	}
	if !domain.ValidTitle(title) {
		return domain.Workspace{}, domain.ErrWorkspaceInvalid
	}
	category := domain.UncategorizedCategoryID
	if strings.TrimSpace(categoryID) != "" {
		category = strings.TrimSpace(categoryID)
	}

	var out domain.Workspace
	err := s.db.WithTx(ctx, func(tx *sql.Tx) error {
		exists, err := categoryExistsTx(ctx, tx, category)
		if err != nil {
			return err
		}
		if !exists {
			return domain.ErrWorkspaceInvalid
		}
		if id != "" {
			existing, err := snapshotWorkspaceRecordTx(ctx, tx, id)
			if err == nil {
				if existing.Title == title && existing.CategoryID == category {
					out = existing
					return nil
				}
				return domain.ErrWorkspaceConflict
			}
			if !errors.Is(err, domain.ErrWorkspaceNotFound) {
				return err
			}
		} else {
			id = rand.Text()
		}

		now := sqlite.NowUTC()
		created := domain.Workspace{
			WorkspaceSummary: domain.WorkspaceSummary{
				ID:         id,
				CategoryID: category,
				Title:      title,
				CreatedAt:  now,
				UpdatedAt:  now,
				Version:    1,
			},
			Canvas:        domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)},
			CanvasVersion: 1,
		}
		if err := insertWorkspaceTx(ctx, tx, created, 0); err != nil {
			return err
		}
		out = created
		return nil
	})
	return out, err
}

func (s *Store) GetWorkspace(ctx context.Context, id string) (domain.Workspace, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.Workspace{}, domain.ErrWorkspaceInvalid
	}
	var out domain.Workspace
	err := s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		var err error
		out, err = snapshotWorkspaceRecordTx(ctx, tx, id)
		return err
	})
	return out, err
}

func (s *Store) RenameWorkspace(ctx context.Context, id, title string, expectedTitle *string) (domain.Workspace, error) {
	id = strings.TrimSpace(id)
	title = strings.TrimSpace(title)
	if id == "" || !domain.ValidTitle(title) {
		return domain.Workspace{}, domain.ErrWorkspaceInvalid
	}
	var out domain.Workspace
	err := s.db.WithTx(ctx, func(tx *sql.Tx) error {
		var currentTitle string
		if err := tx.QueryRowContext(ctx, `SELECT title FROM projects WHERE id=?`, id).Scan(&currentTitle); err != nil {
			return workspaceReadError(err)
		}
		if expectedTitle != nil && currentTitle != *expectedTitle {
			return domain.ErrWorkspaceConflict
		}
		if currentTitle != title {
			now := sqlite.NowUTC()
			if _, err := tx.ExecContext(ctx, `UPDATE projects SET title=?,updated_at=?,version=version+1 WHERE id=?`, title, now, id); err != nil {
				return err
			}
		}
		var err error
		out, err = snapshotWorkspaceRecordTx(ctx, tx, id)
		return err
	})
	return out, err
}

func (s *Store) MoveWorkspace(ctx context.Context, id, categoryID string, expectedCategory *string) (domain.Workspace, error) {
	id = strings.TrimSpace(id)
	categoryID = strings.TrimSpace(categoryID)
	if id == "" || categoryID == "" {
		return domain.Workspace{}, domain.ErrWorkspaceInvalid
	}
	var out domain.Workspace
	err := s.db.WithTx(ctx, func(tx *sql.Tx) error {
		exists, err := categoryExistsTx(ctx, tx, categoryID)
		if err != nil {
			return err
		}
		if !exists {
			return domain.ErrWorkspaceNotFound
		}
		var currentCategory string
		if err := tx.QueryRowContext(ctx, `SELECT category_id FROM projects WHERE id=?`, id).Scan(&currentCategory); err != nil {
			return workspaceReadError(err)
		}
		if expectedCategory != nil && currentCategory != *expectedCategory {
			return domain.ErrWorkspaceConflict
		}
		if currentCategory != categoryID {
			now := sqlite.NowUTC()
			if _, err := tx.ExecContext(ctx, `UPDATE projects SET category_id=?,updated_at=?,version=version+1 WHERE id=?`, categoryID, now, id); err != nil {
				return err
			}
		}
		out, err = snapshotWorkspaceRecordTx(ctx, tx, id)
		return err
	})
	return out, err
}

func (s *Store) GetCanvasState(ctx context.Context, workspaceID string) (domain.CanvasState, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return domain.CanvasState{}, domain.ErrWorkspaceInvalid
	}
	return getCanvasStateTx(ctx, s.db.ReadPool(), workspaceID)
}

func (s *Store) UpdateCanvas(ctx context.Context, workspaceID string, update domain.CanvasUpdate) (domain.CanvasState, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" || update.Version < 1 {
		return domain.CanvasState{}, domain.ErrWorkspaceInvalid
	}
	scene, err := domain.ParseScene(update.Canvas)
	if err != nil {
		return domain.CanvasState{}, domain.ErrWorkspaceInvalid
	}
	var out domain.CanvasState
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		var err error
		out, err = applyCanvasTx(ctx, tx, workspaceID, update.Version, scene)
		return err
	})
	return out, err
}

func (s *Store) ListWorkspaces(ctx context.Context, query domain.WorkspaceQuery) (domain.WorkspacePage, error) {
	normalized, err := domain.NormalizeWorkspaceQuery(query)
	if err != nil {
		return domain.WorkspacePage{}, err
	}
	if normalized.Snapshot != "" {
		return s.listWorkspaceSnapshot(ctx, normalized, false)
	}
	var page domain.WorkspacePage
	err = s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		var err error
		page, err = listWorkspacesTx(ctx, tx, normalized)
		return err
	})
	return page, err
}

// ListCategoryWorkspaces atomically verifies category existence and executes
// the workspace query inside a single consistent WAL read transaction.
func (s *Store) ListCategoryWorkspaces(ctx context.Context, categoryID string, query domain.WorkspaceQuery) (domain.WorkspacePage, error) {
	categoryID = strings.TrimSpace(categoryID)
	if categoryID == "" {
		return domain.WorkspacePage{}, domain.ErrWorkspaceInvalid
	}
	query.CategoryID = categoryID
	normalized, err := domain.NormalizeWorkspaceQuery(query)
	if err != nil {
		return domain.WorkspacePage{}, err
	}
	if normalized.Snapshot != "" {
		return s.listWorkspaceSnapshot(ctx, normalized, true)
	}
	var page domain.WorkspacePage
	err = s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		exists, err := categoryExistsTx(ctx, tx, categoryID)
		if err != nil {
			return err
		}
		if !exists {
			return domain.ErrWorkspaceNotFound
		}
		page, err = listWorkspacesTx(ctx, tx, normalized)
		return err
	})
	return page, err
}

func (s *Store) listWorkspaceSnapshot(ctx context.Context, query domain.WorkspaceQuery, requireCategory bool) (domain.WorkspacePage, error) {
	if query.Snapshot != domain.WorkspaceSnapshotStart {
		if requireCategory {
			exists, err := categoryExistsTx(ctx, s.db.ReadPool(), query.CategoryID)
			if err != nil {
				return domain.WorkspacePage{}, err
			}
			if !exists {
				return domain.WorkspacePage{}, domain.ErrWorkspaceNotFound
			}
		}
		return s.pagination.Read(query)
	}
	var items []domain.WorkspaceSummary
	err := s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		if requireCategory {
			exists, err := categoryExistsTx(ctx, tx, query.CategoryID)
			if err != nil {
				return err
			}
			if !exists {
				return domain.ErrWorkspaceNotFound
			}
		}
		where, args, orderBy, hasCanvas := workspaceListingParts(query)
		rows, err := tx.QueryContext(ctx,
			`SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,`+hasCanvas+` FROM projects p WHERE `+where+` ORDER BY `+orderBy+` LIMIT ?`,
			append(args, paging.MaxSnapshotRows+1)...,
		)
		if err != nil {
			return err
		}
		defer func() { _ = rows.Close() }()
		items, err = scanWorkspaceSummaries(rows)
		return err
	})
	if err != nil {
		return domain.WorkspacePage{}, err
	}
	return s.pagination.Start(query, items)
}

func (s *Store) TrashWorkspace(ctx context.Context, id string, expectedVersion int) error {
	id = strings.TrimSpace(id)
	if id == "" || expectedVersion < 1 {
		return domain.ErrWorkspaceInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		envelope, err := snapshotWorkspaceEnvelopeTx(ctx, tx, id)
		if err != nil {
			return err
		}
		if envelope.Project.Version != expectedVersion {
			return domain.ErrWorkspaceConflict
		}
		now := sqlite.NowUTC()
		if err := insertTrashTx(ctx, tx, envelope.Project.ID, envelope.Project.CategoryID, envelope.Project.Title, now, envelope); err != nil {
			return err
		}
		return deleteProjectTx(ctx, tx, id)
	})
}

func (s *Store) ListTrash(ctx context.Context) ([]domain.TrashItem, error) {
	rows, err := s.db.ReadPool().QueryContext(ctx, `SELECT id,category_id,title,deleted_at FROM workspace_trash ORDER BY deleted_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	items := []domain.TrashItem{}
	for rows.Next() {
		var item domain.TrashItem
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title, &item.DeletedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) RestoreTrashedWorkspace(ctx context.Context, id string) (domain.Workspace, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.Workspace{}, domain.ErrWorkspaceInvalid
	}
	err := s.db.WithTx(ctx, func(tx *sql.Tx) error {
		record, err := readTrashTx(ctx, tx, id)
		if err != nil {
			return err
		}
		categoryID := record.CategoryID
		exists, err := categoryExistsTx(ctx, tx, categoryID)
		if err != nil {
			return err
		}
		if !exists {
			categoryID = domain.UncategorizedCategoryID
		}
		if err := restoreWorkspaceEnvelopeTx(ctx, tx, record.Payload, categoryID); err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, `DELETE FROM workspace_trash WHERE id=?`, id)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count != 1 {
			return domain.ErrWorkspaceNotFound
		}
		return nil
	})
	if err != nil {
		return domain.Workspace{}, err
	}
	return s.GetWorkspace(ctx, id)
}

func (s *Store) DeleteTrashedWorkspace(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return domain.ErrWorkspaceInvalid
	}
	return s.db.WithTx(ctx, func(tx *sql.Tx) error {
		record, err := readTrashTx(ctx, tx, id)
		if err != nil {
			return err
		}
		if err := rehomeNoteAssetsFromTrashTx(ctx, tx, record.Payload.Assets); err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, `DELETE FROM workspace_trash WHERE id=?`, id)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count == 0 {
			return domain.ErrWorkspaceNotFound
		}
		return nil
	})
}

// applyCanvasTx is the single canvas write path shared by UpdateCanvas and
// Canvas Note create/delete transactions, reusing the already-parsed scene.
func applyCanvasTx(ctx context.Context, tx *sql.Tx, workspaceID string, expectedVersion int, scene domain.ParsedScene) (domain.CanvasState, error) {
	encoded, err := json.Marshal(scene.Snapshot())
	if err != nil {
		return domain.CanvasState{}, err
	}
	now := sqlite.NowUTC()
	state, err := canvasStateFromRow(tx.QueryRowContext(ctx, `UPDATE workspace_canvas
SET canvas_state=?,updated_at=?,version=version+1,element_count=?
WHERE workspace_id=? AND version=?
RETURNING canvas_state,version,updated_at`,
		encoded, now, scene.ActiveElementCount(), workspaceID, expectedVersion,
	))
	if errors.Is(err, domain.ErrWorkspaceNotFound) {
		var count int
		if countErr := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_canvas WHERE workspace_id=?`, workspaceID).Scan(&count); countErr != nil {
			return domain.CanvasState{}, countErr
		}
		if count == 0 {
			return domain.CanvasState{}, domain.ErrWorkspaceNotFound
		}
		return domain.CanvasState{}, domain.ErrWorkspaceConflict
	}
	if err != nil {
		return domain.CanvasState{}, err
	}
	result, err := tx.ExecContext(ctx, `UPDATE projects SET updated_at=?,version=version+1 WHERE id=?`, now, workspaceID)
	if err != nil {
		return domain.CanvasState{}, err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return domain.CanvasState{}, domain.ErrWorkspaceNotFound
	}
	if err := syncNoteGeometryTx(ctx, tx, workspaceID, scene.Placements(), now); err != nil {
		return domain.CanvasState{}, err
	}
	if err := advanceCanvasSearchRevisionTx(ctx, tx, workspaceID); err != nil {
		return domain.CanvasState{}, err
	}
	if err := invalidateNotesInWorkspaceSearchTx(ctx, tx, workspaceID); err != nil {
		return domain.CanvasState{}, err
	}
	return state, nil
}

// --- internal workspace SQL helpers ---

func listWorkspacesTx(ctx context.Context, tx sqlite.DBTX, query domain.WorkspaceQuery) (domain.WorkspacePage, error) {
	where, args, orderBy, hasCanvasExpr := workspaceListingParts(query)
	var total int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects p WHERE `+where, args...).Scan(&total); err != nil {
		return domain.WorkspacePage{}, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,`+hasCanvasExpr+` FROM projects p WHERE `+where+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`, append(args, query.Limit, query.Offset)...)
	if err != nil {
		return domain.WorkspacePage{}, err
	}
	defer func() { _ = rows.Close() }()
	items, err := scanWorkspaceSummaries(rows)
	if err != nil {
		return domain.WorkspacePage{}, err
	}
	page := domain.WorkspacePage{Items: items, Total: total, Offset: query.Offset, Limit: query.Limit}
	if query.Offset+len(items) < total {
		next := query.Offset + len(items)
		page.NextOffset = &next
	}
	return page, nil
}

func insertCategoryTx(ctx context.Context, tx sqlite.DBTX, category domain.CategorySummary) error {
	_, err := tx.ExecContext(ctx,
		`INSERT INTO categories(id,title,created_at,updated_at) VALUES (?,?,?,?)`,
		category.ID, category.Title, category.CreatedAt, category.UpdatedAt,
	)
	return err
}

func listCategoriesTx(ctx context.Context, db sqlite.DBTX) ([]domain.CategorySummary, error) {
	rows, err := db.QueryContext(ctx, `SELECT c.id,c.title,c.created_at,c.updated_at,COUNT(p.id) FROM categories c LEFT JOIN projects p ON p.category_id=c.id GROUP BY c.id ORDER BY c.updated_at DESC,c.id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []domain.CategorySummary{}
	for rows.Next() {
		var category domain.CategorySummary
		if err := rows.Scan(&category.ID, &category.Title, &category.CreatedAt, &category.UpdatedAt, &category.WorkspaceCount); err != nil {
			return nil, err
		}
		out = append(out, category)
	}
	return out, rows.Err()
}

func categoryExistsTx(ctx context.Context, db sqlite.DBTX, id string) (bool, error) {
	var count int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, id).Scan(&count)
	return count > 0, err
}

func workspaceReadError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return domain.ErrWorkspaceNotFound
	}
	return err
}

func readProjectRow(row sqlite.Scanner) (domain.Workspace, error) {
	var p domain.Workspace
	err := row.Scan(&p.ID, &p.CategoryID, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version)
	if errors.Is(err, sql.ErrNoRows) {
		return p, domain.ErrWorkspaceNotFound
	}
	return p, err
}

func getWorkspaceRecordTx(ctx context.Context, db sqlite.DBTX, id string) (domain.Workspace, error) {
	return readProjectRow(db.QueryRowContext(ctx, `SELECT `+workspaceColumns+` FROM projects WHERE id=?`, id))
}

func canvasStateFromRow(row sqlite.Scanner) (domain.CanvasState, error) {
	var value domain.CanvasState
	var encoded string
	err := row.Scan(&encoded, &value.Version, &value.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return value, domain.ErrWorkspaceNotFound
	}
	if err != nil {
		return value, err
	}
	if err := json.Unmarshal([]byte(encoded), &value.Canvas); err != nil {
		return value, err
	}
	return value, nil
}

func getCanvasStateTx(ctx context.Context, db sqlite.DBTX, workspaceID string) (domain.CanvasState, error) {
	return canvasStateFromRow(db.QueryRowContext(ctx,
		`SELECT canvas_state,version,updated_at FROM workspace_canvas WHERE workspace_id=?`,
		workspaceID,
	))
}

func snapshotWorkspaceRecordTx(ctx context.Context, db sqlite.DBTX, id string) (domain.Workspace, error) {
	value, err := getWorkspaceRecordTx(ctx, db, id)
	if err != nil {
		return domain.Workspace{}, err
	}
	canvas, err := getCanvasStateTx(ctx, db, value.ID)
	if err != nil {
		return domain.Workspace{}, err
	}
	value.Canvas = canvas.Canvas
	value.CanvasVersion = canvas.Version
	return value, nil
}

func insertWorkspaceTx(ctx context.Context, tx sqlite.DBTX, value domain.Workspace, elementCount int) error {
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO projects(id,category_id,title,created_at,updated_at,version) VALUES (?,?,?,?,?,?)`,
		value.ID, value.CategoryID, value.Title, value.CreatedAt, value.UpdatedAt, value.Version,
	); err != nil {
		return err
	}
	canvas, err := json.Marshal(value.Canvas)
	if err != nil {
		return err
	}
	canvasVersion := value.CanvasVersion
	if canvasVersion < 1 {
		canvasVersion = 1
	}
	_, err = tx.ExecContext(ctx,
		`INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at,element_count) VALUES (?,?,?,?,?)`,
		value.ID, canvas, canvasVersion, value.UpdatedAt, elementCount,
	)
	return err
}

func deleteProjectTx(ctx context.Context, tx sqlite.DBTX, id string) error {
	result, err := tx.ExecContext(ctx, `DELETE FROM projects WHERE id=?`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return domain.ErrWorkspaceNotFound
	}
	return nil
}

func workspaceListingParts(query domain.WorkspaceQuery) (string, []any, string, string) {
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
		args = append(args, sqlite.ContainsLikeLiteral(query.Query))
	}
	if query.HasCanvas {
		conditions = append(conditions, hasCanvasExpr)
	}
	return strings.Join(conditions, " AND "), args, orderBy, hasCanvasExpr
}

func scanWorkspaceSummaries(rows *sql.Rows) ([]domain.WorkspaceSummary, error) {
	items := make([]domain.WorkspaceSummary, 0)
	for rows.Next() {
		var item domain.WorkspaceSummary
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
