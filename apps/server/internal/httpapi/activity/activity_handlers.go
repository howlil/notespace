package activityhttp

import (
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

func (a Handler) ActivitySessions(w http.ResponseWriter, r *http.Request) {
	limit, err := transport.ParseIntQuery(r, "limit", 12)
	if err != nil {
		transport.Fail(w, activity.ErrInvalid)
		return
	}
	sessions, err := a.activities.ListActivities(r.Context(), limit)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, sessions)
}

func (a Handler) ActivityHeartbeat(w http.ResponseWriter, r *http.Request) {
	var body activity.ActivityHeartbeat
	if !transport.Decode(w, r, &body) {
		return
	}
	session, err := a.activities.RecordActivity(r.Context(), r.PathValue("sessionId"), body)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, session)
}

func (a Handler) DeleteActivitySession(w http.ResponseWriter, r *http.Request) {
	if err := a.activities.DeleteActivity(r.Context(), r.PathValue("sessionId")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 204, nil)
}

func (a Handler) ActivityStats(w http.ResponseWriter, r *http.Request) {
	stats, err := a.activities.GetGlobalStats(r.Context(), r.URL.Query().Get("date"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, stats)
}

func (a Handler) Activity(w http.ResponseWriter, r *http.Request) {
	data, err := a.activities.GetActivity(r.Context(), r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, data)
}

func (a Handler) DayDetail(w http.ResponseWriter, r *http.Request) {
	data, err := a.activities.GetDayDetail(r.Context(), r.PathValue("date"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, 200, data)
}
