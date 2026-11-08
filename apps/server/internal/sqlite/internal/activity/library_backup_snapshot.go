package activityquery

import (
	"context"
	"database/sql"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

func ActivitySessionsTx(ctx context.Context, tx *sql.Tx) ([]activity.Session, error) {
	rows, err := tx.QueryContext(ctx, `SELECT `+ActivityColumns+` FROM activity_sessions ORDER BY started_at,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sessions := []activity.Session{}
	for rows.Next() {
		session, err := ScanActivitySession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}

func DeletedActivitySessionIDsTx(ctx context.Context, tx *sql.Tx) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT logical_session_id FROM activity_deleted_sessions ORDER BY logical_session_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
