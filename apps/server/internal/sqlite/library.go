package sqlite

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/howlil/notespace/apps/server/internal/library"
	activityquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/activity"
	assetsquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/assets"
	backupquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/backup"
	capturequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/capture"
	planningquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/planning"
	workspacequery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/workspace"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"github.com/howlil/notespace/apps/server/migrations"
)

func (s *Store) ExportBackupArchive(ctx context.Context) ([]byte, error) {
	backup, err := s.libraryBackupAtomic(ctx)
	if err != nil {
		return nil, err
	}
	blobs := map[string][]byte{}
	catalog := map[string]backupquery.ArchiveBlob{}
	manifest := backupquery.LibraryArchiveManifest{
		Format: backupquery.LibraryBackupFormat, Version: backupquery.LibraryArchiveVersion, SchemaVersion: backupquery.LibraryArchiveSchemaVersion,
		GeneratedAt: backup.GeneratedAt, Categories: backup.Categories, Activity: backup.Activity, DeletedActivitySessionIDs: backup.DeletedActivitySessionIDs, Tasks: backup.Tasks, Captures: backup.Captures,
		Workspaces: make([]backupquery.ArchiveWorkspaceEnvelope, 0, len(backup.Workspaces)),
		Trash:      make([]backupquery.ArchiveTrashRecord, 0, len(backup.Trash)),
	}
	for _, workspace := range backup.Workspaces {
		manifest.Workspaces = append(manifest.Workspaces, backupquery.ArchiveEnvelope(workspace, blobs, catalog))
	}
	for _, record := range backup.Trash {
		manifest.Trash = append(manifest.Trash, backupquery.ArchiveTrashRecord{
			ID: record.ID, CategoryID: record.CategoryID, Title: record.Title, DeletedAt: record.DeletedAt,
			Payload: backupquery.ArchiveEnvelope(record.Payload, blobs, catalog),
		})
	}
	for _, entry := range catalog {
		manifest.Blobs = append(manifest.Blobs, entry)
	}
	sort.Slice(manifest.Blobs, func(i, j int) bool { return manifest.Blobs[i].Path < manifest.Blobs[j].Path })

	manifestJSON, err := json.Marshal(manifest)
	if err != nil {
		return nil, err
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	manifestWriter, err := writer.Create(backupquery.ArchiveManifestPath)
	if err != nil {
		return nil, err
	}
	if _, err := manifestWriter.Write(manifestJSON); err != nil {
		return nil, err
	}
	for _, entry := range manifest.Blobs {
		header := &zip.FileHeader{Name: entry.Path, Method: zip.Store}
		blobWriter, err := writer.CreateHeader(header)
		if err != nil {
			return nil, err
		}
		if _, err := blobWriter.Write(blobs[entry.Path]); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}
func (s *Store) RestoreBackupArchive(ctx context.Context, data []byte) error {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return backupquery.InvalidArchive("invalid ZIP backup")
	}
	entries := map[string]*zip.File{}
	for _, file := range reader.File {
		if file.Name == "" || strings.Contains(file.Name, "\\") || strings.HasPrefix(file.Name, "/") || strings.Contains(file.Name, "../") {
			return backupquery.InvalidArchive("unsafe backup entry")
		}
		if _, exists := entries[file.Name]; exists {
			return backupquery.InvalidArchive("duplicate backup entry")
		}
		entries[file.Name] = file
	}
	manifestFile := entries[backupquery.ArchiveManifestPath]
	if manifestFile == nil {
		return backupquery.InvalidArchive("backup manifest missing")
	}
	manifestJSON, err := backupquery.ReadArchiveEntry(manifestFile, backupquery.MaxArchiveManifestBytes)
	if err != nil {
		return err
	}
	var manifest backupquery.LibraryArchiveManifest
	if err := json.Unmarshal(manifestJSON, &manifest); err != nil {
		return backupquery.InvalidArchive("invalid backup manifest")
	}
	if manifest.Format != backupquery.LibraryBackupFormat || (manifest.Version != 2 && manifest.Version != backupquery.LibraryArchiveVersion) || manifest.SchemaVersion > backupquery.LibraryArchiveSchemaVersion {
		return backupquery.InvalidArchive("unsupported backup format")
	}

	blobData := map[string][]byte{}
	seenBlobs := map[string]bool{}
	var expanded uint64
	for _, blob := range manifest.Blobs {
		if blob.Path != "blobs/"+blob.SHA256 || len(blob.SHA256) != 64 || blob.Size < 0 || seenBlobs[blob.Path] {
			return backupquery.InvalidArchive("invalid blob manifest")
		}
		file := entries[blob.Path]
		if file == nil || file.Method != zip.Store || file.UncompressedSize64 != uint64(blob.Size) {
			return backupquery.InvalidArchive("blob entry mismatch")
		}
		expanded += file.UncompressedSize64
		if expanded > uint64(len(data)) {

			// Exported blobs use zip.Store, so a valid Notespace archive cannot
			// expand beyond its archive size. This rejects decompression bombs.
			return backupquery.InvalidArchive("backup expands beyond round-trip bound")
		}
		body, err := backupquery.ReadArchiveEntry(file, file.UncompressedSize64)
		if err != nil {
			return err
		}
		if backupquery.ArchiveHash(body) != blob.SHA256 {
			return backupquery.InvalidArchive("blob checksum mismatch")
		}
		seenBlobs[blob.Path] = true
		blobData[blob.Path] = body
	}

	backup := backupquery.LibraryBackup{
		Format: backupquery.LibraryBackupFormat, Version: manifest.Version, GeneratedAt: manifest.GeneratedAt,
		Categories: manifest.Categories, Activity: manifest.Activity, DeletedActivitySessionIDs: manifest.DeletedActivitySessionIDs, Tasks: manifest.Tasks, Captures: manifest.Captures,
		Workspaces: make([]backupquery.WorkspaceEnvelope, 0, len(manifest.Workspaces)),
		Trash:      make([]backupquery.TrashRecord, 0, len(manifest.Trash)),
	}
	for _, workspace := range manifest.Workspaces {
		envelope, err := backupquery.RestoreArchiveEnvelope(workspace, blobData)
		if err != nil {
			return err
		}
		backup.Workspaces = append(backup.Workspaces, envelope)
	}
	for _, record := range manifest.Trash {
		envelope, err := backupquery.RestoreArchiveEnvelope(record.Payload, blobData)
		if err != nil {
			return err
		}
		backup.Trash = append(backup.Trash, backupquery.TrashRecord{ID: record.ID, CategoryID: record.CategoryID, Title: record.Title, DeletedAt: record.DeletedAt, Payload: envelope})
	}
	return s.restoreLibraryBackup(ctx, backup)
}
func (s *Store) libraryBackupAtomic(ctx context.Context) (backupquery.LibraryBackup, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	defer tx.Rollback()
	categories, err := workspacequery.CategoriesTx(ctx, tx)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT id FROM projects ORDER BY updated_at DESC,id`)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return backupquery.LibraryBackup{}, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return backupquery.LibraryBackup{}, err
	}
	rows.Close()
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
	sessions, err := activityquery.ActivitySessionsTx(ctx, tx)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	deletedIDs, err := activityquery.DeletedActivitySessionIDsTx(ctx, tx)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	tasks, err := planningquery.StandaloneTasksTx(ctx, tx)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	captures, err := capturequery.ListCapturesTx(ctx, tx)
	if err != nil {
		return backupquery.LibraryBackup{}, err
	}
	backup := backupquery.LibraryBackup{
		Format: backupquery.LibraryBackupFormat, Version: backupquery.LibraryBackupVersion,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Categories:  categories, Workspaces: workspaces, Tasks: tasks, Trash: trash, Activity: sessions, DeletedActivitySessionIDs: deletedIDs, Captures: captures,
	}
	if err := tx.Commit(); err != nil && !errors.Is(err, sql.ErrTxDone) {
		return backupquery.LibraryBackup{}, err
	}
	return backup, nil
}

func (s *Store) exportBackupJSONAtomic(ctx context.Context) ([]byte, error) {
	backup, err := s.libraryBackupAtomic(ctx)
	if err != nil {
		return nil, err
	}
	return json.Marshal(backup)
}
func (s *Store) RestoreBackupJSON(ctx context.Context, data []byte) error {
	var backup backupquery.LibraryBackup
	if err := json.Unmarshal(data, &backup); err != nil {
		return fmt.Errorf("decode backup: %w", err)
	}
	return s.restoreLibraryBackup(ctx, backup)
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
	var categoryCount int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, categoryID).Scan(&categoryCount); err != nil {
		return workspacepkg.Workspace{}, err
	}
	if categoryCount == 0 {
		categoryID = workspacepkg.UncategorizedCategoryID
	}
	if err := restoreWorkspaceTx(ctx, tx, record.Payload, categoryID); err != nil {
		return workspacepkg.Workspace{}, err
	}
	result, err := tx.ExecContext(ctx, `DELETE FROM workspace_trash WHERE id=?`, id)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	if count != 1 {
		return workspacepkg.Workspace{}, workspacepkg.ErrConflict
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

	var exists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM categories WHERE id=?`, id).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return workspacepkg.ErrNotFound
	}
	var active, trashed int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM projects WHERE category_id=?`, id).Scan(&active); err != nil {
		return err
	}
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_trash WHERE category_id=?`, id).Scan(&trashed); err != nil {
		return err
	}
	if active > 0 || trashed > 0 {
		return workspacepkg.ErrNotEmpty
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
		return workspacepkg.ErrNotFound
	}
	return tx.Commit()
}
func (s *Store) restoreLibraryBackup(ctx context.Context, backup backupquery.LibraryBackup) error {
	if err := backupquery.NormalizeRetiredBackup(&backup); err != nil {
		return err
	}
	if err := backupquery.ValidateLibraryBackup(backup); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, statement := range []string{
		`DELETE FROM workspace_search`,
		`DELETE FROM workspace_search_meta`,
		`DELETE FROM workspace_history_payload`,
		`DELETE FROM workspace_history`,
		`DELETE FROM workspace_assets`,
		`DELETE FROM capture_items`,
		`DELETE FROM planning_tasks`,
		`DELETE FROM workspace_milestones`,
		`DELETE FROM workspace_notes`,
		`DELETE FROM workspace_canvas`,
		`DELETE FROM projects`,
		`DELETE FROM workspace_trash`,
		`DELETE FROM activity_sessions`,
		`DELETE FROM activity_deleted_sessions`,
		`DELETE FROM categories`,
	} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return err
		}
	}

	for _, category := range backup.Categories {
		if _, err := tx.ExecContext(ctx, `INSERT INTO categories(id,title,created_at,updated_at) VALUES (?,?,?,?)`, category.ID, category.Title, category.CreatedAt, category.UpdatedAt); err != nil {
			return err
		}
	}
	for _, envelope := range backup.Workspaces {
		if err := restoreWorkspaceTx(ctx, tx, envelope, envelope.Project.CategoryID); err != nil {
			return err
		}
	}
	if err := planningquery.RestoreStandaloneTasksTx(ctx, tx, backup.Tasks); err != nil {
		return err
	}
	for _, record := range backup.Trash {
		payload, err := backupquery.EncodeTrashEnvelope(record.Payload)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES (?,?,?,?,?)`, record.ID, record.CategoryID, record.Title, record.DeletedAt, payload); err != nil {
			return err
		}
	}
	for _, raw := range backup.Activity {
		session := activityquery.NormalizeActivitySession(raw)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO activity_sessions(
				id,logical_session_id,workspace_id,workspace_title_snapshot,
				task_id,task_title_snapshot,activity_title,activity_type,
				activity_date,started_at,ended_at,active_seconds,last_heartbeat_at,revision
			)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		`, session.ID, "", session.WorkspaceID, session.WorkspaceTitleSnapshot,
			session.TaskID, session.TaskTitleSnapshot, session.Title, session.ActivityType,
			session.ActivityDate, session.StartedAt, session.EndedAt, session.ActiveSeconds, session.LastHeartbeatAt, session.Revision); err != nil {
			return err
		}
	}
	for _, id := range backup.DeletedActivitySessionIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO activity_deleted_sessions(logical_session_id) VALUES (?)`, id); err != nil {
			return err
		}
	}
	for _, item := range backup.Captures {
		var kind, workspaceID, targetID, convertedAt any
		if item.Status == "converted" {
			kind, workspaceID, targetID, convertedAt = item.TargetKind, item.TargetWorkspaceID, item.TargetID, item.ConvertedAt
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO capture_items(
			id,content,status,version,created_at,updated_at,
			target_kind,target_workspace_id,target_id,converted_at)
			VALUES (?,?,?,?,?,?,?,?,?,?)`,
			item.ID, item.Content, item.Status, item.Version, item.CreatedAt, item.UpdatedAt,
			kind, workspaceID, targetID, convertedAt); err != nil {
			return err
		}
	}
	if err := migrations.Validate(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}
