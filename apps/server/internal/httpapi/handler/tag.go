package handler

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

func (h *Handler) ListTags(w http.ResponseWriter, r *http.Request) {
	tags, err := h.deps.Library.ListTags(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, tags)
}

func (h *Handler) CreateTag(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	tag, err := h.deps.Library.CreateTag(r.Context(), body.Name)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusCreated, tag)
}

func (h *Handler) RenameTag(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	tag, err := h.deps.Library.RenameTag(r.Context(), r.PathValue("id"), body.Name)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, tag)
}

func (h *Handler) DeleteTag(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.DeleteTag(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) AssignNoteTag(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TagID string `json:"tagId"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	if err := h.deps.Library.AssignNoteTag(r.Context(), r.PathValue("id"), body.TagID); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) RemoveNoteTag(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.RemoveNoteTag(r.Context(), r.PathValue("id"), r.PathValue("tagId")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) BatchUpdateNoteTags(w http.ResponseWriter, r *http.Request) {
	var body domain.BatchNoteTagsRequest
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	if err := h.deps.Library.BatchUpdateNoteTags(r.Context(), body); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}
