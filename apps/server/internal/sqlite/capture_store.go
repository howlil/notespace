package sqlite

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/howlil/notespace/apps/server/internal/capture"
	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/workspace"
)

const captureColumns = "id,content,status,version,created_at,updated_at,COALESCE(target_kind,''),COALESCE(target_workspace_id,''),COALESCE(target_id,''),COALESCE(converted_at,'')"

type captureRowScanner interface{ Scan(...any) error }

func scanCapture(row captureRowScanner) (capture.Item, error) {
	var item capture.Item
	err := row.Scan(&item.ID, &item.Content, &item.Status, &item.Version, &item.CreatedAt, &item.UpdatedAt,
		&item.TargetKind, &item.TargetWorkspaceID, &item.TargetID, &item.ConvertedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return capture.Item{}, capture.ErrNotFound
	}
	if err != nil {
		return capture.Item{}, err
	}
	return item, nil
}

func readCapture(ctx context.Context, tx *sql.Tx, id string) (capture.Item, error) {
	return scanCapture(tx.QueryRowContext(ctx, "SELECT "+captureColumns+" FROM capture_items WHERE id=?", id))
}

func (s *Store) CreateCapture(ctx context.Context, content string) (capture.Item, error) {
	if !capture.ValidContent(content) {
		return capture.Item{}, capture.ErrInvalid
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	item := capture.Item{ID: rand.Text(), Content: content, Status: "pending", Version: 1, CreatedAt: now, UpdatedAt: now}
	_, err := s.db.ExecContext(ctx, `INSERT INTO capture_items(id,content,status,version,created_at,updated_at)
	VALUES (?,?,?,?,?,?)`, item.ID, item.Content, item.Status, item.Version, item.CreatedAt, item.UpdatedAt)
	if err != nil {
		return capture.Item{}, err
	}
	return item, nil
}

func listCapturesTx(ctx context.Context, tx *sql.Tx) ([]capture.Item, error) {
	rows, err := tx.QueryContext(ctx, "SELECT "+captureColumns+" FROM capture_items ORDER BY created_at DESC,id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []capture.Item{}
	for rows.Next() {
		item, err := scanCapture(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) ListCaptures(ctx context.Context) ([]capture.Item, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT "+captureColumns+" FROM capture_items WHERE status='pending' ORDER BY created_at DESC,id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []capture.Item{}
	for rows.Next() {
		item, err := scanCapture(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) GetCapture(ctx context.Context, id string) (capture.Item, error) {
	return scanCapture(s.db.QueryRowContext(ctx, "SELECT "+captureColumns+" FROM capture_items WHERE id=?", id))
}

func (s *Store) UpdateCapture(ctx context.Context, id string, version int, content string) (capture.Item, error) {
	if version < 1 || !capture.ValidContent(content) {
		return capture.Item{}, capture.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return capture.Item{}, err
	}
	defer tx.Rollback()
	item, err := readCapture(ctx, tx, id)
	if err != nil {
		return capture.Item{}, err
	}
	if item.Status != "pending" || item.Version != version {
		return capture.Item{}, capture.ErrConflict
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := tx.ExecContext(ctx, `UPDATE capture_items SET content=?,version=version+1,updated_at=?
	WHERE id=? AND status='pending' AND version=?`, content, now, id, version)
	if err != nil {
		return capture.Item{}, err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return capture.Item{}, err
	}
	if count != 1 {
		return capture.Item{}, capture.ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return capture.Item{}, err
	}
	item.Content = content
	item.Version++
	item.UpdatedAt = now
	return item, nil
}

func (s *Store) DeleteCapture(ctx context.Context, id string, version int) error {
	if version < 1 {
		return capture.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	item, err := readCapture(ctx, tx, id)
	if err != nil {
		return err
	}
	if item.Status != "pending" || item.Version != version {
		return capture.ErrConflict
	}
	res, err := tx.ExecContext(ctx, "DELETE FROM capture_items WHERE id=? AND status='pending' AND version=?", id, version)
	if err != nil {
		return err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return capture.ErrConflict
	}
	return tx.Commit()
}

func captureNoteTitle(content string) string {
	title := "Captured note"
	for _, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		if strings.TrimSpace(line) != "" {
			title = strings.TrimSpace(line)
			break
		}
	}
	if utf8.RuneCountInString(title) > 160 {
		title = string([]rune(title)[:160])
	}
	return title
}

// captureDocument preserves the full raw text as text-only Tiptap paragraphs.
// Markdown interpretation is a presentation concern for the M2 composer.
// The unmodified original is also retained in the conversion receipt.
func captureDocument(content string) ([]byte, error) {
	lines := strings.Split(strings.ReplaceAll(strings.ReplaceAll(content, "\r\n", "\n"), "\r", "\n"), "\n")
	blocks := make([]any, 0, len(lines))
	for _, line := range lines {
		paragraph := map[string]any{"type": "paragraph"}
		if line != "" {
			paragraph["content"] = []any{map[string]any{"type": "text", "text": line}}
		}
		blocks = append(blocks, paragraph)
	}
	return json.Marshal(map[string]any{
		"format": "tiptap", "version": 1,
		"data": map[string]any{"type": "doc", "content": blocks},
	})
}

func (s *Store) OrganizeCapture(ctx context.Context, id string, req capture.Organize) (capture.Item, error) {
	if req.Version < 1 || req.WorkspaceID == "" || (req.Kind != "note" && req.Kind != "task") ||
		(req.Document != nil && (req.Kind != "note" || !workspace.ValidDocumentSnapshot(*req.Document))) {
		return capture.Item{}, capture.ErrInvalid
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return capture.Item{}, err
	}
	defer tx.Rollback()
	item, err := readCapture(ctx, tx, id)
	if err != nil {
		return capture.Item{}, err
	}
	if item.Status == "converted" {
		// A lost HTTP response may be retried with the original version. Only
		// an identical request can observe the committed receipt.
		if item.TargetWorkspaceID != req.WorkspaceID || item.TargetKind != req.Kind || item.Version != req.Version+1 {
			return capture.Item{}, capture.ErrConflict
		}
		return item, nil
	}
	if item.Version != req.Version {
		return capture.Item{}, capture.ErrConflict
	}
	var exists int
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM projects WHERE id=?)", req.WorkspaceID).Scan(&exists); err != nil {
		return capture.Item{}, err
	}
	if exists == 0 {
		return capture.Item{}, capture.ErrNotFound
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	targetID := rand.Text()
	if req.Kind == "task" {
		var count, position int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*),COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id=?", req.WorkspaceID).Scan(&count, &position); err != nil {
			return capture.Item{}, err
		}
		if count >= planning.MaxTasksPerWorkspace {
			return capture.Item{}, capture.ErrInvalid
		}
		// Preserve the complete Capture body as the Task description. Use its
		// first nonempty line as the human-readable Task title.
		description := item.Content
		if utf8.RuneCountInString(description) > 4000 {
			return capture.Item{}, capture.ErrInvalid
		}
		title := captureNoteTitle(item.Content)
		if err := planning.ValidateTask(planning.Task{ID: targetID, WorkspaceID: &req.WorkspaceID, Title: title, Description: description, Position: position, Version: 1}); err != nil {
			return capture.Item{}, capture.ErrInvalid
		}
		if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(position),-1)+1 FROM planning_tasks WHERE workspace_id=? AND milestone_id IS NULL", req.WorkspaceID).Scan(&position); err != nil {
			return capture.Item{}, err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO planning_tasks(id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version)
		VALUES (?,?,NULL,?,?,?,NULL,NULL,?,?,1)`, targetID, req.WorkspaceID, title, description, position, now, now)
	} else {
		var count int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM workspace_notes WHERE workspace_id=?", req.WorkspaceID).Scan(&count); err != nil {
			return capture.Item{}, err
		}
		if count >= 100 {
			return capture.Item{}, capture.ErrInvalid
		}
		document, errDoc := captureDocument(item.Content)
		if errDoc != nil {
			return capture.Item{}, errDoc
		}
		if req.Document != nil {
			document, errDoc = json.Marshal(req.Document)
			if errDoc != nil {
				return capture.Item{}, errDoc
			}
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO workspace_notes(workspace_id,id,title,document_state,created_at,updated_at,version)
		VALUES (?,?,?,?,?,?,1)`, req.WorkspaceID, targetID, captureNoteTitle(item.Content), string(document), now, now)
		if err == nil {
			_, err = tx.ExecContext(ctx, `UPDATE projects SET updated_at=?,version=version+1,notes_revision=notes_revision+1 WHERE id=?`, now, req.WorkspaceID)
		}
	}
	if err != nil {
		return capture.Item{}, err
	}
	res, err := tx.ExecContext(ctx, `UPDATE capture_items SET status='converted',version=version+1,updated_at=?,target_kind=?,target_workspace_id=?,target_id=?,converted_at=?
	WHERE id=? AND status='pending' AND version=?`, now, req.Kind, req.WorkspaceID, targetID, now, id, req.Version)
	if err != nil {
		return capture.Item{}, err
	}
	count, err := res.RowsAffected()
	if err != nil {
		return capture.Item{}, err
	}
	if count != 1 {
		return capture.Item{}, capture.ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return capture.Item{}, err
	}
	item.Status = "converted"
	item.Version++
	item.UpdatedAt = now
	item.TargetKind = req.Kind
	item.TargetWorkspaceID = req.WorkspaceID
	item.TargetID = targetID
	item.ConvertedAt = now
	return item, nil
}
