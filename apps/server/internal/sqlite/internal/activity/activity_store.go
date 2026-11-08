package activityquery

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/howlil/notespace/apps/server/internal/activity"
	"github.com/howlil/notespace/apps/server/internal/sqlite/internal/dbtx"
)

const ActivityColumns = `id,workspace_id,workspace_title_snapshot,task_id,task_title_snapshot,activity_title,activity_type,activity_date,started_at,ended_at,active_seconds,last_heartbeat_at,revision`

func ScanActivitySession(row dbtx.Scanner) (activity.Session, error) {
	var session activity.Session
	var endedAt sql.NullString
	err := row.Scan(
		&session.ID,
		&session.WorkspaceID,
		&session.WorkspaceTitleSnapshot,
		&session.TaskID,
		&session.TaskTitleSnapshot,
		&session.Title,
		&session.ActivityType,
		&session.ActivityDate,
		&session.StartedAt,
		&endedAt,
		&session.ActiveSeconds,
		&session.LastHeartbeatAt,
		&session.Revision,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return session, activity.ErrNotFound
	}
	if err != nil {
		return session, err
	}
	if endedAt.Valid {
		session.EndedAt = &endedAt.String
	}
	return session, nil
}

const CanonicalActivityTimestamp = "2006-01-02T15:04:05.000000000Z"

func CanonicalizeActivityTimestamp(value string) string {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return value
	}
	return parsed.UTC().Format(CanonicalActivityTimestamp)
}

func NormalizeActivitySession(session activity.Session) activity.Session {
	if session.ActivityType == "" {
		session.ActivityType = "learn"
	}
	if session.Title == "" {
		session.Title = session.WorkspaceTitleSnapshot
	}
	if session.Title == "" {
		session.Title = session.TaskTitleSnapshot
	}
	if session.Title == "" {
		session.Title = "Activity"
	}
	session.StartedAt = CanonicalizeActivityTimestamp(session.StartedAt)
	session.LastHeartbeatAt = CanonicalizeActivityTimestamp(session.LastHeartbeatAt)
	if session.EndedAt != nil {
		endedAt := CanonicalizeActivityTimestamp(*session.EndedAt)
		session.EndedAt = &endedAt
	}
	return session
}
func GlobalStats(db dbtx.DBTX, ctx context.Context, activityDate string) (activity.WorkspaceStats, error) {
	var stats activity.WorkspaceStats
	err := db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN activity_date=? THEN active_seconds ELSE 0 END),0),
			COALESCE(SUM(active_seconds),0)
		FROM activity_sessions
	`, activityDate).Scan(&stats.TodaySeconds, &stats.TotalSeconds)
	return stats, err
}
func Activity(db dbtx.DBTX, ctx context.Context, from, to string) (activity.Activity, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT activity_date,COALESCE(SUM(active_seconds),0)
		FROM activity_sessions
		WHERE activity_date BETWEEN ? AND ?
		GROUP BY activity_date
		ORDER BY activity_date
	`, from, to)
	if err != nil {
		return activity.Activity{}, err
	}
	defer rows.Close()
	byDate := map[string]int64{}
	for rows.Next() {
		var date string
		var seconds int64
		if err := rows.Scan(&date, &seconds); err != nil {
			return activity.Activity{}, err
		}
		byDate[date] = seconds
	}
	if err := rows.Err(); err != nil {
		return activity.Activity{}, err
	}
	start, _ := time.Parse(activity.DateLayout, from)
	end, _ := time.Parse(activity.DateLayout, to)
	days := make([]activity.DayActivity, 0)
	for date := start; !date.After(end); date = date.AddDate(0, 0, 1) {
		key := date.Format(activity.DateLayout)
		days = append(days, activity.DayActivity{Date: key, ActiveSeconds: byDate[key]})
	}
	weekStart := end.AddDate(0, 0, -((int(end.Weekday()) + 6) % 7))
	var weekSeconds, todaySeconds int64
	err = db.QueryRowContext(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN activity_date BETWEEN ? AND ? THEN active_seconds ELSE 0 END),0),
			COALESCE(SUM(CASE WHEN activity_date=? THEN active_seconds ELSE 0 END),0)
		FROM activity_sessions
		WHERE activity_date BETWEEN ? AND ?
	`, weekStart.Format(activity.DateLayout), to, to, from, to).Scan(&weekSeconds, &todaySeconds)
	if err != nil {
		return activity.Activity{}, err
	}
	return activity.Activity{
		TodaySeconds:  todaySeconds,
		WeekSeconds:   weekSeconds,
		CurrentStreak: activity.CalculateStreak(days, to),
		Days:          days,
	}, nil
}
func DayDetail(db dbtx.DBTX, ctx context.Context, date string) (activity.DayDetail, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT
			s.workspace_id,
			CASE
				WHEN s.workspace_id='' THEN s.activity_title
				ELSE COALESCE(p.title,s.workspace_title_snapshot)
			END,
			CASE WHEN s.workspace_id<>'' AND p.id IS NULL THEN 1 ELSE 0 END,
			COALESCE(SUM(s.active_seconds),0)
		FROM activity_sessions s
		LEFT JOIN projects p ON p.id=s.workspace_id
		WHERE s.activity_date=?
		GROUP BY
			s.workspace_id,
			CASE WHEN s.workspace_id='' THEN s.activity_title ELSE COALESCE(p.title,s.workspace_title_snapshot) END,
			p.id
		ORDER BY SUM(s.active_seconds) DESC,s.workspace_id
	`, date)
	if err != nil {
		return activity.DayDetail{}, err
	}
	defer rows.Close()
	detail := activity.DayDetail{Date: date, Workspaces: []activity.WorkspaceBreakdown{}}
	for rows.Next() {
		var item activity.WorkspaceBreakdown
		var deleted int
		if err := rows.Scan(&item.WorkspaceID, &item.Title, &deleted, &item.ActiveSeconds); err != nil {
			return activity.DayDetail{}, err
		}
		item.Deleted = deleted == 1
		detail.ActiveSeconds += item.ActiveSeconds
		detail.Workspaces = append(detail.Workspaces, item)
	}
	return detail, rows.Err()
}
