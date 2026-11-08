package activityquery

import (
	"context"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

const LogicalActivitySelect = `
WITH ranked_activity_sessions AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY logical_session_id,workspace_id,task_id
      ORDER BY julianday(last_heartbeat_at) DESC,id DESC
    ) AS latest_rank,
    ROW_NUMBER() OVER (
      PARTITION BY logical_session_id,workspace_id,task_id
      ORDER BY julianday(started_at) ASC,id ASC
    ) AS start_rank,
    ROW_NUMBER() OVER (
      PARTITION BY logical_session_id,workspace_id,task_id
      ORDER BY ended_at IS NULL ASC,julianday(ended_at) DESC,id DESC
    ) AS end_rank
  FROM activity_sessions
)
SELECT
  logical_session_id,
  workspace_id,
  COALESCE(MAX(CASE WHEN latest_rank=1 THEN workspace_title_snapshot END),''),
  task_id,
  COALESCE(MAX(CASE WHEN latest_rank=1 THEN task_title_snapshot END),''),
  COALESCE(MAX(CASE WHEN latest_rank=1 THEN activity_title END),''),
  COALESCE(MAX(CASE WHEN latest_rank=1 THEN activity_type END),''),
  MIN(activity_date),
  COALESCE(MAX(CASE WHEN start_rank=1 THEN started_at END),''),
  CASE
    WHEN SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END) > 0 THEN NULL
    ELSE MAX(CASE WHEN end_rank=1 THEN ended_at END)
  END,
  SUM(active_seconds),
  COALESCE(MAX(CASE WHEN latest_rank=1 THEN last_heartbeat_at END),''),
  COALESCE(MAX(CASE WHEN latest_rank=1 THEN revision END),0)
FROM ranked_activity_sessions
`

func ListActivitySessions(db dbtx.DBTX, ctx context.Context, limit int) ([]activity.Session, error) {
	rows, err := db.QueryContext(ctx, LogicalActivitySelect+`
GROUP BY logical_session_id,workspace_id,task_id
ORDER BY julianday(MAX(CASE WHEN latest_rank=1 THEN last_heartbeat_at END)) DESC, logical_session_id DESC
LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return ScanLogicalActivityRows(rows)
}

func ScanLogicalActivityRows(rows interface {
	Next() bool
	Err() error
	Scan(...any) error
}) ([]activity.Session, error) {
	sessions := make([]activity.Session, 0)
	for rows.Next() {
		session, err := ScanActivitySession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}
