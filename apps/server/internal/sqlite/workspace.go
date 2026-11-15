package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"time"

	canvasnotequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/canvasnote"
	searchquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/search"
	workspacequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/workspace"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
)

const (
	workspaceSnapshotLifetime = 10 * time.Minute
	maxWorkspaceSnapshots     = 8
	maxWorkspaceSnapshotRows  = 20000
)

// A pagination snapshot freezes only the listing projection. It does not hold
// a database transaction or prevent authors from editing Workspaces.
type workspacePagingSession struct {
	key       workspacePagingKey
	items     []workspacepkg.Summary
	expiresAt time.Time
}

type workspacePagingKey struct {
	categoryID string
	query      string
	sort       string
	hasCanvas  bool
}

func pagingKey(query workspacepkg.WorkspaceQuery) workspacePagingKey {
	return workspacePagingKey{
		categoryID: query.CategoryID, query: query.Query, sort: query.Sort,
		hasCanvas: query.HasCanvas,
	}
}

func snapshotPage(items []workspacepkg.Summary, token string, query workspacepkg.WorkspaceQuery) workspacepkg.WorkspacePage {
	offset := query.Offset
	if offset > len(items) {
		offset = len(items)
	}
	end := offset + query.Limit
	if end > len(items) {
		end = len(items)
	}
	page := workspacepkg.WorkspacePage{
		Items:    append([]workspacepkg.Summary{}, items[offset:end]...),
		Total:    len(items),
		Offset:   query.Offset,
		Limit:    query.Limit,
		Snapshot: token,
	}
	if end < len(items) {
		next := end
		page.NextOffset = &next
	}
	return page
}

func (s *Store) CreateCategory(ctx context.Context, category workspacepkg.CategorySummary) error {
	return workspacequery.CreateCategory(ctx, s.db, category)
}

func (s *Store) UpdateCategory(ctx context.Context, id, title string) (workspacepkg.CategorySummary, error) {
	return workspacequery.UpdateCategory(ctx, s.db, id, title, time.Now().UTC().Format(time.RFC3339Nano))
}

func (s *Store) ListCategories(ctx context.Context) ([]workspacepkg.CategorySummary, error) {
	return workspacequery.ListCategories(ctx, s.db)
}

func (s *Store) CategoryExists(ctx context.Context, id string) (bool, error) {
	return workspacequery.CategoryExists(ctx, s.db, id)
}

func (s *Store) GetCanvasState(ctx context.Context, workspaceID string) (workspacepkg.CanvasState, error) {
	return workspacequery.GetCanvasState(ctx, s.db, workspaceID)
}

func (s *Store) UpdateCanvas(ctx context.Context, workspaceID string, update workspacepkg.CanvasUpdate) (workspacepkg.CanvasState, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	defer tx.Rollback()
	state, err := applyCanvasTx(ctx, tx, workspaceID, update.Version, update.Canvas)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspacepkg.CanvasState{}, err
	}
	return state, nil
}

