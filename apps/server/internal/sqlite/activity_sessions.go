package sqlite

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

const logicalActivitySelect = `
WITH ranked_activity_sessions AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY logical_session_id,workspace_id,task_id
      ORDER BY last_heartbeat_at DESC,id DESC
    ) AS logical_rank
  FROM activity_sessions
)
SELECT
  logical_session_id,
  workspace_id,
  COALESCE(MAX(CASE WHEN logical_rank=1 THEN workspace_title_snapshot END),''),
  task_id,
  COALESCE(MAX(CASE WHEN logical_rank=1 THEN task_title_snapshot END),''),
  COALESCE(MAX(CASE WHEN logical_rank=1 THEN activity_title END),''),
  COALESCE(MAX(CASE WHEN logical_rank=1 THEN activity_type END),''),
  MIN(activity_date),
  MIN(started_at),
  CASE WHEN SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END) > 0 THEN NULL ELSE MAX(ended_at) END,
  SUM(active_seconds),
  MAX(last_heartbeat_at)
FROM ranked_activity_sessions
`

func (s *Store) ListWorkspaceSessions(ctx context.Context, workspaceID string, limit int) ([]activity.Session, error) {
	rows, err := s.db.QueryContext(ctx, logicalActivitySelect+`
WHERE workspace_id=?
GROUP BY logical_session_id,workspace_id,task_id
ORDER BY MAX(last_heartbeat_at) DESC, logical_session_id DESC
LIMIT ?`, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanLogicalActivityRows(rows)
}

func (s *Store) ListActivitySessions(ctx context.Context, limit int) ([]activity.Session, error) {
	rows, err := s.db.QueryContext(ctx, logicalActivitySelect+`
GROUP BY logical_session_id,workspace_id,task_id
ORDER BY MAX(last_heartbeat_at) DESC, logical_session_id DESC
LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanLogicalActivityRows(rows)
}

func scanLogicalActivityRows(rows interface {
	Next() bool
	Err() error
	Scan(...any) error
}) ([]activity.Session, error) {
	sessions := make([]activity.Session, 0)
	for rows.Next() {
		session, err := scanActivitySession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (s *Store) DeleteWorkspaceSession(ctx context.Context, workspaceID, sessionID string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM activity_sessions WHERE workspace_id=? AND logical_session_id=?`, workspaceID, sessionID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return activity.ErrNotFound
	}
	return nil
}

func (s *Store) DeleteActivitySession(ctx context.Context, sessionID string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM activity_sessions WHERE logical_session_id=?`, sessionID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return activity.ErrNotFound
	}
	return nil
}
