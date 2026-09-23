package sqlite

import (
	"context"
	"log/slog"

	"github.com/howlil/notespace/apps/server/internal/workspace"
)

// IndexedProjectStore keeps authored SQLite rows authoritative. Search has its
// own version-aware lazy repair path, so ordinary high-frequency autosaves do
// not rebuild the FTS projection before acknowledging the user's write.
type IndexedProjectStore struct{ *Store }

func NewIndexedProjectStore(store *Store) *IndexedProjectStore {
	return &IndexedProjectStore{Store: store}
}

func (s *IndexedProjectStore) refresh(ctx context.Context, workspaceID string) {
	if err := s.Store.refreshWorkspaceSearch(ctx, workspaceID); err != nil {
		slog.Warn("search projection refresh failed", "workspace_id", workspaceID, "error", err)
	}
}

func (s *IndexedProjectStore) Create(ctx context.Context, value workspace.Workspace) error {
	if err := s.Store.Create(ctx, value); err != nil {
		return err
	}
	s.refresh(ctx, value.ID)
	return nil
}

func (s *IndexedProjectStore) Update(ctx context.Context, id string, update workspace.Update) (workspace.Workspace, error) {
	// Autosave is the hottest write path. Search compares projection meta with
	// the authored workspace version and repairs stale entries on demand, so
	// rebuilding every note/block here only adds latency to the compatibility save response.
	return s.Store.Update(ctx, id, update)
}

func (s *IndexedProjectStore) CreateNote(ctx context.Context, workspaceID string, input workspace.NoteCreate) (workspace.Note, error) {
	note, err := s.Store.CreateNote(ctx, workspaceID, input)
	if err != nil {
		return note, err
	}
	if err := s.Store.refreshNoteSearch(ctx, workspaceID, note.ID); err != nil {
		slog.Warn("note search projection refresh failed", "workspace_id", workspaceID, "note_id", note.ID, "error", err)
	}
	return note, nil
}

func (s *IndexedProjectStore) UpdateNote(ctx context.Context, workspaceID, noteID string, update workspace.NoteUpdate) (workspace.Note, error) {
	// Note autosave is the hottest durable path. Authored rows and projection
	// metadata advance atomically in Store.UpdateNote; SearchIndexed detects the
	// stale notes_revision and repairs FTS lazily on the next search.
	return s.Store.UpdateNote(ctx, workspaceID, noteID, update)
}

func (s *IndexedProjectStore) DeleteNote(ctx context.Context, workspaceID, noteID string, version int) error {
	if err := s.Store.DeleteNote(ctx, workspaceID, noteID, version); err != nil {
		return err
	}
	s.refresh(ctx, workspaceID)
	return nil
}

func (s *IndexedProjectStore) Move(ctx context.Context, id, categoryID string) (workspace.Workspace, error) {
	value, err := s.Store.Move(ctx, id, categoryID)
	if err != nil {
		return value, err
	}
	s.refresh(ctx, id)
	return value, nil
}

// Search keeps the search projection behind the workspace.Store port. Callers do
// not need to know whether retrieval is backed by FTS or the base store.
func (s *IndexedProjectStore) Search(ctx context.Context, query string) ([]workspace.SearchResult, error) {
	return s.Store.SearchIndexed(ctx, query)
}
