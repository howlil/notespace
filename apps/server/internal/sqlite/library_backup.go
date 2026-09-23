package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/asset"
	"github.com/howlil/notespace/apps/server/internal/library"
	"github.com/howlil/notespace/apps/server/internal/planning"
	workspacepkg "github.com/howlil/notespace/apps/server/internal/workspace"
	"github.com/howlil/notespace/apps/server/migrations"
)

const libraryBackupFormat = "notespace-backup"
const libraryBackupVersion = 1

type workspaceEnvelope struct {
	Project workspacepkg.Workspace         `json:"project"`
	Plan    planning.Plan                  `json:"plan,omitempty"`
	History []workspacepkg.HistorySnapshot `json:"history"`
	Assets  []asset.Stored                 `json:"assets"`
}

type trashRecord struct {
	ID         string            `json:"id"`
	CategoryID string            `json:"categoryId"`
	Title      string            `json:"title"`
	DeletedAt  string            `json:"deletedAt"`
	Payload    workspaceEnvelope `json:"payload"`
}

type trashSummary struct {
	ID         string `json:"id"`
	CategoryID string `json:"categoryId"`
	Title      string `json:"title"`
	DeletedAt  string `json:"deletedAt"`
}

type libraryBackup struct {
	Format      string                         `json:"format"`
	Version     int                            `json:"version"`
	GeneratedAt string                         `json:"generatedAt"`
	Categories  []workspacepkg.CategorySummary `json:"categories"`
	Workspaces  []workspaceEnvelope            `json:"workspaces"`
	Tasks       []planning.Task                `json:"standaloneTasks,omitempty"`
	Trash       []trashRecord                  `json:"trash"`
	Activity    []activity.Session             `json:"studySessions"`
}

func (s *Store) snapshotWorkspace(ctx context.Context, id string) (workspaceEnvelope, error) {
	workspace, err := s.Get(ctx, id)
	if err != nil {
		return workspaceEnvelope{}, err
	}
	entries, err := s.ListHistory(ctx, id)
	if err != nil {
		return workspaceEnvelope{}, err
	}
	history := make([]workspacepkg.HistorySnapshot, 0, len(entries))
	for _, entry := range entries {
		snapshot, err := s.GetHistory(ctx, id, entry.ID)
		if err != nil {
			return workspaceEnvelope{}, err
		}
		history = append(history, snapshot)
	}
	assets, err := s.ListAssets(ctx, id)
	if err != nil {
		return workspaceEnvelope{}, err
	}
	plan, err := s.GetPlan(ctx, id)
	if err != nil {
		return workspaceEnvelope{}, err
	}
	return workspaceEnvelope{Project: workspace, Plan: plan, History: history, Assets: assets}, nil
}

