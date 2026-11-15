package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/library"
	assetsquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/assets"
	backupquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/backup"
	canvasnotequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/canvasnote"
	searchquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/search"
	workspacequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/workspace"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"github.com/howlil/notespace/apps/server/migrations"
)

func (s *Store) ExportBackupArchive(ctx context.Context) ([]byte, error) {
	backup, err := s.libraryBackupAtomic(ctx)
	if err != nil {
		return nil, err
	}
	return backupquery.EncodeArchive(backup)
}

func (s *Store) RestoreBackupArchive(ctx context.Context, data []byte) error {
	backup, err := backupquery.DecodeArchive(data)
	if err != nil {
		return err
	}
	return s.restoreLibraryBackup(ctx, backup)
}

func (s *Store) libraryBackupAtomic(ctx context.Context) (backupquery.LibraryBackup, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	defer tx.Rollback()
	categories, err := workspacequery.ListCategories(ctx, tx)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	notes, err := canvasnotequery.SnapshotNotesTx(ctx, tx)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	ids, err := workspacequery.ListProjectIDsTx(ctx, tx)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	workspaces := make([]backupquery.WorkspaceEnvelope, 0, len(ids))
	for _, id := range ids {
		envelope, err := snapshotWorkspaceTx(ctx, tx, id)
		if err != nil {
			return backupquery.LibraryBackup{}, err
		}
		workspaces = append(workspaces, envelope)
	}
	trash, err := backupquery.TrashRecordsTx(ctx, tx)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	backup := backupquery.LibraryBackup{
		Format:      backupquery.LibraryBackupFormat,
		Version:     backupquery.LibraryBackupVersion,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Notes:       notes,
		Categories:  categories,
		Workspaces:  workspaces,
		Trash:       trash,
	}
	if err := tx.Commit(); err != nil && !errors.Is(err, sql.ErrTxDone) {
		return backupquery.LibraryBackup{}, err
	}
	return backup, nil
}

// RestoreTrashedWorkspace claims the trash row and restores its workspace
// in one transaction. A concurrent permanent purge can therefore win before
// this transaction or lose after it, but it cannot remove the row between the
// restore read and the restore commit.
func (s *Store) RestoreTrashedWorkspace(ctx context.Context, id string) (workspacepkg.Workspace, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	defer tx.Rollback()

	record, err := backupquery.ReadTrashTx(ctx, tx, id)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	categoryID := record.CategoryID
	exists, err := workspacequery.CategoryExists(ctx, tx, categoryID)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if !exists {
		categoryID = workspacepkg.UncategorizedCategoryID
	}
	if err := restoreWorkspaceTx(ctx, tx, record.Payload, categoryID); err != nil {
		return workspacepkg.Workspace{}, err
	}
	if err := backupquery.ClaimTrashedWorkspaceTx(ctx, tx, id); err != nil {
		return workspacepkg.Workspace{}, err
	}
	if err := migrations.Validate(ctx, tx); err != nil {
		return workspacepkg.Workspace{}, err
	}
	if err := tx.Commit(); err != nil {
		return workspacepkg.Workspace{}, err
	}
	return s.Get(ctx, id)
}

