package persistence

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/study"
)

func (s *Store) ListStudySessions(ctx context.Context, workspaceID string, limit int) ([]study.Session, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+studyColumns+` FROM study_sessions WHERE workspace_id=? ORDER BY activity_date DESC, started_at DESC, id DESC LIMIT ?`, workspaceID, limit)
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
	result, err := s.db.ExecContext(ctx, `DELETE FROM study_sessions WHERE workspace_id=? AND id=?`, workspaceID, sessionID)
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
