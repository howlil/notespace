package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/howlil/notespace/apps/server/internal/planning"
	"github.com/howlil/notespace/apps/server/internal/project"
	"github.com/howlil/notespace/apps/server/internal/activity"
)

func (a API) studySessions(w http.ResponseWriter, r *http.Request) {
	limit, err := parseIntQuery(r, "limit", 8)
	if err != nil {
		fail(w, activity.ErrInvalid)
		return
	}
	sessions, err := a.activity.ListSessions(r.Context(), r.PathValue("id"), limit)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, sessions)
}

func (a API) studyHeartbeat(w http.ResponseWriter, r *http.Request) {
	var body activity.Heartbeat
	if !decode(w, r, &body) {
		return
	}
	p, err := a.service.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	session, err := a.activity.Record(r.Context(), p.ID, p.Title, r.PathValue("sessionId"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, session)
}

func (a API) deleteStudySession(w http.ResponseWriter, r *http.Request) {
	if err := a.activity.DeleteSession(r.Context(), r.PathValue("id"), r.PathValue("sessionId")); err != nil {
		fail(w, err)
		return
	}
	send(w, 204, nil)
}

func (a API) workspaceStudy(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format(activity.DateLayout)
	}
	if _, err := a.service.Get(r.Context(), r.PathValue("id")); err != nil {
		fail(w, err)
		return
	}
	stats, err := a.activity.GetWorkspaceStats(r.Context(), r.PathValue("id"), date)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, stats)
}

func (a API) activitySessions(w http.ResponseWriter, r *http.Request) {
	limit, err := parseIntQuery(r, "limit", 12)
	if err != nil {
		fail(w, activity.ErrInvalid)
		return
	}
	sessions, err := a.activity.ListActivities(r.Context(), limit)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, sessions)
}

func (a API) activityHeartbeat(w http.ResponseWriter, r *http.Request) {
	var body activity.ActivityHeartbeat
	if !decode(w, r, &body) {
		return
	}

	if body.TaskID != "" {
		task, err := a.planning.GetTask(r.Context(), body.TaskID)
		switch {
		case err == nil:
			body.TaskTitleSnapshot = task.Title
			if task.WorkspaceID != nil {
				if body.WorkspaceID != "" && body.WorkspaceID != *task.WorkspaceID {
					fail(w, planning.ErrInvalid)
					return
				}
				body.WorkspaceID = *task.WorkspaceID
			}
			if strings.TrimSpace(body.Title) == "" {
				body.Title = task.Title
			}
		case errors.Is(err, planning.ErrNotFound) && strings.TrimSpace(body.TaskTitleSnapshot) != "":
			if strings.TrimSpace(body.Title) == "" {
				body.Title = body.TaskTitleSnapshot
			}
		default:
			fail(w, err)
			return
		}
	}

	if body.WorkspaceID != "" {
		workspace, err := a.service.Get(r.Context(), body.WorkspaceID)
		switch {
		case err == nil:
			body.WorkspaceTitleSnapshot = workspace.Title
			if strings.TrimSpace(body.Title) == "" {
				body.Title = workspace.Title
			}
		case errors.Is(err, project.ErrNotFound) && strings.TrimSpace(body.WorkspaceTitleSnapshot) != "":
			if strings.TrimSpace(body.Title) == "" {
				body.Title = body.WorkspaceTitleSnapshot
			}
		default:
			fail(w, err)
			return
		}
	}

	session, err := a.activity.RecordActivity(r.Context(), r.PathValue("sessionId"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, session)
}

func (a API) deleteActivitySession(w http.ResponseWriter, r *http.Request) {
	if err := a.activity.DeleteActivity(r.Context(), r.PathValue("sessionId")); err != nil {
		fail(w, err)
		return
	}
	send(w, 204, nil)
}

func (a API) activityStats(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format(activity.DateLayout)
	}
	stats, err := a.activity.GetGlobalStats(r.Context(), date)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, stats)
}

func (a API) activity(w http.ResponseWriter, r *http.Request) {
	data, err := a.activity.GetActivity(r.Context(), r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}

func (a API) dayDetail(w http.ResponseWriter, r *http.Request) {
	data, err := a.activity.GetDayDetail(r.Context(), r.PathValue("date"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}
