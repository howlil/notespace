package handler

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

func (h *Handler) ListNotes(w http.ResponseWriter, r *http.Request) {
	query, err := transport.ParseNoteListQuery(r)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	result, err := h.deps.Library.ListNotes(r.Context(), query)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, result)
}

func (h *Handler) GetNote(w http.ResponseWriter, r *http.Request) {
	value, err := h.deps.Library.GetNote(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, value)
}

func (h *Handler) GetNoteInfo(w http.ResponseWriter, r *http.Request) {
	info, err := h.deps.Library.GetNoteInfo(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, info)
}

func (h *Handler) UpdateNote(w http.ResponseWriter, r *http.Request) {
	var request domain.UpdateNoteRequest
	if !transport.DecodeJSON(w, r, &request) {
		return
	}
	value, err := h.deps.Library.UpdateNote(r.Context(), r.PathValue("id"), request)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, value)
}

func (h *Handler) CreateNoteInstance(w http.ResponseWriter, r *http.Request) {
	var request domain.CreateNoteInstanceRequest
	if !transport.DecodeJSON(w, r, &request) {
		return
	}
	value, err := h.deps.Library.CreateNoteInstance(r.Context(), r.PathValue("id"), request)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, value)
}

func (h *Handler) DeleteEmptyNote(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.DeleteEmptyNote(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) DeleteNoteInstance(w http.ResponseWriter, r *http.Request) {
	var request domain.DeleteNoteInstanceRequest
	if !transport.DecodeJSON(w, r, &request) {
		return
	}
	value, err := h.deps.Library.DeleteNoteInstance(r.Context(), r.PathValue("id"), r.PathValue("instanceId"), request)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, value)
}

func (h *Handler) TrashNote(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.TrashNote(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) ListTrashedNotes(w http.ResponseWriter, r *http.Request) {
	items, err := h.deps.Library.ListTrashedNotes(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, items)
}

func (h *Handler) RestoreTrashedNote(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.RestoreTrashedNote(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) DeleteTrashedNote(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.DeleteTrashedNote(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}
