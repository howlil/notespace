package capturequery

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/howlil/notespace/apps/server/internal/capture"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

const CaptureColumns = "id,content,status,version,created_at,updated_at,COALESCE(target_kind,''),COALESCE(target_workspace_id,''),COALESCE(target_id,''),COALESCE(converted_at,'')"

type CaptureRowScanner interface{ Scan(...any) error }

func ScanCapture(row CaptureRowScanner) (capture.Item, error) {
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

func ReadCapture(ctx context.Context, tx *sql.Tx, id string) (capture.Item, error) {
	return ScanCapture(tx.QueryRowContext(ctx, "SELECT "+CaptureColumns+" FROM capture_items WHERE id=?", id))
}
func CreateCapture(db dbtx.DBTX, ctx context.Context, content string) (capture.Item, error) {
	if !capture.ValidContent(content) {
		return capture.Item{}, capture.ErrInvalid
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	item := capture.Item{ID: rand.Text(), Content: content, Status: "pending", Version: 1, CreatedAt: now, UpdatedAt: now}
	_, err := db.ExecContext(ctx, `INSERT INTO capture_items(id,content,status,version,created_at,updated_at)
	VALUES (?,?,?,?,?,?)`, item.ID, item.Content, item.Status, item.Version, item.CreatedAt, item.UpdatedAt)
	if err != nil {
		return capture.Item{}, err
	}
	return item, nil
}

func ListCapturesTx(ctx context.Context, tx *sql.Tx) ([]capture.Item, error) {
	rows, err := tx.QueryContext(ctx, "SELECT "+CaptureColumns+" FROM capture_items ORDER BY created_at DESC,id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []capture.Item{}
	for rows.Next() {
		item, err := ScanCapture(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func ListCaptures(db dbtx.DBTX, ctx context.Context) ([]capture.Item, error) {
	rows, err := db.QueryContext(ctx, "SELECT "+CaptureColumns+" FROM capture_items WHERE status='pending' ORDER BY created_at DESC,id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []capture.Item{}
	for rows.Next() {
		item, err := ScanCapture(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func GetCapture(db dbtx.DBTX, ctx context.Context, id string) (capture.Item, error) {
	return ScanCapture(db.QueryRowContext(ctx, "SELECT "+CaptureColumns+" FROM capture_items WHERE id=?", id))
}

func CaptureTaskTitle(content string) string {
	title := "Captured task"
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