func (s *Store) TrashWorkspace(ctx context.Context, id string) error {
	envelope, err := s.snapshotWorkspace(ctx, id)
	if err != nil {
		return err
	}
	payload, err := encodeTrashEnvelope(envelope)
	if err != nil {
		return err
	}
	deletedAt := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO workspace_trash(id,category_id,title,deleted_at,payload) VALUES (?,?,?,?,?)`,
		envelope.Project.ID, envelope.Project.CategoryID, envelope.Project.Title, deletedAt, payload,
	); err != nil {
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

func (s *Store) ListTrash(ctx context.Context) ([]library.TrashItem, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,category_id,title,deleted_at FROM workspace_trash ORDER BY deleted_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []library.TrashItem{}
	for rows.Next() {
		var item library.TrashItem
		if err := rows.Scan(&item.ID, &item.CategoryID, &item.Title, &item.DeletedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *Store) readTrash(ctx context.Context, id string) (trashRecord, error) {
	var record trashRecord
	var payload []byte
	err := s.db.QueryRowContext(ctx, `SELECT id,category_id,title,deleted_at,payload FROM workspace_trash WHERE id=?`, id).
		Scan(&record.ID, &record.CategoryID, &record.Title, &record.DeletedAt, &payload)
	if errors.Is(err, sql.ErrNoRows) {
		return record, workspacepkg.ErrNotFound
	}
	if err != nil {
		return record, err
	}
	if err := decodeTrashEnvelope(payload, &record.Payload); err != nil {
		return record, fmt.Errorf("decode trash payload: %w", err)
	}
	return record, nil
}

func validateWorkspaceEnvelope(envelope workspaceEnvelope, categoryID string) error {
	authored := envelope.Project
	authored.CategoryID = categoryID
	if err := workspacepkg.ValidateWorkspace(authored); err != nil {
		return err
	}
	for _, checkpoint := range envelope.History {
		if checkpoint.WorkspaceID != authored.ID {
			return workspacepkg.ErrInvalid
		}
		if err := workspacepkg.ValidateHistorySnapshot(checkpoint); err != nil {
			return err
		}
	}
	for _, stored := range envelope.Assets {
		if stored.ID == "" || stored.WorkspaceID != authored.ID || stored.MimeType == "" || len(stored.Data) == 0 {
			return workspacepkg.ErrInvalid
		}
	}
	plan := envelope.Plan
	if plan.WorkspaceID == "" {
		plan.WorkspaceID = authored.ID
	}
	if err := planning.ValidatePlan(plan, authored.ID); err != nil {
		return workspacepkg.ErrInvalid
	}
	return nil
}

func restoreWorkspaceTx(ctx context.Context, tx *sql.Tx, envelope workspaceEnvelope, categoryID string) error {
	if err := validateWorkspaceEnvelope(envelope, categoryID); err != nil {
		return err
	}
	workspace := envelope.Project
	workspace.CategoryID = categoryID
	references, err := json.Marshal(workspace.References)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO projects(id,category_id,title,references_state,split_ratio,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?)`,
		workspace.ID, workspace.CategoryID, workspace.Title, references,
		workspace.SplitRatio, workspace.CreatedAt, workspace.UpdatedAt, workspace.Version,
	); err != nil {
		return err
	}
	if err := insertGranularStateTx(ctx, tx, workspace); err != nil {
		return err
	}
	if err := restorePlanTx(ctx, tx, envelope.Plan, workspace.ID); err != nil {
		return err
	}
	for _, checkpoint := range envelope.History {
		if err := createHistory(ctx, tx, checkpoint); err != nil {
			return err
		}
	}
	for _, stored := range envelope.Assets {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO workspace_assets(workspace_id,id,mime_type,data,created_at) VALUES (?,?,?,?,?)`,
			workspace.ID, stored.ID, stored.MimeType, stored.Data, stored.CreatedAt,
		); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE workspace_assets SET staged=0 WHERE workspace_id=? AND EXISTS (SELECT 1 FROM workspace_asset_references r WHERE r.workspace_id=? AND r.asset_id=workspace_assets.id)`, workspace.ID, workspace.ID); err != nil {
		return err
	}
	return nil
}

func (s *Store) RestoreTrashedWorkspace(ctx context.Context, id string) (workspacepkg.Workspace, error) {
	record, err := s.readTrash(ctx, id)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return workspacepkg.Workspace{}, err
	}
	defer tx.Rollback()
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
	if _, err := tx.ExecContext(ctx, `DELETE FROM workspace_trash WHERE id=?`, id); err != nil {
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

func (s *Store) DeleteTrashedWorkspace(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM workspace_trash WHERE id=?`, id)
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

func (s *Store) CategoryHasTrash(ctx context.Context, categoryID string) (bool, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM workspace_trash WHERE category_id=?`, categoryID).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *Store) trashRecords(ctx context.Context) ([]trashRecord, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,category_id,title,deleted_at,payload FROM workspace_trash ORDER BY deleted_at DESC,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := []trashRecord{}
	for rows.Next() {
		var record trashRecord
		var payload []byte
		if err := rows.Scan(&record.ID, &record.CategoryID, &record.Title, &record.DeletedAt, &payload); err != nil {
			return nil, err
		}
		if err := decodeTrashEnvelope(payload, &record.Payload); err != nil {
			return nil, fmt.Errorf("decode trash payload %s: %w", record.ID, err)
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (s *Store) activitySessions(ctx context.Context) ([]activity.Session, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+activityColumns+` FROM activity_sessions ORDER BY started_at,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sessions := []activity.Session{}
	for rows.Next() {
		session, err := scanActivitySession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (s *Store) ExportBackupJSON(ctx context.Context) ([]byte, error) {
	categories, err := s.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	summaries, err := s.List(ctx)
	if err != nil {
		return nil, err
	}
	workspaces := make([]workspaceEnvelope, 0, len(summaries))
	for _, summary := range summaries {
		envelope, err := s.snapshotWorkspace(ctx, summary.ID)
		if err != nil {
			return nil, err
		}
		workspaces = append(workspaces, envelope)
	}
	trash, err := s.trashRecords(ctx)
	if err != nil {
		return nil, err
	}
	sessions, err := s.activitySessions(ctx)
	if err != nil {
		return nil, err
	}
	tasks, err := s.standaloneTasks(ctx)
	if err != nil {
		return nil, err
	}
	return json.Marshal(libraryBackup{
		Format: libraryBackupFormat, Version: libraryBackupVersion,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Categories:  categories, Workspaces: workspaces, Tasks: tasks, Trash: trash, Activity: sessions,
	})
}

func (s *Store) RestoreBackupJSON(ctx context.Context, data []byte) error {
	var backup libraryBackup
	if err := json.Unmarshal(data, &backup); err != nil {
		return fmt.Errorf("decode backup: %w", err)
	}
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
