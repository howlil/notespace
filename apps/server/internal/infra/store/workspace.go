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

const workspaceColumns = `id,parent_id,title,created_at,updated_at,version`

func normalizeParentID(parentID *string) (*string, error) {
	if parentID == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*parentID)
	if trimmed == "" {
		return nil, nil
	}
	if !domain.ValidID(trimmed, domain.MaxIDLength) {
		return nil, domain.ErrWorkspaceInvalid
	}
	return &trimmed, nil
}

func sameParentID(a, b *string) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

// CreateWorkspace creates a workspace under an optional parentID (nil for root)
// with a server-generated ID.
func (s *Store) CreateWorkspace(ctx context.Context, title string, parentID ...*string) (domain.Workspace, error) {
	var parent *string
	if len(parentID) > 0 {
		parent = parentID[0]
	}
	return s.CreateWorkspaceWithID(ctx, "", title, parent)
}

// CreateWorkspaceWithID atomically validates parent existence, checks
// idempotent client-ID replay, and inserts the workspace in one write tx.
func (s *Store) CreateWorkspaceWithID(ctx context.Context, id, title string, parentID *string) (domain.Workspace, error) {
	title = strings.TrimSpace(title)
	id = strings.TrimSpace(id)
	if id != "" && !domain.ValidID(id, domain.MaxIDLength) {
		return domain.Workspace{}, domain.ErrWorkspaceInvalid
	}
	if !domain.ValidTitle(title) {
		return domain.Workspace{}, domain.ErrWorkspaceInvalid
	}
	parent, err := normalizeParentID(parentID)
	if err != nil {
		return domain.Workspace{}, err
	}

	var out domain.Workspace
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		if parent != nil {
			exists, err := workspaceExistsTx(ctx, tx, *parent)
			if err != nil {
				return err
			}
			if !exists {
				return domain.ErrWorkspaceNotFound
			}
		}
		if id != "" {
			existing, err := snapshotWorkspaceRecordTx(ctx, tx, id)
			if err == nil {
				if existing.Title == title && sameParentID(existing.ParentID, parent) {
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
				ID:        id,
				ParentID:  parent,
				Title:     title,
				CreatedAt: now,
				UpdatedAt: now,
				Version:   1,
			},
			Canvas:        domain.CanvasSnapshot{Format: "excalidraw", Version: 1, Data: json.RawMessage(`{"elements":[],"appState":{},"files":{}}`)},
			CanvasVersion: 1,
		}
		if err := insertWorkspaceTx(ctx, tx, created, 0); err != nil {
			return err
		}
		if created.ParentID != nil {
			ancestors, err := listWorkspaceAncestorsTx(ctx, tx, created.ParentID)
			if err != nil {
				return err
			}
			created.Ancestors = ancestors
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

func (s *Store) MoveWorkspaceParent(ctx context.Context, id string, parentID *string, expectedParent domain.OptionalString) (domain.Workspace, error) {
	id = strings.TrimSpace(id)
	if !domain.ValidID(id, domain.MaxIDLength) {
		return domain.Workspace{}, domain.ErrWorkspaceInvalid
	}
	targetParent, err := normalizeParentID(parentID)
	if err != nil {
		return domain.Workspace{}, err
	}
	var expectedNormalized *string
	if expectedParent.Set {
		expectedNormalized, err = normalizeParentID(expectedParent.Value)
		if err != nil {
			return domain.Workspace{}, err
		}
	}

	var out domain.Workspace
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		var currentNull sql.NullString
		if err := tx.QueryRowContext(ctx, `SELECT parent_id FROM projects WHERE id=?`, id).Scan(&currentNull); err != nil {
			return workspaceReadError(err)
		}
		var currentParent *string
		if currentNull.Valid {
			val := currentNull.String
			currentParent = &val
		}
		if expectedParent.Set && !sameParentID(currentParent, expectedNormalized) {
			return domain.ErrWorkspaceConflict
		}
		if targetParent != nil {
			if *targetParent == id {
				return domain.ErrWorkspaceCycle
			}
			exists, err := workspaceExistsTx(ctx, tx, *targetParent)
			if err != nil {
				return err
			}
			if !exists {
				return domain.ErrWorkspaceNotFound
			}
			isDescendant, err := isAncestorOfTx(ctx, tx, id, *targetParent)
			if err != nil {
				return err
			}
			if isDescendant {
				return domain.ErrWorkspaceCycle
			}
		}
		if !sameParentID(currentParent, targetParent) {
			now := sqlite.NowUTC()
			var parentArg any
			if targetParent != nil {
				parentArg = *targetParent
			}
			if _, err := tx.ExecContext(ctx, `UPDATE projects SET parent_id=?,updated_at=?,version=version+1 WHERE id=?`, parentArg, now, id); err != nil {
				return err
			}
		}
		var err error
		out, err = snapshotWorkspaceRecordTx(ctx, tx, id)
		return err
	})
	return out, err
}

func (s *Store) ReparentWorkspaceChildren(ctx context.Context, sourceParentID string, targetParentID *string) (int, error) {
	sourceParentID = strings.TrimSpace(sourceParentID)
	if !domain.ValidID(sourceParentID, domain.MaxIDLength) {
		return 0, domain.ErrWorkspaceInvalid
	}
	targetParent, err := normalizeParentID(targetParentID)
	if err != nil {
		return 0, err
	}
	moved := 0
	err = s.db.WithTx(ctx, func(tx *sql.Tx) error {
		exists, err := workspaceExistsTx(ctx, tx, sourceParentID)
		if err != nil {
			return err
		}
		if !exists {
			return domain.ErrWorkspaceNotFound
		}
		if targetParent != nil {
			if *targetParent == sourceParentID {
				return domain.ErrWorkspaceCycle
			}
			targetExists, err := workspaceExistsTx(ctx, tx, *targetParent)
			if err != nil {
				return err
			}
			if !targetExists {
				return domain.ErrWorkspaceNotFound
			}
			isDescendant, err := isAncestorOfTx(ctx, tx, sourceParentID, *targetParent)
			if err != nil {
				return err
			}
			if isDescendant {
				return domain.ErrWorkspaceCycle
			}
		}
		now := sqlite.NowUTC()
		var parentArg any
		if targetParent != nil {
			parentArg = *targetParent
		}
		res, err := tx.ExecContext(ctx, `UPDATE projects SET parent_id=?,updated_at=?,version=version+1 WHERE parent_id=?`, parentArg, now, sourceParentID)
		if err != nil {
			return err
		}
		count, err := res.RowsAffected()
		if err != nil {
			return err
		}
		moved = int(count)
		return nil
	})
	return moved, err
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
		return s.listWorkspaceSnapshot(ctx, normalized)
	}
	var page domain.WorkspacePage
	err = s.db.WithReadTx(ctx, func(tx *sql.Tx) error {
		if normalized.ParentID != "" {
			exists, err := workspaceExistsTx(ctx, tx, normalized.ParentID)
			if err != nil {
				return err
			}
			if !exists {
				return domain.ErrWorkspaceNotFound
			}
		}
		var err error
		page, err = listWorkspacesTx(ctx, tx, normalized)
		return err
	})
	return page, err
}

