package httpapi

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/activity"
)

func (a API) activitySessions(w http.ResponseWriter, r *http.Request) {
	limit, err := parseIntQuery(r, "limit", 12)
	if err != nil {
		fail(w, activity.ErrInvalid)
		return
	}
	sessions, err := a.activities.ListActivities(r.Context(), limit)
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
	session, err := a.activities.RecordActivity(r.Context(), r.PathValue("sessionId"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, session)
}

func (a API) deleteActivitySession(w http.ResponseWriter, r *http.Request) {
	if err := a.activities.DeleteActivity(r.Context(), r.PathValue("sessionId")); err != nil {
		fail(w, err)
		return
	}
	send(w, 204, nil)
}

func (a API) activityStats(w http.ResponseWriter, r *http.Request) {
	stats, err := a.activities.GetGlobalStats(r.Context(), r.URL.Query().Get("date"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, stats)
}

func (a API) activity(w http.ResponseWriter, r *http.Request) {
	data, err := a.activities.GetActivity(r.Context(), r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}

func (a API) dayDetail(w http.ResponseWriter, r *http.Request) {
	data, err := a.activities.GetDayDetail(r.Context(), r.PathValue("date"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, 200, data)
}
