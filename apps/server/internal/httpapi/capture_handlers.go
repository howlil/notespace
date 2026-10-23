package httpapi

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/capture"
)

func (a API) listCaptures(w http.ResponseWriter, r *http.Request) {
	items, err := a.captures.List(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, items)
}

func (a API) getCapture(w http.ResponseWriter, r *http.Request) {
	item, err := a.captures.Get(r.Context(), r.PathValue("captureId"))
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, item)
}

func (a API) createCapture(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if !decode(w, r, &body) {
		return
	}
	item, err := a.captures.Create(r.Context(), body.Content)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusCreated, item)
}

func (a API) updateCapture(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
		Version int    `json:"version"`
	}
	if !decode(w, r, &body) {
		return
	}
	item, err := a.captures.Update(r.Context(), r.PathValue("captureId"), body.Version, body.Content)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, item)
}

func (a API) deleteCapture(w http.ResponseWriter, r *http.Request) {
	version, err := expectedVersion(r)
	if err != nil || version == nil {
		fail(w, capture.ErrInvalid)
		return
	}
	if err := a.captures.Delete(r.Context(), r.PathValue("captureId"), *version); err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusNoContent, nil)
}

func (a API) organizeCapture(w http.ResponseWriter, r *http.Request) {
	var request capture.Organize
	if !decode(w, r, &request) {
		return
	}
	item, err := a.captures.Organize(r.Context(), r.PathValue("captureId"), request)
	if err != nil {
		fail(w, err)
		return
	}
	send(w, http.StatusOK, item)
}