func (s *Store) listWorkspaceSnapshot(ctx context.Context, query domain.WorkspaceQuery) (domain.WorkspacePage, error) {
	requireParent := query.ParentID != ""
	if query.Snapshot != domain.WorkspaceSnapshotStart {
		if requireParent {
			exists, err := workspaceExistsTx(ctx, s.db.ReadPool(), query.ParentID)
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
		if requireParent {
			exists, err := workspaceExistsTx(ctx, tx, query.ParentID)
			if err != nil {
				return err
			}
			if !exists {
				return domain.ErrWorkspaceNotFound
			}
		}
		where, args, orderBy, childCountExpr, hasCanvasExpr := workspaceListingParts(query)
		rows, err := tx.QueryContext(ctx,
			`SELECT p.id,p.parent_id,p.title,p.created_at,p.updated_at,p.version,`+childCountExpr+`,`+hasCanvasExpr+` FROM projects p WHERE `+where+` ORDER BY `+orderBy+` LIMIT ?`,
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
		var childCount int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE parent_id=?`, id).Scan(&childCount); err != nil {
			return err
		}
		if childCount > 0 {
			return domain.ErrWorkspaceHasChildren
		}
		now := sqlite.NowUTC()
		if err := insertTrashTx(ctx, tx, envelope.Project.ID, envelope.Project.ParentID, envelope.Project.Title, now, envelope); err != nil {
			return err
		}
		return deleteProjectTx(ctx, tx, id)
	})
}

func (s *Store) ListTrash(ctx context.Context) ([]domain.TrashItem, error) {
	rows, err := s.db.ReadPool().QueryContext(ctx, `
		SELECT t.id,t.parent_id,COALESCE(p.title,''),t.title,t.deleted_at
		FROM workspace_trash t
		LEFT JOIN projects p ON p.id=t.parent_id
		ORDER BY t.deleted_at DESC,t.id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	items := []domain.TrashItem{}
	for rows.Next() {
		var item domain.TrashItem
		var parent sql.NullString
		if err := rows.Scan(&item.ID, &parent, &item.ParentTitle, &item.Title, &item.DeletedAt); err != nil {
			return nil, err
		}
		if parent.Valid {
			val := parent.String
			item.ParentID = &val
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
	restoredToRoot := false
	err := s.db.WithTx(ctx, func(tx *sql.Tx) error {
		record, err := readTrashTx(ctx, tx, id)
		if err != nil {
			return err
		}
		parentID := record.ParentID
		if parentID != nil {
			exists, err := workspaceExistsTx(ctx, tx, *parentID)
			if err != nil {
				return err
			}
			if !exists {
				parentID = nil
				restoredToRoot = true
			}
		}
		if err := restoreWorkspaceEnvelopeTx(ctx, tx, record.Payload, parentID); err != nil {
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
	ws, err := s.GetWorkspace(ctx, id)
	if err != nil {
		return domain.Workspace{}, err
	}
	ws.RestoredToRoot = restoredToRoot
	return ws, nil
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

// ResolveLegacyCategory maps a retired category ID to its converted root
// Workspace ID (or nil for the legacy Uncategorized bucket).
func (s *Store) ResolveLegacyCategory(ctx context.Context, legacyCategoryID string) (*string, bool, error) {
	legacyCategoryID = strings.TrimSpace(legacyCategoryID)
	if legacyCategoryID == "" {
		return nil, false, domain.ErrWorkspaceInvalid
	}
	if legacyCategoryID == domain.UncategorizedCategoryID {
		return nil, true, nil
	}
	var workspaceID string
	err := s.db.ReadPool().QueryRowContext(ctx, `
		SELECT r.workspace_id
		FROM category_workspace_redirects r
		JOIN projects p ON p.id=r.workspace_id
		WHERE r.legacy_category_id=?`,
		legacyCategoryID,
	).Scan(&workspaceID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &workspaceID, true, nil
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
	where, args, orderBy, childCountExpr, hasCanvasExpr := workspaceListingParts(query)
	var total int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects p WHERE `+where, args...).Scan(&total); err != nil {
		return domain.WorkspacePage{}, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT p.id,p.parent_id,p.title,p.created_at,p.updated_at,p.version,`+childCountExpr+`,`+hasCanvasExpr+` FROM projects p WHERE `+where+` ORDER BY `+orderBy+` LIMIT ? OFFSET ?`, append(args, query.Limit, query.Offset)...)
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

func workspaceExistsTx(ctx context.Context, db sqlite.DBTX, id string) (bool, error) {
	var count int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE id=?`, id).Scan(&count)
	return count > 0, err
}

func isAncestorOfTx(ctx context.Context, db sqlite.DBTX, candidateAncestorID, nodeID string) (bool, error) {
	visited := map[string]bool{}
	cur := nodeID
	for cur != "" {
		if cur == candidateAncestorID {
			return true, nil
		}
		if visited[cur] {
			return false, nil
		}
		visited[cur] = true
		var parent sql.NullString
		err := db.QueryRowContext(ctx, `SELECT parent_id FROM projects WHERE id=?`, cur).Scan(&parent)
		if errors.Is(err, sql.ErrNoRows) || !parent.Valid {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		cur = parent.String
	}
	return false, nil
}

func listWorkspaceAncestorsTx(ctx context.Context, db sqlite.DBTX, startParentID *string) ([]domain.WorkspaceSummary, error) {
	if startParentID == nil || *startParentID == "" {
		return nil, nil
	}
	reversed := []domain.WorkspaceSummary{}
	visited := map[string]bool{}
	cur := *startParentID
	for cur != "" && !visited[cur] {
		visited[cur] = true
		var item domain.WorkspaceSummary
		var parent sql.NullString
		err := db.QueryRowContext(ctx, `SELECT `+workspaceColumns+` FROM projects WHERE id=?`, cur).
			Scan(&item.ID, &parent, &item.Title, &item.CreatedAt, &item.UpdatedAt, &item.Version)
		if errors.Is(err, sql.ErrNoRows) {
			break
		}
		if err != nil {
			return nil, err
		}
		if parent.Valid {
			val := parent.String
			item.ParentID = &val
			cur = val
		} else {
			cur = ""
		}
		reversed = append(reversed, item)
	}
	for i, j := 0, len(reversed)-1; i < j; i, j = i+1, j-1 {
		reversed[i], reversed[j] = reversed[j], reversed[i]
	}
	return reversed, nil
}

func workspaceReadError(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return domain.ErrWorkspaceNotFound
	}
	return err
}

func readProjectRow(row sqlite.Scanner) (domain.Workspace, error) {
	var p domain.Workspace
	var parent sql.NullString
	err := row.Scan(&p.ID, &parent, &p.Title, &p.CreatedAt, &p.UpdatedAt, &p.Version)
	if errors.Is(err, sql.ErrNoRows) {
		return p, domain.ErrWorkspaceNotFound
	}
	if err != nil {
		return p, err
	}
	if parent.Valid {
		val := parent.String
		p.ParentID = &val
	}
	return p, nil
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
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE parent_id=?`, value.ID).Scan(&value.ChildCount); err != nil {
		return domain.Workspace{}, err
	}
	ancestors, err := listWorkspaceAncestorsTx(ctx, db, value.ParentID)
	if err != nil {
		return domain.Workspace{}, err
	}
	value.Ancestors = ancestors
	value.Canvas = canvas.Canvas
	value.CanvasVersion = canvas.Version
	return value, nil
}

func insertWorkspaceTx(ctx context.Context, tx sqlite.DBTX, value domain.Workspace, elementCount int) error {
	var parentArg any
	if value.ParentID != nil {
		parentArg = *value.ParentID
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO projects(id,parent_id,title,created_at,updated_at,version) VALUES (?,?,?,?,?,?)`,
		value.ID, parentArg, value.Title, value.CreatedAt, value.UpdatedAt, value.Version,
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

func workspaceListingParts(query domain.WorkspaceQuery) (string, []any, string, string, string) {
	childCountExpr := "(SELECT COUNT(*) FROM projects ch WHERE ch.parent_id=p.id)"
	hasCanvasExpr := "(EXISTS(SELECT 1 FROM workspace_canvas c WHERE c.workspace_id=p.id AND c.element_count>0))"
	orderBy := "p.updated_at DESC, p.id"
	if query.ParentID != "" {
		orderBy = "p.title COLLATE NOCASE ASC, p.id"
	}
	switch query.Sort {
	case "updated":
		orderBy = "p.updated_at DESC, p.id"
	case "created":
		orderBy = "p.created_at DESC, p.id"
	case "name":
		orderBy = "p.title COLLATE NOCASE ASC, p.id"
	}
	conditions := []string{"1=1"}
	args := []any{}
	if query.RootOnly {
		conditions = append(conditions, "p.parent_id IS NULL")
	} else if strings.TrimSpace(query.ParentID) != "" {
		conditions = append(conditions, "p.parent_id=?")
		args = append(args, query.ParentID)
	}
	if strings.TrimSpace(query.Query) != "" {
		conditions = append(conditions, "LOWER(p.title) LIKE ? ESCAPE '\\'")
		args = append(args, sqlite.ContainsLikeLiteral(query.Query))
	}
	if query.HasCanvas {
		conditions = append(conditions, hasCanvasExpr)
	}
	return strings.Join(conditions, " AND "), args, orderBy, childCountExpr, hasCanvasExpr
}

func scanWorkspaceSummaries(rows *sql.Rows) ([]domain.WorkspaceSummary, error) {
	items := make([]domain.WorkspaceSummary, 0)
	for rows.Next() {
		var item domain.WorkspaceSummary
		var parent sql.NullString
		if err := rows.Scan(&item.ID, &parent, &item.Title, &item.CreatedAt, &item.UpdatedAt, &item.Version, &item.ChildCount, &item.HasCanvas); err != nil {
			return nil, err
		}
		if parent.Valid {
			val := parent.String
			item.ParentID = &val
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}