// applyCanvasTx is the single canvas write path shared by generic workspace
// updates and Canvas Note create/delete transactions. It bumps the optimistic
// Canvas version, syncs Note instance geometry, and marks the search projection
// stale in one transaction so no caller can drift from another caller's steps.
func applyCanvasTx(ctx context.Context, tx *sql.Tx, workspaceID string, version int, canvas workspacepkg.Snapshot) (workspacepkg.CanvasState, error) {
	elementCount, err := workspacepkg.CountActiveCanvasElements(canvas)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	state, err := workspacequery.UpdateCanvasTx(ctx, tx, workspaceID, version, canvas, elementCount, now)
	if err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if err := canvasnotequery.SyncGeometryTx(ctx, tx, workspaceID, canvas.Data, now); err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if err := searchquery.AdvanceCanvasRevisionTx(ctx, tx, workspaceID); err != nil {
		return workspacepkg.CanvasState{}, err
	}
	if err := searchquery.InvalidateNotesInWorkspaceTx(ctx, tx, workspaceID); err != nil {
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
	if err := workspacequery.Restore(ctx, tx, p); err != nil {
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
	value, err := workspacequery.RenameMetadataTx(ctx, tx, id, title, time.Now().UTC().Format(time.RFC3339Nano), expectedTitle...)
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
	value, err := workspacequery.MoveCategoryTx(ctx, tx, id, categoryID, time.Now().UTC().Format(time.RFC3339Nano), expectedCategory...)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspacepkg.Workspace{}, err
	}
	return value, nil
}

func (s *Store) ListWorkspaces(ctx context.Context, query workspacepkg.WorkspaceQuery) (workspacepkg.WorkspacePage, error) {
	if query.Snapshot != "" {
		return s.listWorkspaceSnapshot(ctx, query)
	}
	return workspacequery.ListWorkspaces(ctx, s.db, query)
}

func (s *Store) listWorkspaceSnapshot(ctx context.Context, query workspacepkg.WorkspaceQuery) (workspacepkg.WorkspacePage, error) {
	if query.Offset < 0 || query.Limit < 1 || query.Limit > 100 || len(query.Snapshot) > 128 {
		return workspacepkg.WorkspacePage{}, workspacepkg.ErrInvalid
	}
	if query.Snapshot != "start" {
		s.pagingMu.Lock()
		defer s.pagingMu.Unlock()
		now := time.Now()
		session, ok := s.pagingSnapshots[query.Snapshot]
		if !ok || !now.Before(session.expiresAt) {
			delete(s.pagingSnapshots, query.Snapshot)
			return workspacepkg.WorkspacePage{}, workspacepkg.ErrConflict
		}
		if session.key != pagingKey(query) {
			return workspacepkg.WorkspacePage{}, workspacepkg.ErrInvalid
		}
		return snapshotPage(session.items, query.Snapshot, query), nil
	}
	if query.Offset != 0 {
		return workspacepkg.WorkspacePage{}, workspacepkg.ErrInvalid
	}

	items, err := workspacequery.QuerySnapshotItems(ctx, s.db, query, maxWorkspaceSnapshotRows)
	if err != nil {
		return workspacepkg.WorkspacePage{}, err
	}

	s.pagingMu.Lock()
	defer s.pagingMu.Unlock()
	if s.pagingSnapshots == nil {
		s.pagingSnapshots = make(map[string]workspacePagingSession)
	}
	now := time.Now()
	for id, session := range s.pagingSnapshots {
		if !now.Before(session.expiresAt) {
			delete(s.pagingSnapshots, id)
		}
	}
	if len(s.pagingSnapshots) >= maxWorkspaceSnapshots {
		var oldestID string
		var oldest time.Time
		for id, session := range s.pagingSnapshots {
			if oldestID == "" || session.expiresAt.Before(oldest) {
				oldestID, oldest = id, session.expiresAt
			}
		}
		delete(s.pagingSnapshots, oldestID)
	}
	token := rand.Text()
	s.pagingSnapshots[token] = workspacePagingSession{
		key: pagingKey(query), items: items, expiresAt: now.Add(workspaceSnapshotLifetime),
	}
	return snapshotPage(items, token, query), nil
}

// GetWorkspaceSnapshot reads metadata and granular authored state in one
// transaction to avoid mixing different committed revisions.
func (s *Store) GetWorkspaceSnapshot(ctx context.Context, id string) (workspacepkg.Workspace, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	defer tx.Rollback()
	value, err := workspacequery.Snapshot(ctx, tx, id)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspacepkg.Workspace{}, err
	}
	return value, nil
}

func (s *Store) WorkspaceExists(ctx context.Context, id string) (bool, error) {
	return workspacequery.WorkspaceExists(ctx, s.db, id)
}

func (s *Store) Get(ctx context.Context, id string) (workspacepkg.Workspace, error) {
	return s.GetWorkspaceSnapshot(ctx, id)
}
