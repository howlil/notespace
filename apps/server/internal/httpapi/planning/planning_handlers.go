package planninghttp

import (
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

func (a Handler) WorkspacePlan(w http.ResponseWriter, r *http.Request) {
	plan, err := a.planning.GetPlan(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, plan)
}

func (a Handler) CreateMilestone(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	item, err := a.planning.CreateMilestoneIdempotent(r.Context(), r.PathValue("id"), body.Title, r.Header.Get("Idempotency-Key"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusCreated, item)
}

func (a Handler) UpdateMilestone(w http.ResponseWriter, r *http.Request) {
	var body planning.MilestonePatch
	if !transport.Decode(w, r, &body) {
		return
	}
	item, err := a.planning.UpdateMilestone(r.Context(), r.PathValue("id"), r.PathValue("milestoneId"), body)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, item)
}

func (a Handler) DeleteMilestone(w http.ResponseWriter, r *http.Request) {
	version, err := transport.ExpectedVersion(r)
	if err != nil || version == nil {
		transport.Fail(w, planning.ErrInvalid)
		return
	}
	if err := a.planning.DeleteMilestone(r.Context(), r.PathValue("id"), r.PathValue("milestoneId"), *version); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusNoContent, nil)
}

func (a Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title       string  `json:"title"`
		MilestoneID *string `json:"milestoneId"`
		PlannedFor  string  `json:"plannedFor"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	item, err := a.planning.CreateTaskWithDateIdempotent(r.Context(), r.PathValue("id"), body.MilestoneID, body.Title, body.PlannedFor, r.Header.Get("Idempotency-Key"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusCreated, item)
}

func (a Handler) UpdateTask(w http.ResponseWriter, r *http.Request) {
	var body planning.TaskPatch
	if !transport.Decode(w, r, &body) {
		return
	}
	item, err := a.planning.UpdateTask(r.Context(), r.PathValue("id"), r.PathValue("taskId"), body)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, item)
}

func (a Handler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	version, err := transport.ExpectedVersion(r)
	if err != nil || version == nil {
		transport.Fail(w, planning.ErrInvalid)
		return
	}
	if err := a.planning.DeleteTask(r.Context(), r.PathValue("id"), r.PathValue("taskId"), *version); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusNoContent, nil)
}

func (a Handler) TodayTasks(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	today, err := a.planning.Today(r.Context(), date)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, today)
}

func (a Handler) InboxTasks(w http.ResponseWriter, r *http.Request) {
	inbox, err := a.planning.Inbox(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, inbox)
}

func (a Handler) UnassignedTasks(w http.ResponseWriter, r *http.Request) {
	projection, err := a.planning.Unassigned(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, projection)
}

func (a Handler) GetAnyTask(w http.ResponseWriter, r *http.Request) {
	item, err := a.planning.GetTask(r.Context(), r.PathValue("taskId"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, item)
}

func (a Handler) CreateStandaloneTask(w http.ResponseWriter, r *http.Request) {
	// Compatibility route: existing clients may use /api/tasks, but all new
	// writes need an explicit Workspace destination.
	var body struct {
		Title       string `json:"title"`
		WorkspaceID string `json:"workspaceId"`
		PlannedFor  string `json:"plannedFor"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	item, err := a.planning.CreateTaskWithDateIdempotent(r.Context(), body.WorkspaceID, nil, body.Title, body.PlannedFor, r.Header.Get("Idempotency-Key"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusCreated, item)
}

func (a Handler) AssignStandaloneTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WorkspaceID string `json:"workspaceId"`
		Version     int    `json:"version"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	item, err := a.planning.AssignStandaloneTask(r.Context(), r.PathValue("taskId"), body.WorkspaceID, body.Version)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, item)
}

func (a Handler) UpdateAnyTask(w http.ResponseWriter, r *http.Request) {
	var body planning.TaskPatch
	if !transport.Decode(w, r, &body) {
		return
	}
	item, err := a.planning.UpdateAnyTask(r.Context(), r.PathValue("taskId"), body)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, item)
}

func (a Handler) DeleteAnyTask(w http.ResponseWriter, r *http.Request) {
	version, err := transport.ExpectedVersion(r)
	if err != nil || version == nil {
		transport.Fail(w, planning.ErrInvalid)
		return
	}
	if err := a.planning.DeleteAnyTask(r.Context(), r.PathValue("taskId"), *version); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusNoContent, nil)
}
