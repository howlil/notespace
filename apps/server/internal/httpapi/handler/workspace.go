package handler

import (
	"net/http"

	"github.com/howlil/notespace/apps/server/internal/domain"
	"github.com/howlil/notespace/apps/server/internal/httpapi/transport"
)

func (h *Handler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	query, err := transport.ParseWorkspaceQuery(r)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	page, err := h.deps.Library.ListWorkspaces(r.Context(), query)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, page)
}

func (h *Handler) CreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID       string  `json:"id"`
		Title    string  `json:"title"`
		ParentID *string `json:"parentId"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	p, err := h.deps.Library.CreateWorkspaceWithID(r.Context(), body.ID, body.Title, body.ParentID)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	w.Header().Set("Location", "/api/workspaces/"+p.ID)
	transport.SendJSON(w, http.StatusCreated, p)
}

func (h *Handler) GetWorkspace(w http.ResponseWriter, r *http.Request) {
	p, err := h.deps.Library.GetWorkspace(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, p)
}

func (h *Handler) RenameWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title         string  `json:"title"`
		ExpectedTitle *string `json:"expectedTitle"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	p, err := h.deps.Library.RenameWorkspace(r.Context(), r.PathValue("id"), body.Title, body.ExpectedTitle)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, p)
}

func (h *Handler) MoveWorkspaceParent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ParentID         *string               `json:"parentId"`
		ExpectedParentID domain.OptionalString `json:"expectedParentId"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	p, err := h.deps.Library.MoveWorkspaceParent(r.Context(), r.PathValue("id"), body.ParentID, body.ExpectedParentID)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, p)
}

func (h *Handler) ReparentWorkspaceChildren(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TargetParentID *string `json:"targetParentId"`
	}
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	moved, err := h.deps.Library.ReparentWorkspaceChildren(r.Context(), r.PathValue("id"), body.TargetParentID)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, map[string]int{"moved": moved})
}

func (h *Handler) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	version, err := transport.ExpectedVersion(r)
	if err != nil || version == nil {
		transport.Fail(w, domain.ErrWorkspaceInvalid)
		return
	}
	if err := h.deps.Library.TrashWorkspace(r.Context(), r.PathValue("id"), *version); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) ListTrash(w http.ResponseWriter, r *http.Request) {
	items, err := h.deps.Library.ListTrash(r.Context())
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, items)
}

func (h *Handler) RestoreTrash(w http.ResponseWriter, r *http.Request) {
	value, err := h.deps.Library.RestoreTrashedWorkspace(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, value)
}

func (h *Handler) DeleteTrash(w http.ResponseWriter, r *http.Request) {
	if err := h.deps.Library.DeleteTrashedWorkspace(r.Context(), r.PathValue("id")); err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendNoContent(w)
}

func (h *Handler) ResolveLegacyCategory(w http.ResponseWriter, r *http.Request) {
	workspaceID, found, err := h.deps.Library.ResolveLegacyCategory(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	if !found {
		transport.Fail(w, domain.ErrWorkspaceNotFound)
		return
	}
	transport.SendJSON(w, http.StatusOK, map[string]*string{"workspaceId": workspaceID})
}

func (h *Handler) GetCanvas(w http.ResponseWriter, r *http.Request) {
	canvas, err := h.deps.Library.GetCanvasState(r.Context(), r.PathValue("id"))
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, canvas)
}

func (h *Handler) UpdateCanvas(w http.ResponseWriter, r *http.Request) {
	var body domain.CanvasUpdate
	if !transport.DecodeJSON(w, r, &body) {
		return
	}
	canvas, err := h.deps.Library.UpdateCanvas(r.Context(), r.PathValue("id"), body)
	if err != nil {
		transport.Fail(w, err)
		return
	}
	transport.SendJSON(w, http.StatusOK, canvas)
}