func restoreWorkspaceTx(ctx context.Context, tx *sql.Tx, envelope backupquery.WorkspaceEnvelope, categoryID string) error {
	if err := backupquery.NormalizeRetiredEnvelope(&envelope); err != nil {
		return err
	}
	if err := backupquery.ValidateWorkspaceEnvelope(envelope, categoryID); err != nil {
		return err
	}
	workspace := envelope.Project
	workspace.CategoryID = categoryID
	if err := workspacequery.Restore(ctx, tx, workspace, envelope.History); err != nil {
		return err
	}
	if err := planningquery.RestorePlanTx(ctx, tx, envelope.Plan, workspace.ID); err != nil {
		return err
	}
	return assetsquery.Restore(ctx, tx, workspace.ID, envelope.Assets)
}

func snapshotWorkspaceTx(ctx context.Context, tx *sql.Tx, id string) (backupquery.WorkspaceEnvelope, error) {
	workspace, history, err := workspacequery.Snapshot(ctx, tx, id)
	if err != nil {
		return backupquery.WorkspaceEnvelope{}, err
	}
	plan, err := planningquery.PlanTx(ctx, tx, id)
	if err != nil {
		return backupquery.WorkspaceEnvelope{}, err
	}
	assets, err := assetsquery.Snapshot(ctx, tx, id)
	if err != nil {
		return backupquery.WorkspaceEnvelope{}, err
	}
	return backupquery.WorkspaceEnvelope{Project: workspace, Plan: plan, History: history, Assets: assets}, nil
}

func (s *Store) ListTrash(ctx context.Context) ([]library.TrashItem, error) {
	return backupquery.ListTrash(s.db, ctx)
}

func (s *Store) DeleteTrashedWorkspace(ctx context.Context, id string) error {
	return backupquery.DeleteTrashedWorkspace(s.db, ctx, id)
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
	payload, err := backupquery.EncodeTrashEnvelope(envelope)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES (?,?,?,?,?)`, envelope.Project.ID, envelope.Project.CategoryID, envelope.Project.Title, time.Now().UTC().Format(time.RFC3339Nano), payload); err != nil {
		return err
	}
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
		return workspacepkg.ErrNotFound
	}
	return tx.Commit()
}
