package noteshttp

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	"github.com/howlil/notespace/apps/server/internal/note"
)

type Handler struct{ notes *note.Service }

func New(notes *note.Service) Handler { return Handler{notes: notes} }

func (h Handler) Get(w http.ResponseWriter, r *http.Request) {
	value, err := h.notes.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, value)
}

func (h Handler) Backlinks(w http.ResponseWriter, r *http.Request) {
	value, err := h.notes.Backlinks(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, value)
}

func (h Handler) Update(w http.ResponseWriter, r *http.Request) {
	var request note.UpdateRequest
	if !transport.Decode(w, r, &request) {
		return
	}
	value, err := h.notes.Update(r.Context(), r.PathValue("id"), request)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, value)
}

func (h Handler) CreateInstance(w http.ResponseWriter, r *http.Request) {
	var request note.CreateInstanceRequest
	if !transport.Decode(w, r, &request) {
		return
	}
	value, err := h.notes.CreateInstance(r.Context(), r.PathValue("id"), request)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, value)
}

// Delete removes an empty Note that no Canvas places. It is not an instance-delete alias (K8).
func (h Handler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.notes.DeleteEmpty(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h Handler) DeleteInstance(w http.ResponseWriter, r *http.Request) {
	var request note.DeleteInstanceRequest
	if !transport.Decode(w, r, &request) {
		return
	}
	value, err := h.notes.DeleteInstance(r.Context(), r.PathValue("id"), r.PathValue("instanceId"), request)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, value)
}
