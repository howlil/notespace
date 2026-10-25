package sqlite

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

// claimPlanningCreate is always called inside the same transaction as the
// eventual Task/Milestone INSERT. The first INSERT acquires SQLite's writer
// lock, serializing racing claims before they can observe stale state.
func claimPlanningCreate(ctx context.Context, tx *sql.Tx, kind, key, recordID string, request any) (string, bool, error) {
	if key == "" {
		return recordID, true, nil
	}
	body, err := json.Marshal(request)
	if err != nil {
		return "", false, err
	}
	sum := sha256.Sum256(body)
	hash := hex.EncodeToString(sum[:])
	result, err := tx.ExecContext(ctx, `INSERT INTO planning_create_requests(kind,request_key,payload_hash,record_id)
		VALUES (?,?,?,?) ON CONFLICT(kind,request_key) DO NOTHING`, kind, key, hash, recordID)
	if err != nil {
		return "", false, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return "", false, err
	}
	if n == 1 {
		return recordID, true, nil
	}
	var savedHash, savedID string
	if err := tx.QueryRowContext(ctx, `SELECT payload_hash,record_id FROM planning_create_requests
		WHERE kind=? AND request_key=?`, kind, key).Scan(&savedHash, &savedID); err != nil {
		return "", false, err
	}
	if savedHash != hash {
		return "", false, planning.ErrConflict
	}
	return savedID, false, nil
}

func replayTask(ctx context.Context, tx *sql.Tx, id string) (planning.Task, error) {
	item, err := scanTask(tx.QueryRowContext(ctx, `SELECT id,workspace_id,milestone_id,title,description,position,planned_for,completed_at,created_at,updated_at,version
		FROM planning_tasks WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		// Retain creation tombstones on delete; do not recreate removed work.
		return planning.Task{}, planning.ErrConflict
	}
	return item, err
}

func replayMilestone(ctx context.Context, tx *sql.Tx, id string) (planning.Milestone, error) {
	var item planning.Milestone
	var completed sql.NullString
	err := tx.QueryRowContext(ctx, `SELECT id,workspace_id,title,position,completed_at,created_at,updated_at,version
		FROM workspace_milestones WHERE id=?`, id).Scan(
		&item.ID, &item.WorkspaceID, &item.Title, &item.Position, &completed,
		&item.CreatedAt, &item.UpdatedAt, &item.Version,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return planning.Milestone{}, planning.ErrConflict
	}
	if err != nil {
		return planning.Milestone{}, err
	}
	if completed.Valid {
		item.CompletedAt = &completed.String
	}
	return item, nil
}
