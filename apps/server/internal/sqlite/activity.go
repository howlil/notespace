package sqlite

import (
	"context"
	"errors"
	"strings"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/planning"
	activityquery "github.com/howlil/notespace/apps/server/internal/sqlite/internal/activity"
)

func (s *Store) LookupTask(ctx context.Context, taskID string) (activity.TaskRef, bool, error) {
	task, err := s.GetTask(ctx, taskID)
	if errors.Is(err, planning.ErrNotFound) {
		return activity.TaskRef{}, false, nil
	}
	if err != nil {
		return activity.TaskRef{}, false, err
	}
	return activity.TaskRef{Title: task.Title, WorkspaceID: task.WorkspaceID}, true, nil
}

func (s *Store) LookupWorkspace(ctx context.Context, id string) (activity.WorkspaceRef, bool, error) {
	return activityquery.LookupWorkspace(s.db, ctx, id)
}

func (s *Store) ListActivitySessions(ctx context.Context, limit int) ([]activity.Session, error) {
	return activityquery.ListActivitySessions(s.db, ctx, limit)
}

func (s *Store) DeleteActivitySession(ctx context.Context, sessionID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `DELETE FROM activity_sessions WHERE logical_session_id=?`, sessionID)
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
	if _, err := tx.ExecContext(ctx, `INSERT INTO activity_deleted_sessions(logical_session_id) VALUES (?)`, sessionID); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) UpsertSession(ctx context.Context, session activity.Session) (activity.Session, error) {
	session = activityquery.NormalizeActivitySession(session)
	var endedAt any
	if session.EndedAt != nil {
		endedAt = *session.EndedAt
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return activity.Session{}, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `INSERT INTO activity_sessions(`+activityquery.ActivityColumns+`)
SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (
  SELECT 1 FROM activity_deleted_sessions WHERE logical_session_id=?
)
-- Duration is always monotonic. Positive client revisions order context
-- independently of server arrival; zero retains M1/M2 legacy behavior.
-- A successful finish is a terminal command even if another heartbeat with a
-- higher revision reached SQLite first (the client outbox requires this ack).
ON CONFLICT(id) DO UPDATE SET active_seconds=MAX(activity_sessions.active_seconds,excluded.active_seconds),
  revision=MAX(activity_sessions.revision,excluded.revision),
  ended_at=COALESCE(activity_sessions.ended_at,excluded.ended_at),
  last_heartbeat_at=CASE
    WHEN activity_sessions.revision > 0
      AND excluded.revision <= activity_sessions.revision THEN activity_sessions.last_heartbeat_at
    WHEN activity_sessions.ended_at IS NOT NULL
      AND excluded.revision = 0
      AND excluded.active_seconds <= activity_sessions.active_seconds THEN activity_sessions.last_heartbeat_at
    WHEN excluded.last_heartbeat_at >= activity_sessions.last_heartbeat_at THEN excluded.last_heartbeat_at
    ELSE activity_sessions.last_heartbeat_at
  END,
  activity_title=CASE
    WHEN excluded.revision > activity_sessions.revision
      OR (activity_sessions.revision = 0 AND excluded.revision = 0
          AND excluded.active_seconds > activity_sessions.active_seconds) THEN excluded.activity_title
    ELSE activity_sessions.activity_title
  END,
  workspace_title_snapshot=CASE
    WHEN excluded.revision > activity_sessions.revision
      OR (activity_sessions.revision = 0 AND excluded.revision = 0
          AND excluded.active_seconds > activity_sessions.active_seconds) THEN excluded.workspace_title_snapshot
    ELSE activity_sessions.workspace_title_snapshot
  END,
  task_title_snapshot=CASE
    WHEN excluded.revision > activity_sessions.revision
      OR (activity_sessions.revision = 0 AND excluded.revision = 0
          AND excluded.active_seconds > activity_sessions.active_seconds) THEN excluded.task_title_snapshot
    ELSE activity_sessions.task_title_snapshot
  END
WHERE activity_sessions.task_id=excluded.task_id
  AND activity_sessions.activity_type=excluded.activity_type
  AND activity_sessions.activity_date=excluded.activity_date
  AND (
    activity_sessions.workspace_id=excluded.workspace_id
    OR (
      -- A historical unowned session may still be running while its legacy
      -- Task is assigned to a Workspace. Retain its original attribution,
      -- but allow heartbeat/finalization after the Task ownership changes.
      activity_sessions.workspace_id=''
      AND activity_sessions.task_id<>''
      AND activity_sessions.ended_at IS NULL
      AND EXISTS (
        SELECT 1 FROM planning_tasks p
        WHERE p.id=activity_sessions.task_id
          AND p.workspace_id=excluded.workspace_id
      )
    )
  )`,
		session.ID,
		session.WorkspaceID,
		session.WorkspaceTitleSnapshot,
		session.TaskID,
		session.TaskTitleSnapshot,
		session.Title,
		session.ActivityType,
		session.ActivityDate,
		session.StartedAt,
		endedAt,
		session.ActiveSeconds,
		session.LastHeartbeatAt,
		session.Revision,
		strings.SplitN(session.ID, ":", 2)[0],
	)
	if err != nil {
		return activity.Session{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return activity.Session{}, err
	}
	if affected == 0 {
		var deleted bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(
			SELECT 1 FROM activity_deleted_sessions WHERE logical_session_id=?
		)`, strings.SplitN(session.ID, ":", 2)[0]).Scan(&deleted); err != nil {
			return activity.Session{}, err
		}
		if deleted {
			return activity.Session{}, activity.ErrDeleted
		}
		return activity.Session{}, activity.ErrConflict
	}
	stored, err := activityquery.ScanActivitySession(tx.QueryRowContext(ctx, `SELECT `+activityquery.ActivityColumns+` FROM activity_sessions WHERE id=?`, session.ID))
	if err != nil {
		return activity.Session{}, err
	}
	if err := tx.Commit(); err != nil {
		return activity.Session{}, err
	}
	return stored, nil
}

func (s *Store) GlobalStats(ctx context.Context, activityDate string) (activity.WorkspaceStats, error) {
	return activityquery.GlobalStats(s.db, ctx, activityDate)
}

func (s *Store) Activity(ctx context.Context, from, to string) (activity.Activity, error) {
	return activityquery.Activity(s.db, ctx, from, to)
}

func (s *Store) DayDetail(ctx context.Context, date string) (activity.DayDetail, error) {
	return activityquery.DayDetail(s.db, ctx, date)
}