// DeleteCategory validates active and trashed ownership at the same
// serialization point as the delete. This closes the old check-then-delete gap
// where a workspace could enter trash after the HTTP preflight check.
func (s *Store) DeleteCategory(ctx context.Context, id string) error {
	if id == "" || id == workspacepkg.UncategorizedCategoryID {
		return workspacepkg.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	exists, err := workspacequery.CategoryExists(ctx, tx, id)
	if err != nil {
		return err
	}
	if !exists {
		return workspacepkg.ErrNotFound
	}
	trashed, err := backupquery.HasTrashedWorkspaceInCategoryTx(ctx, tx, id)
	if err != nil {
		return err
	}
	if trashed {
		return workspacepkg.ErrNotEmpty
	}
	if err := workspacequery.DeleteCategoryTx(ctx, tx, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) restoreLibraryBackup(ctx context.Context, backup backupquery.LibraryBackup) error {
	if err := backupquery.ValidateLibraryBackup(backup); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := searchquery.DeleteAllTx(ctx, tx); err != nil {
		return err
	}
	if err := canvasnotequery.DeleteAllTx(ctx, tx); err != nil {
		return err
	}
	if err := assetsquery.DeleteAllTx(ctx, tx); err != nil {
		return err
	}
	if err := backupquery.DeleteAllTx(ctx, tx); err != nil {
		return err
	}
	if err := workspacequery.DeleteAllTx(ctx, tx); err != nil {
		return err
	}
	for _, category := range backup.Categories {
		if err := workspacequery.CreateCategory(ctx, tx, category); err != nil {
			return err
		}
	}
	if err := canvasnotequery.RestoreNotesTx(ctx, tx, backup.Notes); err != nil {
		return err
	}
	for _, envelope := range backup.Workspaces {
		if err := restoreWorkspaceTx(ctx, tx, envelope, envelope.Project.CategoryID); err != nil {
			return err
		}
	}
	for _, record := range backup.Trash {
		if err := backupquery.InsertTrashTx(ctx, tx, record.ID, record.CategoryID, record.Title, record.DeletedAt, record.Payload); err != nil {
			return err
		}
	}
	if err := migrations.Validate(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}

func restoreWorkspaceTx(ctx context.Context, tx *sql.Tx, envelope backupquery.WorkspaceEnvelope, categoryID string) error {
	if err := backupquery.ValidateWorkspaceEnvelope(envelope, categoryID); err != nil {
		return err
	}
	workspace := envelope.Project
	workspace.CategoryID = categoryID
	if err := workspacequery.Restore(ctx, tx, workspace); err != nil {
		return err
	}
	if err := assetsquery.Restore(ctx, tx, workspace.ID, envelope.Assets); err != nil {
		return err
	}
	return canvasnotequery.RestoreInstancesTx(ctx, tx, workspace.ID, envelope.NoteInstances)
}

func snapshotWorkspaceTx(ctx context.Context, tx *sql.Tx, id string) (backupquery.WorkspaceEnvelope, error) {
	workspace, err := workspacequery.Snapshot(ctx, tx, id)
	if err != nil {
		return backupquery.WorkspaceEnvelope{}, err
	}
	assets, err := assetsquery.Snapshot(ctx, tx, id)
	if err != nil {
		return backupquery.WorkspaceEnvelope{}, err
	}
	noteInstances, err := canvasnotequery.SnapshotInstancesTx(ctx, tx, id)
	if err != nil {
		return backupquery.WorkspaceEnvelope{}, err
	}
	return backupquery.WorkspaceEnvelope{Project: workspace, Assets: assets, NoteInstances: noteInstances}, nil
}

func (s *Store) ListTrash(ctx context.Context) ([]library.TrashItem, error) {
	return backupquery.ListTrash(ctx, s.db)
}

func (s *Store) DeleteTrashedWorkspace(ctx context.Context, id string) error {
	return backupquery.DeleteTrashedWorkspace(ctx, s.db, id)
}

// TrashWorkspace rejects a destructive command made from a stale
// workspace view. The version comparison, trash snapshot, and delete share one
// transaction so no autosave can land between them.
func (s *Store) TrashWorkspace(ctx context.Context, id string, expectedVersion int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	envelope, err := snapshotWorkspaceTx(ctx, tx, id)
	if err != nil {
		return err
	}
	if envelope.Project.Version != expectedVersion {
		return workspacepkg.ErrConflict
	}
	if err := backupquery.InsertTrashTx(ctx, tx, envelope.Project.ID, envelope.Project.CategoryID, envelope.Project.Title, time.Now().UTC().Format(time.RFC3339Nano), envelope); err != nil {
		return err
	}
	if err := workspacequery.DeleteProjectTx(ctx, tx, id); err != nil {
		return err
	}
	return tx.Commit()
}
