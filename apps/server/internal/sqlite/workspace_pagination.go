package sqlite

import (
	"context"
	"crypto/rand"
	"strings"
	"time"

	"github.com/howlil/notespace/apps/server/internal/workspace"
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
	items     []workspace.Summary
	expiresAt time.Time
}

type workspacePagingKey struct {
	categoryID string
	query      string
	sort       string
	hasCanvas  bool
	hasNotes   bool
}

func pagingKey(query workspace.WorkspaceQuery) workspacePagingKey {
	return workspacePagingKey{
		categoryID: query.CategoryID, query: query.Query, sort: query.Sort,
		hasCanvas: query.HasCanvas, hasNotes: query.HasNotes,
	}
}

// Keep the live and captured query paths on exactly the same filter/sort
// contract; snapshotting changes consistency, not which items qualify.
func workspaceListingParts(query workspace.WorkspaceQuery) (string, []any, string, string, string) {
	noteCount := "(SELECT COUNT(*) FROM workspace_notes n WHERE n.workspace_id=p.id)"
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
	return strings.Join(conditions, " AND "), args, orderBy, noteCount, hasCanvasExpr
}

func snapshotPage(items []workspace.Summary, token string, query workspace.WorkspaceQuery) workspace.WorkspacePage {
	offset := query.Offset
	if offset > len(items) {
		offset = len(items)
	}
	end := offset + query.Limit
	if end > len(items) {
		end = len(items)
	}
	page := workspace.WorkspacePage{
		Items:    append([]workspace.Summary{}, items[offset:end]...),
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

func (s *Store) listWorkspaceSnapshot(ctx context.Context, query workspace.WorkspaceQuery) (workspace.WorkspacePage, error) {
	if query.Offset < 0 || query.Limit < 1 || query.Limit > 100 || len(query.Snapshot) > 128 {
		return workspace.WorkspacePage{}, workspace.ErrInvalid
	}
	if query.Snapshot != "start" {
		s.pagingMu.Lock()
		defer s.pagingMu.Unlock()
		now := time.Now()
		session, ok := s.pagingSnapshots[query.Snapshot]
		if !ok || !now.Before(session.expiresAt) {
			delete(s.pagingSnapshots, query.Snapshot)
			return workspace.WorkspacePage{}, workspace.ErrConflict
		}
		if session.key != pagingKey(query) {
			return workspace.WorkspacePage{}, workspace.ErrInvalid
		}
		return snapshotPage(session.items, query.Snapshot, query), nil
	}
	if query.Offset != 0 {
		return workspace.WorkspacePage{}, workspace.ErrInvalid
	}

	where, args, orderBy, noteCount, hasCanvas := workspaceListingParts(query)
	rows, err := s.db.QueryContext(ctx, `SELECT p.id,p.category_id,p.title,p.created_at,p.updated_at,p.version,`+
		noteCount+`,`+hasCanvas+` FROM projects p WHERE `+where+
		` ORDER BY `+orderBy+` LIMIT ?`, append(args, maxWorkspaceSnapshotRows+1)...)
	if err != nil {
		return workspace.WorkspacePage{}, err
	}
	items := make([]workspace.Summary, 0)
	for rows.Next() {
		var item workspace.Summary
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title,
			&item.CreatedAt, &item.UpdatedAt, &item.Version, &item.NoteCount, &item.HasCanvas); err != nil {
			rows.Close()
			return workspace.WorkspacePage{}, err
		}
		items = append(items, item)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return workspace.WorkspacePage{}, err
	}
	if len(items) > maxWorkspaceSnapshotRows {
		return workspace.WorkspacePage{}, workspace.ErrInvalid
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
