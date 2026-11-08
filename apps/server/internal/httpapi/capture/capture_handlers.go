package capturehttp

import (
	"github.com/howlil/notespace/apps/server/internal/httpapi/internal/transport"
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/capture"
)

func (a Handler) ListCaptures(w http.ResponseWriter, r *http.Request) {
	items, err := a.captures.List(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, items)
}

func (a Handler) GetCapture(w http.ResponseWriter, r *http.Request) {
	item, err := a.captures.Get(r.Context(), r.PathValue("captureId"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, item)
}

func (a Handler) CreateCapture(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	item, err := a.captures.Create(r.Context(), body.Content)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusCreated, item)
}

func (a Handler) UpdateCapture(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
		Version int    `json:"version"`
	}
	if !transport.Decode(w, r, &body) {
		return
	}
	item, err := a.captures.Update(r.Context(), r.PathValue("captureId"), body.Version, body.Content)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, item)
}

func (a Handler) DeleteCapture(w http.ResponseWriter, r *http.Request) {
	version, err := transport.ExpectedVersion(r)
	if err != nil || version == nil {
		transport.Fail(w, capture.ErrInvalid)
		return
	}
	if err := a.captures.Delete(r.Context(), r.PathValue("captureId"), *version); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusNoContent, nil)
}

func (a Handler) OrganizeCapture(w http.ResponseWriter, r *http.Request) {
	var request capture.Organize
	if !transport.Decode(w, r, &request) {
		return
	}
	item, err := a.captures.Organize(r.Context(), r.PathValue("captureId"), request)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.Send(w, http.StatusOK, item)
}
