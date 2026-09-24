package sqlite

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"github.com/howlil/notespace/apps/server/migrations"
)

func validateLibraryBackup(backup libraryBackup) error {
	if backup.Format != libraryBackupFormat || backup.Version != libraryBackupVersion {
		return workspacepkg.ErrInvalid
	}
	if len(backup.Categories) == 0 {
		return workspacepkg.ErrInvalid
	}

	categoryIDs := map[string]bool{}
	for _, category := range backup.Categories {
		if category.ID == "" || category.Title == "" || categoryIDs[category.ID] {
			return workspacepkg.ErrInvalid
		}
		categoryIDs[category.ID] = true
	}
	if !categoryIDs[workspacepkg.UncategorizedCategoryID] {
		return workspacepkg.ErrInvalid
	}

	workspaceIDs := map[string]bool{}
	activeTaskIDs := map[string]bool{}
	for _, envelope := range backup.Workspaces {
		if envelope.Project.ID == "" || workspaceIDs[envelope.Project.ID] || !categoryIDs[envelope.Project.CategoryID] {
			return workspacepkg.ErrInvalid
		}
		workspaceIDs[envelope.Project.ID] = true
		if err := validateWorkspaceEnvelope(envelope, envelope.Project.CategoryID); err != nil {
			return err
		}
		for _, task := range envelope.Plan.Tasks {
			if activeTaskIDs[task.ID] {
				return workspacepkg.ErrInvalid
			}
			activeTaskIDs[task.ID] = true
		}
	}
	for _, task := range backup.Tasks {
		if planning.ValidateStandaloneTask(task) != nil || activeTaskIDs[task.ID] {
			return workspacepkg.ErrInvalid
		}
		activeTaskIDs[task.ID] = true
	}
	for _, raw := range backup.Activity {
		session := normalizeActivitySession(raw)
		if !activity.ValidActivityType(session.ActivityType) {
			return workspacepkg.ErrInvalid
		}
	}

	trashIDs := map[string]bool{}
	for _, record := range backup.Trash {
		if record.ID == "" || trashIDs[record.ID] || record.Payload.Project.ID != record.ID || workspaceIDs[record.ID] {
			return workspacepkg.ErrInvalid
		}
		trashIDs[record.ID] = true
		if err := validateWorkspaceEnvelope(record.Payload, record.CategoryID); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) restoreLibraryBackup(ctx context.Context, backup libraryBackup) error {
	if err := validateLibraryBackup(backup); err != nil {
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
		`DELETE FROM planning_tasks`,
		`DELETE FROM workspace_milestones`,
		`DELETE FROM workspace_notes`,
		`DELETE FROM workspace_canvas`,
		`DELETE FROM projects`,
		`DELETE FROM workspace_trash`,
		`DELETE FROM activity_sessions`,
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
	if err := restoreStandaloneTasksTx(ctx, tx, backup.Tasks); err != nil {
		return err
	}
	for _, record := range backup.Trash {
		payload, err := encodeTrashEnvelope(record.Payload)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES (?,?,?,?,?)`, record.ID, record.CategoryID, record.Title, record.DeletedAt, payload); err != nil {
			return err
		}
	}
	for _, raw := range backup.Activity {
		session := normalizeActivitySession(raw)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO activity_sessions(
				id,logical_session_id,workspace_id,workspace_title_snapshot,
				task_id,task_title_snapshot,activity_title,activity_type,
				activity_date,started_at,ended_at,active_seconds,last_heartbeat_at
			)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
		`, session.ID, "", session.WorkspaceID, session.WorkspaceTitleSnapshot,
			session.TaskID, session.TaskTitleSnapshot, session.Title, session.ActivityType,
			session.ActivityDate, session.StartedAt, session.EndedAt, session.ActiveSeconds, session.LastHeartbeatAt); err != nil {
			return err
		}
	}
	if err := migrations.Validate(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}
