package httpapi

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/planning"
)

func (a API) workspacePlan(w http.ResponseWriter, r *http.Request) {
	plan, err := a.planning.GetPlan(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, plan)
}

func (a API) createMilestone(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
	}
	if !decode(w, r, &body) {
		return
	}
	item, err := a.planning.CreateMilestone(r.Context(), r.PathValue("id"), body.Title)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusCreated, item)
}

func (a API) updateMilestone(w http.ResponseWriter, r *http.Request) {
	var body planning.MilestonePatch
	if !decode(w, r, &body) {
		return
	}
	item, err := a.planning.UpdateMilestone(r.Context(), r.PathValue("id"), r.PathValue("milestoneId"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, item)
}

func (a API) deleteMilestone(w http.ResponseWriter, r *http.Request) {
	version, err := expectedVersion(r)
	if err != nil || version == nil {
		fail(w, planning.ErrInvalid)
		return
	}
	if err := a.planning.DeleteMilestone(r.Context(), r.PathValue("id"), r.PathValue("milestoneId"), *version); err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}

func (a API) createTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title       string  `json:"title"`
		MilestoneID *string `json:"milestoneId"`
	}
	if !decode(w, r, &body) {
		return
	}
	item, err := a.planning.CreateTask(r.Context(), r.PathValue("id"), body.MilestoneID, body.Title)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusCreated, item)
}

func (a API) updateTask(w http.ResponseWriter, r *http.Request) {
	var body planning.TaskPatch
	if !decode(w, r, &body) {
		return
	}
	item, err := a.planning.UpdateTask(r.Context(), r.PathValue("id"), r.PathValue("taskId"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, item)
}

func (a API) deleteTask(w http.ResponseWriter, r *http.Request) {
	version, err := expectedVersion(r)
	if err != nil || version == nil {
		fail(w, planning.ErrInvalid)
		return
	}
	if err := a.planning.DeleteTask(r.Context(), r.PathValue("id"), r.PathValue("taskId"), *version); err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}

func (a API) todayTasks(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	today, err := a.planning.Today(r.Context(), date)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, today)
}

func (a API) getAnyTask(w http.ResponseWriter, r *http.Request) {
	item, err := a.planning.GetTask(r.Context(), r.PathValue("taskId"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, item)
}

func (a API) createStandaloneTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title      string `json:"title"`
		PlannedFor string `json:"plannedFor"`
	}
	if !decode(w, r, &body) {
		return
	}
	item, err := a.planning.CreateStandaloneTask(r.Context(), body.Title, body.PlannedFor)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusCreated, item)
}

func (a API) updateAnyTask(w http.ResponseWriter, r *http.Request) {
	var body planning.TaskPatch
	if !decode(w, r, &body) {
		return
	}
	item, err := a.planning.UpdateAnyTask(r.Context(), r.PathValue("taskId"), body)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, item)
}

func (a API) deleteAnyTask(w http.ResponseWriter, r *http.Request) {
	version, err := expectedVersion(r)
	if err != nil || version == nil {
		fail(w, planning.ErrInvalid)
		return
	}
	if err := a.planning.DeleteAnyTask(r.Context(), r.PathValue("taskId"), *version); err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}
