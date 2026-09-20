package persistence

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/study"
)

func scanStudySession(row scanner) (study.Session, error) {
	var session study.Session
	var endedAt sql.NullString
	err := row.Scan(&session.ID, &session.WorkspaceID, &session.WorkspaceTitleSnapshot, &session.ActivityDate, &session.StartedAt, &endedAt, &session.ActiveSeconds, &session.LastHeartbeatAt)
	if errors.Is(err, sql.ErrNoRows) {
		return session, study.ErrNotFound
	}
	if err != nil {
		return session, err
	}
	if endedAt.Valid {
		session.EndedAt = &endedAt.String
	}
	return session, nil
}

const studyColumns = `id,workspace_id,workspace_title_snapshot,activity_date,started_at,ended_at,active_seconds,last_heartbeat_at`

func (s *Store) UpsertSession(ctx context.Context, session study.Session) (study.Session, error) {
	var endedAt any
	if session.EndedAt != nil {
		endedAt = *session.EndedAt
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO study_sessions(`+studyColumns+`) VALUES (?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET active_seconds=MAX(study_sessions.active_seconds,excluded.active_seconds),
  ended_at=COALESCE(study_sessions.ended_at,excluded.ended_at),
  last_heartbeat_at=MAX(study_sessions.last_heartbeat_at,excluded.last_heartbeat_at)
WHERE study_sessions.workspace_id=excluded.workspace_id`, session.ID, session.WorkspaceID, session.WorkspaceTitleSnapshot, session.ActivityDate, session.StartedAt, endedAt, session.ActiveSeconds, session.LastHeartbeatAt)
	if err != nil {
		return study.Session{}, err
	}
	return scanStudySession(s.db.QueryRowContext(ctx, `SELECT `+studyColumns+` FROM study_sessions WHERE id=? AND workspace_id=?`, session.ID, session.WorkspaceID))
}

func (s *Store) WorkspaceStats(ctx context.Context, workspaceID, activityDate string) (study.WorkspaceStats, error) {
	var stats study.WorkspaceStats
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN activity_date=? THEN active_seconds ELSE 0 END),0), COALESCE(SUM(active_seconds),0) FROM study_sessions WHERE workspace_id=?`, activityDate, workspaceID).Scan(&stats.TodaySeconds, &stats.TotalSeconds)
	return stats, err
}

func (s *Store) Activity(ctx context.Context, from, to string) (study.Activity, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT activity_date,COALESCE(SUM(active_seconds),0) FROM study_sessions WHERE activity_date BETWEEN ? AND ? GROUP BY activity_date ORDER BY activity_date`, from, to)
	if err != nil {
		return study.Activity{}, err
	}
	defer rows.Close()
	byDate := map[string]int64{}
	for rows.Next() {
		var date string
		var seconds int64
		if err := rows.Scan(&date, &seconds); err != nil {
			return study.Activity{}, err
		}
		byDate[date] = seconds
	}
	if err := rows.Err(); err != nil {
		return study.Activity{}, err
	}
	start, _ := time.Parse(study.DateLayout, from)
	end, _ := time.Parse(study.DateLayout, to)
	days := make([]study.DayActivity, 0)
	for date := start; !date.After(end); date = date.AddDate(0, 0, 1) {
		key := date.Format(study.DateLayout)
		days = append(days, study.DayActivity{Date: key, ActiveSeconds: byDate[key]})
	}
	weekStart := end.AddDate(0, 0, -((int(end.Weekday()) + 6) % 7))
	var weekSeconds, todaySeconds int64
	err = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(CASE WHEN activity_date BETWEEN ? AND ? THEN active_seconds ELSE 0 END),0), COALESCE(SUM(CASE WHEN activity_date=? THEN active_seconds ELSE 0 END),0) FROM study_sessions WHERE activity_date BETWEEN ? AND ?`, weekStart.Format(study.DateLayout), to, to, from, to).Scan(&weekSeconds, &todaySeconds)
	if err != nil {
		return study.Activity{}, err
	}
	return study.Activity{TodaySeconds: todaySeconds, WeekSeconds: weekSeconds, CurrentStreak: study.CalculateStreak(days, to), Days: days}, nil
}

func (s *Store) DayDetail(ctx context.Context, date string) (study.DayDetail, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT s.workspace_id,COALESCE(p.title,s.workspace_title_snapshot),CASE WHEN p.id IS NULL THEN 1 ELSE 0 END,COALESCE(SUM(s.active_seconds),0) FROM study_sessions s LEFT JOIN projects p ON p.id=s.workspace_id WHERE s.activity_date=? GROUP BY s.workspace_id,COALESCE(p.title,s.workspace_title_snapshot),p.id ORDER BY SUM(s.active_seconds) DESC,s.workspace_id`, date)
	if err != nil {
		return study.DayDetail{}, err
	}
	defer rows.Close()
	detail := study.DayDetail{Date: date, Workspaces: []study.WorkspaceBreakdown{}}
	for rows.Next() {
		var item study.WorkspaceBreakdown
		var deleted int
		if err := rows.Scan(&item.WorkspaceID, &item.Title, &deleted, &item.ActiveSeconds); err != nil {
			return study.DayDetail{}, err
		}
		item.Deleted = deleted == 1
		detail.ActiveSeconds += item.ActiveSeconds
		detail.Workspaces = append(detail.Workspaces, item)
	}
	return detail, rows.Err()
}
