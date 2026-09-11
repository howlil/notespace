package persistence

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/study"
)

func (s *Store) ListStudySessions(ctx context.Context, workspaceID string, limit int) ([]study.Session, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT
  logical_session_id,
  workspace_id,
  MAX(workspace_title_snapshot),
  MIN(activity_date),
  MIN(started_at),
  CASE WHEN SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END) > 0 THEN NULL ELSE MAX(ended_at) END,
  SUM(active_seconds),
  MAX(last_heartbeat_at)
FROM study_sessions
WHERE workspace_id=?
GROUP BY logical_session_id,workspace_id
ORDER BY MAX(last_heartbeat_at) DESC, logical_session_id DESC
LIMIT ?`, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]study.Session, 0)
	for rows.Next() {
		session, err := scanStudySession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func (s *Store) DeleteStudySession(ctx context.Context, workspaceID, sessionID string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM study_sessions WHERE workspace_id=? AND logical_session_id=?`, workspaceID, sessionID)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return study.ErrNotFound
	}
	return nil
}
